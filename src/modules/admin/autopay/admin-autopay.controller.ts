import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import {
  AutopayStatus,
  AutopaySubscription,
} from '../../payment-gateway/models/autopay-subscription.model';
import { User } from '../../users/models/user.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListAutopayQueryDto } from './dto/list-autopay-query.dto';

/**
 * Back-office view of who has set up autopay (Razorpay Subscriptions), what
 * state each one is in and when the next renewal is due. Read-only.
 */
@Controller('admin/autopay')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminAutopayController {
  constructor(
    @InjectModel(AutopaySubscription)
    private readonly autopayModel: typeof AutopaySubscription,
  ) {}

  @Get()
  async list(@Query() query: ListAutopayQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: WhereOptions = {};
    if (query.status) Object.assign(where, { status: query.status });

    const search = query.search?.trim();
    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      Object.assign(where, {
        [Op.or]: [
          { razorpaySubscriptionId: like },
          { '$user.email$': like },
          { '$user.displayName$': like },
        ],
      });
    }

    const [{ rows, count }, grouped] = await Promise.all([
      this.autopayModel.findAndCountAll({
        where,
        include: [
          { model: User, attributes: ['userId', 'email', 'displayName'] },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
        subQuery: false,
      }),
      this.autopayModel.findAll({
        attributes: [
          'status',
          [
            this.autopayModel.sequelize!.fn(
              'COUNT',
              this.autopayModel.sequelize!.col('autopayId'),
            ),
            'count',
          ],
        ],
        group: ['status'],
        raw: true,
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of grouped as unknown as { status: string; count: string }[]) {
      counts[g.status] = Number(g.count);
    }
    const stopping = await this.autopayModel.count({
      where: {
        status: AutopayStatus.ACTIVE,
        cancelRequestedAt: { [Op.ne]: null },
      },
    });

    return { data: rows, total: count, page, limit, counts, stopping };
  }
}
