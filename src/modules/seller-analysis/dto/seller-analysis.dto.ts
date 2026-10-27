import { IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';

/**
 * The product the extension read from Meesho's search reply: name, prices, category id, ratings summary, seller state,
 * listing dates and the first photo's link. The service keeps only what the report reads.
 */
export class SellerAnalysisDto {
  @IsObject()
  catalog: Record<string, unknown>;

  /** Percent of orders the reader takes off as returns; none (no deduction) when absent. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  returnRate?: number;
}
