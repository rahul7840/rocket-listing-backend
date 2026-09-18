import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ResourceCountResolver } from '../../subscriptions/interfaces/resource-count-resolver.interface';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { Template } from '../models/template.model';
import { CreateTemplateDto } from '../dto/create-template.dto';

/**
 * Backs @RequiresLimit('template.create', ...) on POST /templates. That
 * route is an upsert (see TemplatesService.upsert), so this only counts
 * against the plan's cap when the request is actually creating a new
 * template - resolving `null` for a clientId the user already has lets the
 * guard skip the check entirely for what is really just an update.
 */
@Injectable()
export class TemplateCountResolver implements ResourceCountResolver {
  constructor(
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
  ) {}

  async resolveCurrentCount(
    request: AuthenticatedRequest,
  ): Promise<number | null> {
    const userId = request.user.userId;
    const dto = request.body as CreateTemplateDto;

    const existing = await this.templateModel.findOne({
      where: { clientId: dto.clientId, userId },
    });
    if (existing) {
      return null;
    }

    return this.templateModel.count({ where: { userId } });
  }
}
