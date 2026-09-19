import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class AssignSubscriptionDto {
  @IsString()
  planCode: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodStart?: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;
}
