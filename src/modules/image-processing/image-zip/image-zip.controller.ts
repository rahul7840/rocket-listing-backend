import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequiresFeature } from '../../subscriptions/decorators/requires-feature.decorator';
import { LISTING_IMAGES_FEATURE } from '../../subscriptions/listing-pro-features';
import { ImageZipDto } from './dto/image-zip.dto';
import { ImageZipService } from './image-zip.service';

@Controller('image-zip')
@ApiTags('image-zip')
@UseGuards(JwtAuthGuard)
export class ImageZipController {
  constructor(private readonly imageZipService: ImageZipService) {}

  @Post()
  @RequiresFeature(LISTING_IMAGES_FEATURE)
  @ApiOperation({
    summary: "Download a listing's Meesho images and return them as one zip",
  })
  async zip(@Body() dto: ImageZipDto, @Res() res: Response): Promise<void> {
    const { zip, filename, included } = await this.imageZipService.zipImages(
      dto.urls,
      dto.name,
    );
    res
      .status(200)
      .set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zip.length),
        'X-Images-Included': String(included),
        'Access-Control-Expose-Headers':
          'Content-Disposition, X-Images-Included',
      })
      .send(zip);
  }
}
