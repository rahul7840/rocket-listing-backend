import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { RequiresLimitCheck } from '../subscriptions/decorators/requires-limit.decorator';
import { LISTING_PRICE_FEATURE } from '../subscriptions/listing-pro-features';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ListingPriceService } from './listing-price.service';
import { EstimateListingPriceDto } from './dto/estimate-listing-price.dto';

@Controller('listing-price')
@ApiTags('listing-price')
@UseGuards(JwtAuthGuard)
export class ListingPriceController {
  constructor(
    private readonly listingPriceService: ListingPriceService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /** POST /listing-price/estimate - the extracted price fields, the estimated seller listing price and its range. */
  @Post('estimate')
  @RequiresLimitCheck(LISTING_PRICE_FEATURE)
  async estimate(
    @Body() dto: EstimateListingPriceDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.listingPriceService.estimate(dto);
    // Opening the view uses one; moving the shipping slider (an adjustment) re-asks without using up another.
    if (dto.adjustment === undefined) {
      await this.subscriptionsService.recordUsage(
        user.userId,
        LISTING_PRICE_FEATURE,
      );
    }
    return result;
  }
}
