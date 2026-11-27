import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Template, TemplateKind } from './models/template.model';
import { TemplateData } from './models/template-data.model';
import { CreateTemplateDto } from './dto/create-template.dto';

/**
 * Most templates an import may bring a user up to. An import skips the plan's template.create limit (it carries
 * templates the user already had in the browser before they were stored here, often more than a Free plan allows),
 * so this is the ceiling on what it can add.
 */
export const IMPORT_TOTAL_MAX = 200;

export interface ImportResult {
  /** clientIds now stored (created, or already here and updated). */
  saved: string[];
  /** clientIds not stored because the user is at IMPORT_TOTAL_MAX. */
  skipped: string[];
}

/** Template row with its actions/metadata payload flattened back onto it, for API responses. */
export interface TemplateWithPayload extends Record<string, unknown> {
  templateId: string;
  actions: object[];
  metadata: object;
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
    @InjectModel(TemplateData)
    private readonly templateDataModel: typeof TemplateData,
  ) {}

  /** `kind` absent = step recordings only (what clients from before Smart Templates expect); 'all' = both kinds. */
  async findAll(
    userId: string,
    kind: TemplateKind | 'all' = TemplateKind.RECORDING,
  ): Promise<TemplateWithPayload[]> {
    const templates = await this.templateModel.findAll({
      where: kind === 'all' ? { userId } : { userId, kind },
      include: [TemplateData],
      order: [['updatedAt', 'DESC']],
    });
    return templates.map((template) => this.withPayload(template));
  }

  async findByClientId(clientId: string, userId: string): Promise<Template> {
    const template = await this.templateModel.findOne({
      where: { clientId, userId },
      include: [TemplateData],
    });
    if (!template) {
      throw new NotFoundException(`Template ${clientId} not found`);
    }
    return template;
  }

  async upsert(
    userId: string,
    dto: CreateTemplateDto,
    ipAddress: string | null,
  ): Promise<TemplateWithPayload> {
    const { actions, metadata, ...templateFields } = dto;

    const existing = await this.templateModel.findOne({
      where: { clientId: dto.clientId, userId },
    });
    const template = existing
      ? await existing.update({ ...templateFields, ipAddress })
      : await this.templateModel.create({
          ...templateFields,
          userId,
          ipAddress,
        });

    await this.templateDataModel.upsert({
      templateId: template.templateId,
      actions: actions ?? [],
      metadata: metadata ?? {},
    });

    return this.withPayload(
      await this.findByClientId(dto.clientId, userId),
    );
  }

  async findOneWithPayload(
    clientId: string,
    userId: string,
  ): Promise<TemplateWithPayload> {
    return this.withPayload(await this.findByClientId(clientId, userId));
  }

  /** Every template the user has, both kinds - the number template.create's limit is checked against. */
  count(userId: string): Promise<number> {
    return this.templateModel.count({ where: { userId } });
  }

  /**
   * Stores templates the extension kept in the browser before templates were stored here. Not held to the plan's
   * template.create limit (an existing user must not lose templates they already had), only to IMPORT_TOTAL_MAX.
   * One already here is updated, like POST /templates.
   */
  async importMany(
    userId: string,
    dtos: CreateTemplateDto[],
    ipAddress: string | null,
  ): Promise<ImportResult> {
    const result: ImportResult = { saved: [], skipped: [] };
    let total = await this.count(userId);
    for (const dto of dtos) {
      const exists = await this.templateModel.count({
        where: { clientId: dto.clientId, userId },
      });
      if (!exists && total >= IMPORT_TOTAL_MAX) {
        result.skipped.push(dto.clientId);
        continue;
      }
      await this.upsert(userId, dto, ipAddress);
      if (!exists) total += 1;
      result.saved.push(dto.clientId);
    }
    return result;
  }

  async remove(clientId: string, userId: string): Promise<void> {
    const template = await this.findByClientId(clientId, userId);
    await template.destroy();
  }

  async incrementPlayCount(
    clientId: string,
    userId: string,
  ): Promise<Template> {
    const template = await this.findByClientId(clientId, userId);
    return template.increment('playCount');
  }

  /** Merges the 1:1 TemplateData row back onto the template for API consumers. */
  private withPayload(template: Template): TemplateWithPayload {
    const { data, ...rest } = template.toJSON() as Template & {
      data?: TemplateData;
    };
    return {
      ...rest,
      actions: data?.actions ?? [],
      metadata: data?.metadata ?? {},
    };
  }
}
