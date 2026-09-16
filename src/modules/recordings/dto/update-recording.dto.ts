import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRecordingDto } from './create-recording.dto';

export class UpdateRecordingDto extends PartialType(
  OmitType(CreateRecordingDto, ['userId'] as const),
) {}
