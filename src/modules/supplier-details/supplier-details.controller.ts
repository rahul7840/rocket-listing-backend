import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { RequiresLimitCheck } from '../subscriptions/decorators/requires-limit.decorator';
import { LISTING_SUPPLIER_FEATURE } from '../subscriptions/listing-pro-features';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('supplier-details')
@ApiTags('supplier-details')
@UseGuards(JwtAuthGuard)
export class SupplierDetailsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * POST /supplier-details/use - counts one product's supplier details against the plan. The extension reads the details
   * from Meesho itself, so this is only the plan's gate and counter: 403 (FEATURE_DISABLED on Free, LIMIT_REACHED once the
   * month's allowance is used) turns the request away, otherwise one use is recorded and where the user stands is returned.
   */
  @Post('use')
  @RequiresLimitCheck(LISTING_SUPPLIER_FEATURE)
  async use(@CurrentUser() user: User) {
    await this.subscriptionsService.recordUsage(
      user.userId,
      LISTING_SUPPLIER_FEATURE,
    );
    return this.subscriptionsService.checkLimit(
      user.userId,
      LISTING_SUPPLIER_FEATURE,
    );
  }
}
