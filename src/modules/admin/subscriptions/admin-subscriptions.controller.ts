import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import {
  UserSubscription,
  SubscriptionStatus,
  SubscriptionSource,
} from '../../subscriptions/models/user-subscription.model';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { Plan } from '../../plans/models/plan.model';
import { User } from '../../users/models/user.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AssignSubscriptionDto } from './dto/assign-subscription.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';

@Controller('admin')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminSubscriptionsController {
  constructor(
    @InjectModel(UserSubscription)
    private readonly subscriptionModel: typeof UserSubscription,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /** Every currently-ACTIVE subscription across all users, joined with Plan + owning User. */
  @Get('subscriptions')
  async findAll(@Query() query: ListSubscriptionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { rows, count } = await this.subscriptionModel.findAndCountAll({
      where: { status: SubscriptionStatus.ACTIVE },
      include: [
        { model: Plan },
        { model: User, attributes: ['userId', 'email', 'displayName'] },
      ],
      limit,
      offset: (page - 1) * limit,
      order: [['startedAt', 'DESC']],
    });

    return { data: rows, total: count, page, limit };
  }

  @Post('users/:userId/subscription')
  assignPlan(
    @Param('userId') userId: string,
    @Body() dto: AssignSubscriptionDto,
  ) {
    return this.subscriptionsService.assignPlan(
      userId,
      dto.planCode,
      SubscriptionSource.ADMIN,
      {
        currentPeriodStart: dto.currentPeriodStart
          ? new Date(dto.currentPeriodStart)
          : undefined,
        currentPeriodEnd: dto.currentPeriodEnd
          ? new Date(dto.currentPeriodEnd)
          : undefined,
      },
    );
  }

  @Post('users/:userId/subscription/expire')
  expire(@Param('userId') userId: string) {
    return this.subscriptionsService.expireSubscription(userId);
  }
}
