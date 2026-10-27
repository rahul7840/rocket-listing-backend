import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequiresLimit } from '../subscriptions/decorators/requires-limit.decorator';
import { LISTING_REPORT_FEATURE } from '../subscriptions/listing-pro-features';
import { SellerAnalysisDto } from './dto/seller-analysis.dto';
import { SellerAnalysisService } from './seller-analysis.service';

@Controller('seller-analysis')
@ApiTags('seller-analysis')
@UseGuards(JwtAuthGuard)
export class SellerAnalysisController {
  constructor(private readonly sellerAnalysis: SellerAnalysisService) {}

  @Post('pdf')
  @RequiresLimit(LISTING_REPORT_FEATURE)
  @ApiOperation({
    summary: 'Build the seller analysis PDF from product data the caller read',
  })
  async pdf(
    @Body() dto: SellerAnalysisDto,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, filename } = await this.sellerAnalysis.generate(
      dto.catalog,
      dto.returnRate,
    );
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
        'Access-Control-Expose-Headers': 'Content-Disposition',
      })
      .send(pdf);
  }
}
