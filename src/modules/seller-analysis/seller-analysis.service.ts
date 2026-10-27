import { Injectable, Logger } from '@nestjs/common';
import { MeeshoCategoriesService } from '../meesho-categories/meesho-categories.service';
import {
  allowedImageUrl,
  zipStem,
} from '../image-processing/image-zip/image-zip.service';
import { renderReportPdf } from './seller-analysis.pdf';
import { buildReport, ReportModel } from './seller-analysis.report';
import {
  InsightFacts,
  SellerInsightsService,
} from './seller-analysis.insights';

/** Only the parts of the product the report reads; anything else the caller sent is dropped. */
const KEPT_FIELDS = [
  'name',
  'hero_product_name',
  'sub_sub_category_name',
  'category_id',
  'min_product_price',
  'min_catalog_price',
  'original_price',
  'total_discount_in_rs',
  'special_offers',
  'deal',
  'catalog_reviews_summary',
  'state_code',
  'activated_iso',
  'created_iso',
  'image',
  'url',
  // Listing text the model mines for better keywords
  'description',
  'full_details',
  'slug',
] as const;

const IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface SharpInstance {
  flatten(options: { background: string }): SharpInstance;
  resize(options: {
    width: number;
    height: number;
    fit: 'inside';
    withoutEnlargement: true;
  }): SharpInstance;
  jpeg(options: { quality: number }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input: Buffer) => SharpInstance = require('sharp');

export interface AnalysisPdf {
  pdf: Buffer;
  filename: string;
}

@Injectable()
export class SellerAnalysisService {
  private readonly logger = new Logger(SellerAnalysisService.name);

  constructor(
    private readonly categories: MeeshoCategoriesService,
    private readonly insights: SellerInsightsService,
  ) {}

  async generate(
    catalog: Record<string, unknown>,
    returnRate?: number,
  ): Promise<AnalysisPdf> {
    const kept: Record<string, unknown> = {};
    for (const key of KEPT_FIELDS) {
      if (catalog[key] !== undefined) kept[key] = catalog[key];
    }

    const [path, image] = await Promise.all([
      this.resolveCategory(kept.category_id, kept.sub_sub_category_name),
      this.fetchImage(kept.image),
    ]);
    const model = buildReport(kept, path, new Date(), returnRate);
    // The model call comes after the category is known (it uses the path) and never blocks the report: no answer, no section.
    model.insights = await this.insights.generate(insightFacts(model, kept));
    const pdf = await renderReportPdf(model, { image });
    return {
      pdf,
      filename: `${zipStem(model.title)}-rocket-listing-analysis.pdf`,
    };
  }

  /** super > category > sub category > sub-sub category for the product's category id; never fails the report. */
  private async resolveCategory(
    id: unknown,
    ownName: unknown,
  ): Promise<string[] | undefined> {
    const n = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(n) || n <= 0) return undefined;
    try {
      return await this.categories.pathFor(
        n,
        typeof ownName === 'string' ? ownName : undefined,
      );
    } catch (error) {
      this.logger.warn(
        `category lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /** The product photo as a JPEG (PDFKit cannot embed WebP). Meesho's image host only; undefined when it cannot be had. */
  private async fetchImage(link: unknown): Promise<Buffer | undefined> {
    const url = typeof link === 'string' ? allowedImageUrl(link) : undefined;
    if (!url) return undefined;
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const declared = Number(response.headers.get('content-length'));
      if (declared > MAX_IMAGE_BYTES) return undefined;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES)
        return undefined;
      return await sharp(bytes)
        .flatten({ background: '#ffffff' })
        .resize({
          width: 600,
          height: 600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch (error) {
      this.logger.warn(
        `product image skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}

/** What the language model is told about the listing: only values the report already shows. */
export function insightFacts(
  m: ReportModel,
  kept: Record<string, unknown> = {},
): InsightFacts {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;
  return {
    title: m.title,
    categoryPath: m.categoryPath,
    price: m.price?.current,
    originalPrice: m.price?.original,
    discountPct: m.price?.discountPct,
    ratingAverage: m.rating?.average,
    ratingCount: m.rating?.count,
    positivePct: m.rating?.positivePct,
    negativePct: m.rating?.negativePct,
    listingAge: m.listed?.age,
    soldFrom: m.soldFrom,
    estimatedSellerPrice: m.sellerPrice?.mid,
    subSubCategory: str(kept.sub_sub_category_name),
    slug: str(kept.slug),
    description: str(kept.description),
    details: str(kept.full_details),
  };
}
