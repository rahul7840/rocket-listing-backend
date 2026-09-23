import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { RequiresFeature } from '../subscriptions/decorators/requires-feature.decorator';
import { RequiresLimit } from '../subscriptions/decorators/requires-limit.decorator';
import {
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
}
