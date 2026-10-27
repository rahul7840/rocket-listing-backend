import { Module } from '@nestjs/common';
import { ImageVariantsController } from './image-variants/image-variants.controller';
import { ImageVariantsService } from './image-variants/image-variants.service';
import { ImageZipController } from './image-zip/image-zip.controller';
import { ImageZipService } from './image-zip/image-zip.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Home for non-AI, server-side image tooling (variant generation today;
 * future business logic such as image generation/comparison belongs here too).
 */
@Module({
  imports: [AuthModule],
  controllers: [ImageVariantsController, ImageZipController],
  providers: [ImageVariantsService, ImageZipService],
  exports: [ImageVariantsService],
})
export class ImageProcessingModule {}
