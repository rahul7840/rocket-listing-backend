import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';
import { RecordingStatus } from '../models/recording.model';

export class CreateRecordingDto {
  @IsUUID()
  userId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsEnum(RecordingStatus)
  status?: RecordingStatus;
}
