import { Module } from '@nestjs/common';
import { ListingGeneratorController } from './listing-generator.controller';
import { ListingGeneratorService } from './listing-generator.service';
import { GeminiClient } from './gemini/gemini.client';

@Module({
  controllers: [ListingGeneratorController],
  providers: [ListingGeneratorService, GeminiClient],
  exports: [ListingGeneratorService],
})
export class ListingGeneratorModule {}
