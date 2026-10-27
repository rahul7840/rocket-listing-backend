import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_ZIP_IMAGES = 40;

/** POST /image-zip - the image links of one listing; the reply is a zip of them. */
export class ImageZipDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ZIP_IMAGES)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  urls: string[];

  /** Used for the zip's file name only (cleaned before use). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
