import { IsNumber, IsObject, IsOptional } from 'class-validator';

/** The pricing parts of one Meesho catalog (min_*_price, original_price, deal, special_offers ...); the algorithm reads them defensively. */
export class EstimateListingPriceDto {
  @IsObject()
  catalog: Record<string, unknown>;

  /** What the user chose on the slider; the default applies when it is missing. */
  @IsOptional()
  @IsNumber()
  adjustment?: number;
}
