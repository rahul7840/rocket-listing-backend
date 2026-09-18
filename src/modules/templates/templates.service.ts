import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Template } from './models/template.model';
import { TemplateData } from './models/template-data.model';
import { CreateTemplateDto } from './dto/create-template.dto';

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

  async findAll(userId: string): Promise<TemplateWithPayload[]> {
    const templates = await this.templateModel.findAll({
      where: { userId },
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
