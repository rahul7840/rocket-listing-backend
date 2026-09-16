import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import {
  IMAGE_VARIANT_PRESETS,
  ImageVariantPreset,
} from '../config/image-variant-presets.config';
import {
  ImageVariantResult,
  ImageVariantsResponse,
} from './dto/image-variants-response.dto';

/**
 * sharp ships mismatched dual (ESM/CJS) type declarations that resolve
 * incorrectly under this project's (legacy "node") moduleResolution, so the
 * library is loaded via plain `require` and typed here with just the
 * chainable surface this service actually uses.
 */
interface RgbColor {
  r: number;
  g: number;
  b: number;
}
interface SharpOutputInfo {
  width: number;
  height: number;
  size: number;
}
interface SharpInstance {
  rotate(): SharpInstance;
  flatten(options: { background: RgbColor }): SharpInstance;
  resize(options: {
    width: number;
    height: number;
    fit: 'inside';
    withoutEnlargement: true;
  }): SharpInstance;
  extend(options: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    background: RgbColor;
  }): SharpInstance;
  jpeg(options: { quality: number }): SharpInstance;
  toBuffer(options: {
    resolveWithObject: true;
  }): Promise<{ data: Buffer; info: SharpOutputInfo }>;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input: Buffer) => SharpInstance = require('sharp');

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const VARIANTS_SUBDIR = 'image-variants';

@Injectable()
export class ImageVariantsService {
  private readonly logger = new Logger(ImageVariantsService.name);
  private readonly uploadRoot: string;
  private readonly publicPath: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const { uploadDir, publicPath } = this.configService.getOrThrow(
      'imageProcessing',
      { infer: true },
    );
    this.uploadRoot = path.resolve(process.cwd(), uploadDir, VARIANTS_SUBDIR);
    this.publicPath = publicPath;
  }

  async generateVariants(
    file?: Express.Multer.File,
  ): Promise<ImageVariantsResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('An image file is required');
    }

    const sourceBuffer = await this.normalizeSource(file.buffer);

    const batchId = randomUUID();
    const batchDir = path.join(this.uploadRoot, batchId);
    await fs.mkdir(batchDir, { recursive: true });

    try {
      const variants = await Promise.all(
        IMAGE_VARIANT_PRESETS.map((preset) =>
          this.buildVariant(sourceBuffer, preset, batchId, batchDir),
        ),
      );
      return { variants };
    } catch (error) {
      // Don't leave a partially-generated batch behind on disk.
      await fs.rm(batchDir, { recursive: true, force: true }).catch(() => {
        this.logger.warn(`Failed to clean up incomplete batch ${batchId}`);
      });
      throw error;
    }
  }

  /**
   * Auto-orients per EXIF and flattens any transparency onto white once,
   * up front, so every variant below is built from the same plain RGB
   * source instead of repeating that work six times.
   */
  private async normalizeSource(buffer: Buffer): Promise<Buffer> {
    try {
      const { data } = await sharp(buffer)
        .rotate()
        .flatten({ background: WHITE })
        .toBuffer({ resolveWithObject: true });
      return data;
    } catch (error) {
      this.logger.debug(error);
      throw new BadRequestException('Uploaded file is not a valid image');
    }
  }

  private async buildVariant(
    sourceBuffer: Buffer,
    preset: ImageVariantPreset,
    batchId: string,
    batchDir: string,
  ): Promise<ImageVariantResult> {
    const resized = sharp(sourceBuffer).resize({
      width: preset.maxWidth,
      height: preset.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const padded = await this.applyPadding(resized, preset.paddingPercent);

    const { data, info } = await padded
      .jpeg({ quality: preset.quality })
      .toBuffer({ resolveWithObject: true });

    const filename = `${preset.id}-${preset.name}.jpg`;
    await fs.writeFile(path.join(batchDir, filename), data);

    return {
      id: preset.id,
      name: preset.name,
      width: info.width,
      height: info.height,
      quality: preset.quality,
      fileSize: info.size ?? data.length,
      format: 'jpeg',
      url: `${this.publicPath}/${VARIANTS_SUBDIR}/${batchId}/${filename}`,
      config: {
        maxWidth: preset.maxWidth,
        maxHeight: preset.maxHeight,
        paddingPercent: preset.paddingPercent,
      },
    };
  }

  /** Adds proportional whitespace around the already-resized image; a no-op when paddingPercent is 0. */
  private async applyPadding(
    pipeline: SharpInstance,
    paddingPercent: number,
  ): Promise<SharpInstance> {
    if (paddingPercent <= 0) {
      return pipeline;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const padX = Math.round((info.width * paddingPercent) / 100);
    const padY = Math.round((info.height * paddingPercent) / 100);

    return sharp(data).extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      background: WHITE,
    });
  }
}
