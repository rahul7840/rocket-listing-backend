import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { RecordingStatus } from '../models/recording.model';

export class CreateRecordingDto {
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
