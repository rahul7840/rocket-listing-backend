import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { BillingInterval } from '../models/payment.model';

export class CreateAutopayDto {
  @ApiProperty({ example: 'PRO' })
  @IsString()
  @MaxLength(32)
  planCode: string;

  @ApiProperty({ enum: BillingInterval })
  @IsIn(Object.values(BillingInterval))
  interval: BillingInterval;
}

/** What Razorpay Checkout hands back after the user approves autopay. */
export class VerifyAutopayDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  razorpay_payment_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  razorpay_subscription_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  razorpay_signature: string;
}
