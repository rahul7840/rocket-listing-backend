import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImageVariantsService } from './image-variants.service';
import { ImageVariantsResponse } from './dto/image-variants-response.dto';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

const ALLOWED_MIME_TYPES = /^image\/(jpe?g|png|webp)$/;
// Read directly like src/config/configuration.ts - dotenv/config in main.ts
// has already populated process.env by the time this module is evaluated.
const MAX_UPLOAD_SIZE_BYTES =
  parseInt(process.env.IMAGE_MAX_UPLOAD_MB ?? '15', 10) * 1024 * 1024;

@Controller('image-variants')
@ApiTags('image-variants')
export class ImageVariantsController {
  constructor(private readonly imageVariantsService: ImageVariantsService) { }

  @Post()
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Generate resized/cropped variants of an uploaded image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({ status: 201, type: ImageVariantsResponse })
  generate(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_SIZE_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_MIME_TYPES }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<ImageVariantsResponse> {
    return this.imageVariantsService.generateVariants(file);
  }
}
