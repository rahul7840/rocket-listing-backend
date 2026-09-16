import { Module } from '@nestjs/common';
import { ImageVariantsController } from './image-variants/image-variants.controller';
import { ImageVariantsService } from './image-variants/image-variants.service';

/**
 * Home for non-AI, server-side image tooling (variant generation today;
 * future business logic such as image generation/comparison belongs here too).
 */
@Module({
  controllers: [ImageVariantsController],
  providers: [ImageVariantsService],
  exports: [ImageVariantsService],
})
export class ImageProcessingModule {}
