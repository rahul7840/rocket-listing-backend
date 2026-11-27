import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { TemplateKind, TemplateSource } from '../models/template.model';

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

  /** Absent = a step recording, which is what every client sent before Smart Templates were stored here. */
  @IsOptional()
  @IsEnum(TemplateKind)
  kind?: TemplateKind;
}
