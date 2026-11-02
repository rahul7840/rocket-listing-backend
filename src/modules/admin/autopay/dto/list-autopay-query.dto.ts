import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AutopayStatus } from '../../../payment-gateway/models/autopay-subscription.model';

export class ListAutopayQueryDto {
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
  @IsIn(Object.values(AutopayStatus))
  status?: AutopayStatus;

  /** Matches the user's email or name, or the Razorpay subscription id. */
  @IsOptional()
  @IsString()
  search?: string;
}
