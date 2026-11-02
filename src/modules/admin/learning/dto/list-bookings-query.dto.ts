import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SessionBookingStatus } from '../../../learning/models/learning-session-booking.model';

export class ListBookingsQueryDto {
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
  @IsIn(Object.values(SessionBookingStatus))
  status?: SessionBookingStatus;

  /** Matches the name, the phone number or a Razorpay order or payment id. */
  @IsOptional()
  @IsString()
  search?: string;
}
