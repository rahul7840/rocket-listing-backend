import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingGeneratorModule } from '../listing-generator/listing-generator.module';
import { MeeshoCategoriesModule } from '../meesho-categories/meesho-categories.module';
import { SellerAnalysisController } from './seller-analysis.controller';
import { SellerInsightsService } from './seller-analysis.insights';
import { SellerAnalysisService } from './seller-analysis.service';

@Module({
  imports: [AuthModule, MeeshoCategoriesModule, ListingGeneratorModule],
  controllers: [SellerAnalysisController],
  providers: [SellerAnalysisService, SellerInsightsService],
})
export class SellerAnalysisModule {}
