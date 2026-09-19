import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../../users/users.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin/users')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  async findAll(@Query() query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.usersService.findAll({
      page,
      limit,
      search: query.search,
      isActive: query.isActive,
    });
    return { data, total, page, limit };
  }

  /** User detail plus their current subscription and full plan history - findOne() 404s if the id doesn't exist. */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    const [currentSubscription, subscriptionHistory] = await Promise.all([
      this.subscriptionsService.getCurrentSubscription(id),
      this.subscriptionsService.getHistory(id),
    ]);
    return { ...user.toJSON(), currentSubscription, subscriptionHistory };
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.setActive(id, dto.isActive);
  }
}
