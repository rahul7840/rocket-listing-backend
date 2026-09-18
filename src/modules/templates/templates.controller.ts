import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClientIp } from '../auth/decorators/client-ip.decorator';
import { User } from '../users/models/user.model';

@Controller('templates')
@ApiTags('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
    @ClientIp() ipAddress: string | null,
  ) {
    return this.templatesService.upsert(user.userId, dto, ipAddress);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.templatesService.findAll(user.userId);
  }

  @Delete(':clientId')
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
