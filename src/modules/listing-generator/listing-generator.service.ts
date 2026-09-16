import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { GeminiClient } from './gemini/gemini.client';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { ListingFieldsResponse } from './dto/listing-fields.response';

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    description: { type: Type.STRING },
    variants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { sku: { type: Type.STRING } },
        required: ['sku'],
      },
    },
  },
  required: ['productName', 'description', 'variants'],
};

@Injectable()
export class ListingGeneratorService {
  private readonly logger = new Logger(ListingGeneratorService.name);

  constructor(private readonly gemini: GeminiClient) {}

  async generate(dto: GenerateListingDto): Promise<ListingFieldsResponse> {
    const prompt = this.buildPrompt(dto);
    const raw = await this.gemini.generateJson<ListingFieldsResponse>(
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

    lines.push(
      '',
      'Rules:',
      '- productName: a concise, realistic marketplace product title (max ~80 characters).',
      '- description: 2-4 sentences, factual-sounding and appealing, consistent with productName. No fabricated brand names, certifications, or claims not implied by the context.',
      `- variants: return exactly ${dto.variants.length} entr${dto.variants.length === 1 ? 'y' : 'ies'}, in the same order as listed below. Each "sku" must be unique across the list, uppercase alphanumeric with optional hyphens, 6-20 characters, and should reflect that variant's label when one is given.`,
      '',
      'Variants (in order):',
    );
    dto.variants.forEach((v, i) => {
      const label = v.label ? v.label : `variant ${i + 1}`;
      const prior = v.currentSku
        ? ` (previous SKU for inspiration, do not repeat verbatim: ${v.currentSku})`
        : '';
      lines.push(`${i + 1}. ${label}${prior}`);
    });

    return lines.join('\n');
  }

  /** Defends against a model response that doesn't line up with the request - wrong length, blank/duplicate SKUs. */
  private normalize(
    raw: ListingFieldsResponse,
    dto: GenerateListingDto,
  ): ListingFieldsResponse {
    const expected = dto.variants.length;
    const variants = Array.from(
      { length: expected },
      (_, i) => raw.variants?.[i],
    );

    const seen = new Set<string>();
    const normalizedVariants = variants.map((v, i) => {
      let sku = (v?.sku ?? '').trim().toUpperCase();
      if (!sku) sku = this.fallbackSku(dto, i);
      let candidate = sku;
      let suffix = 2;
      while (seen.has(candidate)) {
        candidate = `${sku}-${suffix}`;
        suffix += 1;
      }
      seen.add(candidate);
      return { sku: candidate };
    });

    const productName =
      raw.productName?.trim() || dto.productName || 'Untitled product';
    const description = raw.description?.trim() || dto.description || '';

    if (variants.some((v) => !v?.sku)) {
      this.logger.warn(
        'Gemini response missing one or more SKUs - filled with a generated fallback',
      );
    }

    return { productName, description, variants: normalizedVariants };
  }

  private fallbackSku(dto: GenerateListingDto, index: number): string {
    const seed =
      dto.variants[index]?.label
        ?.replace(/[^A-Z0-9]/gi, '')
        .slice(0, 6)
        .toUpperCase() || 'SKU';
    return `${seed}-${Date.now().toString(36).toUpperCase()}-${index}`;
  }
}
