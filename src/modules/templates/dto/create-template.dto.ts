import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { TemplateSource } from '../models/template.model';

export class CreateTemplateDto {
  @IsString()
  clientId: string;

  @IsString()
  name: string;

  @IsString()
  domain: string;

  @IsOptional()
  @IsUrl()
  startUrl?: string;

  @IsOptional()
  @IsString()
  startTitle?: string;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsObject()
  metadata?: object;

  @IsOptional()
  @IsEnum(TemplateSource)
  source?: TemplateSource;
}
