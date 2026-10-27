import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { zipSync } from 'fflate';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const CONCURRENCY = 6;

/** Only Meesho's own image hosts: the endpoint must never fetch arbitrary addresses on a caller's behalf. */
const ALLOWED_HOST = /(^|\.)meesho\.com$/i;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export interface ZipResult {
  zip: Buffer;
  filename: string;
  /** How many of the requested images made it into the zip. */
  included: number;
}

/** A link the backend may fetch: https, a Meesho host, no credentials, default port. Undefined otherwise. */
export function allowedImageUrl(raw: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username || url.password || url.port) return undefined;
  return ALLOWED_HOST.test(url.hostname) ? url : undefined;
}

/** A safe file-name stem: lower-case letters, digits and dashes. */
export function zipStem(name: string | undefined): string {
  const stem = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return stem || 'listing';
}

@Injectable()
export class ImageZipService {
  private readonly logger = new Logger(ImageZipService.name);

  async zipImages(urls: string[], name?: string): Promise<ZipResult> {
    const unique = [...new Set(urls)];
    const allowed = unique
      .map((u) => allowedImageUrl(u))
      .filter((u): u is URL => u !== undefined);
    if (allowed.length === 0) {
      throw new BadRequestException('No downloadable Meesho image links.');
    }

    const files: Array<{ data: Uint8Array; ext: string } | undefined> =
      new Array(allowed.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < allowed.length) {
        const index = next++;
        files[index] = await this.fetchImage(allowed[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, allowed.length) }, worker),
    );

    const entries: Record<string, Uint8Array> = {};
    let total = 0;
    let count = 0;
    for (const file of files) {
      if (!file) continue;
      total += file.data.length;
      if (total > MAX_TOTAL_BYTES) break;
      count += 1;
      entries[`${String(count).padStart(2, '0')}.${file.ext}`] = file.data;
    }
    if (count === 0) {
      throw new BadGatewayException('Could not download any of the images.');
    }

    // Images are already compressed, so storing them (level 0) is faster and no bigger.
    const zip = Buffer.from(zipSync(entries, { level: 0 }));
    return {
      zip,
      filename: `${zipStem(name)}-rocket-listing-img.zip`,
      included: count,
    };
  }

  private async fetchImage(
    url: URL,
  ): Promise<{ data: Uint8Array; ext: string } | undefined> {
    try {
      // redirect: 'error' - a redirect could point somewhere the host check never saw.
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const type = (response.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const ext = EXTENSIONS[type];
      if (!ext) return undefined;
      const declared = Number(response.headers.get('content-length'));
      if (declared > MAX_IMAGE_BYTES) return undefined;
      const data = new Uint8Array(await response.arrayBuffer());
      return data.length > 0 && data.length <= MAX_IMAGE_BYTES
        ? { data, ext }
        : undefined;
    } catch (error) {
      this.logger.warn(
        `image skipped (${url.pathname}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
