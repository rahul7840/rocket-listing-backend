import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';
import { RequiresLimit } from '../subscriptions/decorators/requires-limit.decorator';
import {
  FinanceRangeDays,
  MeeshoPaymentsService,
  PAYMENT_DETAILS_FEATURE,
  PAYMENTS_SYNC_FEATURE,
} from './meesho-payments.service';
import { SyncMeeshoPaymentsDto } from './dto/sync-meesho-payments.dto';
import { SyncMeeshoPaymentDetailsDto } from './dto/sync-meesho-payment-details.dto';

@Controller('meesho-payments')
@ApiTags('meesho-payments')
@UseGuards(JwtAuthGuard)
export class MeeshoPaymentsController {
  constructor(private readonly paymentsService: MeeshoPaymentsService) {}

  /** Where the user's data ends, what their plan allows, and which payouts still need details. */
  @Get('sync-state')
  syncState(@CurrentUser() user: User) {
    return this.paymentsService.getSyncState(user.userId);
  }

  /** Seller payment/profit analytics for the website Finance dashboard - see getAnalytics for what's computed. */
  @Get('analytics')
  analytics(
    @Query('range') range: string | undefined,
    @CurrentUser() user: User,
  ) {
    const days = range === '7' || range === '90' ? Number(range) : 30;
    return this.paymentsService.getAnalytics(
      user.userId,
      days as FinanceRangeDays,
    );
  }

  /** Profitability, product-level margin and return-loss analytics for the Finance page. */
  @Get('profitability')
  profitability(
    @Query('range') range: string | undefined,
    @CurrentUser() user: User,
  ) {
    const days = range === '7' || range === '90' ? Number(range) : 30;
    return this.paymentsService.getProfitability(
      user.userId,
      days as FinanceRangeDays,
    );
  }

  /** Pro and above; one successful sync per day. */
  @Post('sync')
  @RequiresLimit(PAYMENTS_SYNC_FEATURE)
  sync(@Body() dto: SyncMeeshoPaymentsDto, @CurrentUser() user: User) {
    return this.paymentsService.sync(user.userId, dto);
  }

  /** Max and Rocket only: order lines of one payout. */
  @Post('details/sync')
  @RequiresFeature(PAYMENT_DETAILS_FEATURE)
  syncDetails(
    @Body() dto: SyncMeeshoPaymentDetailsDto,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.syncDetails(user.userId, dto);
  }

  /** Payout rows for the Finance page's Payments table - one row per synced payment date. */
  @Get()
  list(@Query('range') range: string | undefined, @CurrentUser() user: User) {
    const days = range === '7' || range === '90' ? Number(range) : 30;
    return this.paymentsService.listPayments(
      user.userId,
      days as FinanceRangeDays,
    );
  }

  // NOTE: keep this last - it's a catch-all path param and would otherwise
  // shadow the static routes above (analytics, sync-state, etc.).
  /** One payout plus its synced order lines, for the "View details" drawer. */
  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.paymentsService.getPaymentDetail(user.userId, id);
  }
}
