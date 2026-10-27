import { Injectable } from '@nestjs/common';
import {
  estimateListingPrice,
  ListingPriceResult,
} from './listing-price.algorithm';
import { EstimateListingPriceDto } from './dto/estimate-listing-price.dto';

@Injectable()
export class ListingPriceService {
  estimate(dto: EstimateListingPriceDto): ListingPriceResult {
    return estimateListingPrice(dto.catalog, dto.adjustment);
  }
}
