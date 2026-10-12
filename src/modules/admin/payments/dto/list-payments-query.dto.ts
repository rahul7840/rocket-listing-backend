import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  BillingInterval,
  PaymentStatus,
} from '../../../payment-gateway/models/payment.model';

export class ListPaymentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  status?: PaymentStatus;

  @IsOptional()
  @IsIn(Object.values(BillingInterval))
  interval?: BillingInterval;

  @IsOptional()
  @IsString()
  planCode?: string;

  /** Matches the user's email/name or a Razorpay order / payment id. */
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaymentsSummaryQueryDto {
  /** Length of the analysed window in days; compared against the window before it. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}
