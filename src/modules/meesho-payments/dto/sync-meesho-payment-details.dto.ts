import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MeeshoPaymentDetailItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderNo: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subOrderNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderStatus?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  subOrderContribution: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  orderAmount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  claimsCompensations: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  recoveriesCharges: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  netOrderAmount: number;
}

/** All order lines of ONE payout, addressed by its payment date (the payout's natural key per user). */
export class SyncMeeshoPaymentDetailsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'paymentDate must be yyyy-mm-dd' })
  paymentDate: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => MeeshoPaymentDetailItemDto)
  details: MeeshoPaymentDetailItemDto[];
}
