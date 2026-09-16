import { ApiProperty } from '@nestjs/swagger';

class ImageVariantConfig {
  @ApiProperty()
  maxWidth: number;

  @ApiProperty()
  maxHeight: number;

  @ApiProperty()
  paddingPercent: number;
}

export class ImageVariantResult {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  width: number;

  @ApiProperty()
  height: number;

  @ApiProperty()
  quality: number;

  @ApiProperty()
  fileSize: number;

  @ApiProperty({ enum: ['jpeg'] })
  format: 'jpeg';

  @ApiProperty()
  url: string;

  @ApiProperty({ type: ImageVariantConfig })
  config: ImageVariantConfig;
}

export class ImageVariantsResponse {
  @ApiProperty({ type: [ImageVariantResult] })
  variants: ImageVariantResult[];
}
