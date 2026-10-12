import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, WhereOptions, fn, col } from 'sequelize';
import { Template } from '../../templates/models/template.model';
import { TemplateData } from '../../templates/models/template-data.model';
import { User } from '../../users/models/user.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';

const OWNER = {
  model: User,
  attributes: ['userId', 'email', 'displayName', 'photoUrl'],
};

@Controller('admin/templates')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminTemplatesController {
  constructor(
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
    @InjectModel(TemplateData)
    private readonly dataModel: typeof TemplateData,
  ) {}

  private query<T extends object>(sql: string) {
    return this.templateModel.sequelize!.query<T>(sql, {
      type: QueryTypes.SELECT,
    });
  }

  /** Cross-user, paginated - each row includes its owning user. */
  @Get()
  async findAll(@Query() query: ListTemplatesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: WhereOptions = {};
    if (query.source) Object.assign(where, { source: query.source });
    if (query.userId) Object.assign(where, { userId: query.userId });
    const search = query.search?.trim();
    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      Object.assign(where, {
        [Op.or]: [
          { name: like },
          { domain: like },
          { '$user.email$': like },
          { '$user.displayName$': like },
        ],
      });
    }

    const { rows, count } = await this.templateModel.findAndCountAll({
      where,
      include: [OWNER],
      limit,
      offset: (page - 1) * limit,
      order:
        query.sort === 'plays'
          ? [
              ['playCount', 'DESC'],
              ['createdAt', 'DESC'],
            ]
          : [['createdAt', 'DESC']],
      subQuery: false,
    });

    return { data: rows, total: count, page, limit };
  }

  /**
   * Everything the admin Templates overview needs in one call: headline totals,
   * the most-played templates, the most active creators (with play totals),
   * source and domain mix, and templates created per day.
   */
  @Get('stats')
  async stats() {
    const [totals, bySource, topPlayed, topCreators, byDomain, daily] =
      await Promise.all([
        this.query<{
          templates: string;
          plays: string;
          creators: string;
          played: string;
        }>(
          `SELECT COUNT(*) AS templates,
                  COALESCE(SUM("playCount"), 0) AS plays,
                  COUNT(DISTINCT "userId") AS creators,
                  COUNT(*) FILTER (WHERE "playCount" > 0) AS played
             FROM templates`,
        ),
        this.templateModel.findAll({
          attributes: ['source', [fn('COUNT', col('templateId')), 'count']],
          group: ['source'],
          raw: true,
        }),
        this.templateModel.findAll({
          where: { playCount: { [Op.gt]: 0 } },
          include: [OWNER],
          order: [
            ['playCount', 'DESC'],
            ['createdAt', 'DESC'],
          ],
          limit: 10,
          attributes: [
            'templateId',
            'name',
            'domain',
            'source',
            'playCount',
            'createdAt',
          ],
        }),
        this.query<{
          userId: string;
          email: string;
          displayName: string | null;
          photoUrl: string | null;
          templateCount: string;
          plays: string;
        }>(
          `SELECT u."userId", u.email, u."displayName", u."photoUrl",
                  COUNT(t."templateId") AS "templateCount",
                  COALESCE(SUM(t."playCount"), 0) AS plays
             FROM templates t JOIN users u ON u."userId" = t."userId"
            GROUP BY u."userId"
            ORDER BY "templateCount" DESC, plays DESC LIMIT 10`,
        ),
        this.query<{ domain: string; count: string; plays: string }>(
          `SELECT domain, COUNT(*) AS count, COALESCE(SUM("playCount"), 0) AS plays
             FROM templates GROUP BY domain ORDER BY count DESC LIMIT 6`,
        ),
        this.query<{ date: string; count: string }>(
          `SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(t."templateId") AS count
             FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d
             LEFT JOIN templates t ON t."createdAt"::date = d::date
            GROUP BY d ORDER BY d`,
        ),
      ]);

    const t = totals[0];
    const templates = Number(t?.templates ?? 0);
    const creators = Number(t?.creators ?? 0);

    return {
      totals: {
        templates,
        plays: Number(t?.plays ?? 0),
        creators,
        playedTemplates: Number(t?.played ?? 0),
        averagePerCreator: creators
          ? Math.round((templates / creators) * 10) / 10
          : 0,
      },
      bySource: bySource.map((row: any) => ({
        source: row.source,
        count: Number(row.count),
      })),
      topPlayed,
      topCreators: topCreators.map((c) => ({
        userId: c.userId,
        email: c.email,
        displayName: c.displayName,
        photoUrl: c.photoUrl,
        templateCount: Number(c.templateCount),
        plays: Number(c.plays),
      })),
      byDomain: byDomain.map((d) => ({
        domain: d.domain,
        count: Number(d.count),
        plays: Number(d.plays),
      })),
      daily: daily.map((d) => ({ date: d.date, count: Number(d.count) })),
    };
  }

  /** One template with its owner and a summary of the recorded steps. */
  @Get(':templateId')
  async findOne(@Param('templateId', ParseUUIDPipe) templateId: string) {
    const template = await this.templateModel.findByPk(templateId, {
      include: [OWNER],
    });
    if (!template) throw new NotFoundException('Template not found');

    const data = await this.dataModel.findOne({
      where: { templateId },
      attributes: ['actions', 'metadata'],
    });
    const actions = (data?.actions ?? []) as Array<{ type?: string }>;
    const stepTypes: Record<string, number> = {};
    for (const action of actions) {
      const key = typeof action?.type === 'string' ? action.type : 'other';
      stepTypes[key] = (stepTypes[key] ?? 0) + 1;
    }

    const ownerTemplateCount = await this.templateModel.count({
      where: { userId: template.userId },
    });

    return {
      ...template.toJSON(),
      stepCount: actions.length,
      stepTypes,
      ownerTemplateCount,
    };
  }
}
