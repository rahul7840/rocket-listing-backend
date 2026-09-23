import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MeeshoPaymentItemDto {
  /** ISO calendar date (yyyy-mm-dd) - the duplicate-detection key. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'paymentDate must be yyyy-mm-dd' })
  paymentDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  neftId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  orderAmount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  adsCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  programCost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  referral: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  programBenefits: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  netAmount: number;
}

export class SyncMeeshoPaymentsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MeeshoPaymentItemDto)
  payments: MeeshoPaymentItemDto[];
}
