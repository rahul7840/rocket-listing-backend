import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Schema, Type } from '@google/genai';
import { GeminiClient } from './gemini/gemini.client';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { ListingFieldsResponse } from './dto/listing-fields.response';

/**
 * Only productName/description come from Gemini. SKUs are built locally (see
 * buildSku) instead of asking the model for them - a model call can't
 * guarantee true uniqueness across a batch, and its idea of a "random-looking
 * code" isn't reproducible or auditable. Local generation gets both for free.
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ['productName', 'description'],
};

const SKU_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SKU_CODE_LENGTH = 4;
const MAX_SKU_GENERATION_ATTEMPTS = 25;

@Injectable()
export class ListingGeneratorService {
  private readonly logger = new Logger(ListingGeneratorService.name);

  constructor(private readonly gemini: GeminiClient) {}

  async generate(dto: GenerateListingDto): Promise<ListingFieldsResponse> {
    const prompt = this.buildPrompt(dto);
    const raw = await this.gemini.generateJson<Pick<ListingFieldsResponse, 'productName' | 'description'>>(
      prompt,
      RESPONSE_SCHEMA,
    );
    return this.normalize(raw, dto);
  }

  private buildPrompt(dto: GenerateListingDto): string {
    const lines: string[] = [
      'You are filling in fields on an e-commerce seller listing form. Generate realistic, ready-to-submit values.',
      'Return ONLY JSON matching the given schema - no markdown, no commentary.',
      '',
      'Context:',
      `- Category: ${dto.category ?? 'unspecified'}`,
      `- Source page: ${dto.sourceUrl ?? 'unspecified'}`,
    ];
    if (dto.productName)
      lines.push(
        `- Previously used product name (for inspiration, do not repeat verbatim): ${dto.productName}`,
      );
    if (dto.description)
      lines.push(
        `- Previously used description (for inspiration, do not repeat verbatim): ${dto.description}`,
      );
    if (dto.variants.some((v) => v.label))
      lines.push(
        `- This listing has variants: ${dto.variants.map((v, i) => v.label ?? `variant ${i + 1}`).join(', ')}`,
      );

    lines.push(
      '',
      'Rules:',
      '- productName: a concise, realistic marketplace product title (max ~80 characters).',
      '- description: 2-4 sentences, factual-sounding and appealing, consistent with productName. No fabricated brand names, certifications, or claims not implied by the context.',
    );

    return lines.join('\n');
  }

  private normalize(
    raw: Pick<ListingFieldsResponse, 'productName' | 'description'>,
    dto: GenerateListingDto,
  ): ListingFieldsResponse {
    const productName =
      raw.productName?.trim() || dto.productName || 'Untitled product';
    const description = raw.description?.trim() || dto.description || '';

    const seen = new Set<string>();
    const variants = dto.variants.map((variant) => ({
      sku: this.buildSku(productName, variant.label, seen),
    }));

    return { productName, description, variants };
  }

  /**
   * SKU-<PRODUCT_PREFIX>[-<VARIANT_PREFIX>]-<4-char code>, e.g. "WIRELE-BLK-A3AV" for
   * a "Wireless Mouse" product's "Black" variant. The trailing code is drawn from
   * a CSPRNG (not Date.now/index, which repeat within the same millisecond batch
   * this runs as) and re-rolled against `seen` until it lands on something no
   * earlier variant in this same request produced - guaranteeing every SKU in a
   * batch is unique regardless of how many variants are requested.
   */
  private buildSku(productName: string, variantLabel: string | undefined, seen: Set<string>): string {
    const productPrefix = this.slug(productName, 6) || 'PRODUCT'.slice(0, 6);
    const variantPrefix = this.slug(variantLabel, 4);
    const base = variantPrefix ? `${productPrefix}-${variantPrefix}` : productPrefix;

    let sku = '';
    for (let attempt = 0; attempt < MAX_SKU_GENERATION_ATTEMPTS; attempt += 1) {
      sku = `${base}-${this.randomCode()}`;
      if (!seen.has(sku)) break;
    }
    if (seen.has(sku)) {
      // Astronomically unlikely with a 36^4 code space, but never emit a
      // silent duplicate - widen the code rather than loop forever.
      this.logger.warn('SKU code space exhausted for this batch - widening the fallback code');
      sku = `${base}-${this.randomCode(SKU_CODE_LENGTH + 2)}`;
    }
    seen.add(sku);
    return sku;
  }

  private randomCode(length = SKU_CODE_LENGTH): string {
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += SKU_CODE_ALPHABET[randomInt(SKU_CODE_ALPHABET.length)];
    }
    return out;
  }

  private slug(value: string | undefined, maxLength: number): string {
    return (value ?? '')
      .replace(/[^A-Z0-9]/gi, '')
      .slice(0, maxLength)
      .toUpperCase();
  }
}
