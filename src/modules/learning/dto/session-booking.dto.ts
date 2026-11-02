import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { SESSION_SLOTS } from '../learning.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSessionBookingDto {
  @ApiProperty({ example: 'Asha Verma' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ example: '9876543210', description: 'Indian mobile number' })
  @Transform(trim)
  @IsString()
  @Matches(/^(\+?91[\s-]?)?[6-9][\d\s-]{9,13}$/, {
    message: 'Enter a valid 10-digit mobile number',
  })
  phone: string;

  @ApiPropertyOptional({ example: 'I want to start selling sarees' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  goal?: string;

  @ApiPropertyOptional({
    example: '2026-11-10',
    description: 'Day of the session; leave out with slot to choose later',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ enum: SESSION_SLOTS })
  @IsOptional()
  @IsIn([...SESSION_SLOTS])
  slot?: (typeof SESSION_SLOTS)[number];
}

/** The three values Razorpay Checkout hands back on success. */
export class VerifySessionPaymentDto {
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
