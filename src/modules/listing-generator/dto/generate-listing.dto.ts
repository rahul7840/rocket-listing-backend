import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One SKU field detected in the recording. `label` is whatever distinguishes
 * this row from the others - a size, a color, a variant name - pulled from
 * the recorded element's nearby text, so Gemini can keep each generated SKU
 * consistent with the variant it belongs to.
 */
export class VariantContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentSku?: string;
}

/** One other filled-in form field (e.g. Color: Black, Fabric: Cotton) - context only, never generated. */
export class ListingDetailDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(200)
  value: string;
}

export class GenerateListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  /** Other values already on the form (colour, fabric, brand, ...) so the name/description fit the product. Optional. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ListingDetailDto)
  details?: ListingDetailDto[];

  /** One entry per SKU field found in the recording - usually one per variant. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VariantContextDto)
  variants: VariantContextDto[];
}
