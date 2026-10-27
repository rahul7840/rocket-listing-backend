import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListingPriceService } from './listing-price.service';
import { EstimateListingPriceDto } from './dto/estimate-listing-price.dto';

@Controller('listing-price')
@ApiTags('listing-price')
@UseGuards(JwtAuthGuard)
export class ListingPriceController {
  constructor(private readonly listingPriceService: ListingPriceService) {}

  /** POST /listing-price/estimate - the extracted price fields, the estimated seller listing price and its range. */
  @Post('estimate')
  estimate(@Body() dto: EstimateListingPriceDto) {
    return this.listingPriceService.estimate(dto);
  }
}
