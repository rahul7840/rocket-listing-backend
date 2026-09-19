import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
} from 'class-validator';
import {
  PlanFeaturePeriod,
  PlanFeatureValueType,
} from '../../../plans/models/plan-feature.model';

export class UpsertPlanFeatureDto {
  @IsEnum(PlanFeatureValueType)
  valueType: PlanFeatureValueType;

  @IsOptional()
  @IsBoolean()
  boolValue?: boolean;

  @IsOptional()
  @IsInt()
  limitValue?: number;

  @IsOptional()
  @IsBoolean()
  isUnlimited?: boolean;

  @IsOptional()
  @IsEnum(PlanFeaturePeriod)
  period?: PlanFeaturePeriod;

  @IsOptional()
  @IsObject()
  metadata?: object;
}
