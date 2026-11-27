import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ImportTemplatesDto } from './dto/import-templates.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { TemplateKind } from './models/template.model';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClientIp } from '../auth/decorators/client-ip.decorator';
import { User } from '../users/models/user.model';
import { RequiresLimit } from '../subscriptions/decorators/requires-limit.decorator';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';
import { TemplateCountResolver } from './resolvers/template-count.resolver';

@Controller('templates')
@ApiTags('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @RequiresLimit('template.create', TemplateCountResolver)
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
    @ClientIp() ipAddress: string | null,
  ) {
    return this.templatesService.upsert(user.userId, dto, ipAddress);
  }

  /**
   * Templates the user had in the browser before they were stored here. Deliberately not @RequiresLimit: see
   * TemplatesService.importMany (capped at IMPORT_TOTAL_MAX instead).
   */
  @Post('import')
  importMany(
    @Body() dto: ImportTemplatesDto,
    @CurrentUser() user: User,
    @ClientIp() ipAddress: string | null,
  ) {
    return this.templatesService.importMany(
      user.userId,
      dto.templates,
      ipAddress,
    );
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: ListTemplatesQueryDto) {
    const kind =
      query.kind === 'all'
        ? 'all'
        : query.kind === 'smart'
          ? TemplateKind.SMART
          : TemplateKind.RECORDING;
    return this.templatesService.findAll(user.userId, kind);
  }

  /** How many templates the user has (both kinds): what the extension checks the plan's limit against. */
  @Get('count')
  async count(@CurrentUser() user: User) {
    return { count: await this.templatesService.count(user.userId) };
  }

  @Get(':clientId')
  findOne(@Param('clientId') clientId: string, @CurrentUser() user: User) {
    return this.templatesService.findOneWithPayload(clientId, user.userId);
  }

  @Delete(':clientId')
  @RequiresFeature('template.delete')
  remove(@Param('clientId') clientId: string, @CurrentUser() user: User) {
    return this.templatesService.remove(clientId, user.userId);
  }

  @Post(':clientId/plays')
  incrementPlayCount(
    @Param('clientId') clientId: string,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.incrementPlayCount(clientId, user.userId);
  }
}
