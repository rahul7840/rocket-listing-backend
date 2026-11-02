import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import {
  LearningSessionBooking,
  SessionBookingStatus,
} from '../../learning/models/learning-session-booking.model';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';

/**
 * Back-office view of the one-to-one session bookings: who paid, for which day and start time, and
 * who still has to be given a date. Read-only. Amounts are in paise, as stored.
 */
@Controller('admin/learning')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminLearningController {
  constructor(
    @InjectModel(LearningSessionBooking)
    private readonly bookingModel: typeof LearningSessionBooking,
  ) {}

  @Get('bookings')
  async list(@Query() query: ListBookingsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: WhereOptions = {};
    if (query.status) Object.assign(where, { status: query.status });

    const search = query.search?.trim();
    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      Object.assign(where, {
        [Op.or]: [
          { name: like },
          { phone: like },
          { razorpayOrderId: like },
          { razorpayPaymentId: like },
        ],
      });
    }

    const paidWhere = { status: SessionBookingStatus.PAID };
    const [{ rows, count }, grouped, revenue, toSchedule, needsNewSlot] =
      await Promise.all([
        this.bookingModel.findAndCountAll({
          where,
          order: [['createdAt', 'DESC']],
          limit,
          offset: (page - 1) * limit,
        }),
        this.bookingModel.findAll({
          attributes: [
            'status',
            [
              this.bookingModel.sequelize!.fn(
                'COUNT',
                this.bookingModel.sequelize!.col('bookingId'),
              ),
              'count',
            ],
          ],
          group: ['status'],
          raw: true,
        }),
        this.bookingModel.sum('amount', { where: paidWhere }),
        // Paid, but no day chosen yet: the team has to ask for one.
        this.bookingModel.count({
          where: {
            ...paidWhere,
            sessionDate: null,
            needsNewSlot: false,
          },
        }),
        this.bookingModel.count({
          where: { ...paidWhere, needsNewSlot: true },
        }),
      ]);

    const counts: Record<string, number> = {};
    for (const g of grouped as unknown as { status: string; count: string }[]) {
      counts[g.status] = Number(g.count);
    }

    return {
      data: rows,
      total: count,
      page,
      limit,
      counts,
      revenue: Number(revenue ?? 0),
      toSchedule,
      needsNewSlot,
    };
  }
}
