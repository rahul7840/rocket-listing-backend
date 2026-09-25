import { IsNumber, IsString, Min, MaxLength } from 'class-validator';

export class UpsertProductCostDto {
  @IsString()
  @MaxLength(255)
  sku: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  productCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packagingCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherCost: number;
}
