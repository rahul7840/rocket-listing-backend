import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { fn, col } from 'sequelize';
import { Template } from '../../templates/models/template.model';
import { User } from '../../users/models/user.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';

@Controller('admin/templates')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminTemplatesController {
  constructor(
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
  ) {}

  /** Cross-user, paginated - each row includes its owning user's email. */
  @Get()
  async findAll(@Query() query: ListTemplatesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { rows, count } = await this.templateModel.findAndCountAll({
      include: [
        { model: User, attributes: ['userId', 'email', 'displayName'] },
      ],
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });

    return { data: rows, total: count, page, limit };
  }

  /** Template counts grouped by source, plus the top 10 users by template count. */
  @Get('stats')
  async stats() {
    const bySource = await this.templateModel.findAll({
      attributes: ['source', [fn('COUNT', col('templateId')), 'count']],
      group: ['source'],
      raw: true,
    });

    const topUsersRaw = await this.templateModel.findAll({
      attributes: [
        'userId',
        [fn('COUNT', col('Template.templateId')), 'templateCount'],
      ],
      include: [{ model: User, attributes: ['email', 'displayName'] }],
      group: [
        'Template.userId',
        'user.userId',
        'user.email',
        'user.displayName',
      ],
      order: [[fn('COUNT', col('Template.templateId')), 'DESC']],
      limit: 10,
      subQuery: false,
    });

    return {
      bySource: bySource.map((row: any) => ({
        source: row.source,
        count: Number(row.count),
      })),
      topUsers: topUsersRaw.map((row: any) => ({
        userId: row.userId,
        email: row.user?.email ?? null,
        displayName: row.user?.displayName ?? null,
        templateCount: Number(row.get('templateCount')),
      })),
    };
  }
}
