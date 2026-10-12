import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { BillingInterval } from '../models/payment.model';

export class CreateOrderDto {
  @ApiProperty({ example: 'PRO' })
  @IsString()
  @MaxLength(32)
  planCode: string;

  @ApiProperty({ enum: BillingInterval })
  @IsIn(Object.values(BillingInterval))
  interval: BillingInterval;
}

/** The three values Razorpay Checkout hands back on success. */
export class VerifyPaymentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  razorpay_order_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  razorpay_payment_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  razorpay_signature: string;
}
