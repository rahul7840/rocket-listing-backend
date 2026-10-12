import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { TemplateSource } from '../../../templates/models/template.model';

export class ListTemplatesQueryDto {
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

  /** Matches the template name, its domain, or the owner's email / name. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(TemplateSource))
  source?: TemplateSource;

  /** Only templates owned by this user. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** "recent" (default) or "plays" for most-played first. */
  @IsOptional()
  @IsIn(['recent', 'plays'])
  sort?: 'recent' | 'plays';
}
