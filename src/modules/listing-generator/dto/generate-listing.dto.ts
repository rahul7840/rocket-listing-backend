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

  /** One entry per SKU field found in the recording - usually one per variant. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VariantContextDto)
  variants: VariantContextDto[];
}
