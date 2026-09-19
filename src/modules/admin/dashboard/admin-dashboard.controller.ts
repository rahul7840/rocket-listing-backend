import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col } from 'sequelize';
import { User } from '../../users/models/user.model';
import { Template } from '../../templates/models/template.model';
import {
  UserSubscription,
  SubscriptionStatus,
} from '../../subscriptions/models/user-subscription.model';
import { Plan } from '../../plans/models/plan.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('admin/dashboard')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminDashboardController {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Template)
    private readonly templateModel: typeof Template,
    @InjectModel(UserSubscription)
    private readonly subscriptionModel: typeof UserSubscription,
  ) {}

  @Get('summary')
  async summary() {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    const [
      totalUsers,
      activeUsers,
      newUsersLast7Days,
      subscriptionsByPlanRaw,
      totalTemplates,
      templatesLast7Days,
    ] = await Promise.all([
      this.userModel.count(),
      this.userModel.count({ where: { isActive: true } }),
      this.userModel.count({
        where: { createdAt: { [Op.gte]: sevenDaysAgo } },
      }),
      this.subscriptionModel.findAll({
        attributes: [
          [fn('COUNT', col('UserSubscription.userSubscriptionId')), 'count'],
        ],
        where: { status: SubscriptionStatus.ACTIVE },
        include: [{ model: Plan, attributes: ['code'] }],
        group: ['plan.planId', 'plan.code'],
        raw: true,
      }),
      this.templateModel.count(),
      this.templateModel.count({
        where: { createdAt: { [Op.gte]: sevenDaysAgo } },
      }),
    ]);

    const subscriptionsByPlan = (
      subscriptionsByPlanRaw as unknown as Array<{
        'plan.code': string;
        count: string;
      }>
    ).map((row) => ({
      planCode: row['plan.code'],
      count: Number(row.count),
    }));

    return {
      totalUsers,
      activeUsers,
      newUsersLast7Days,
      subscriptionsByPlan,
      totalTemplates,
      templatesLast7Days,
    };
  }
}
