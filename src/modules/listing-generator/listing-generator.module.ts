import { Module } from '@nestjs/common';
import { ListingGeneratorController } from './listing-generator.controller';
import { ListingGeneratorService } from './listing-generator.service';
import { GeminiClient } from './gemini/gemini.client';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ListingGeneratorController],
  providers: [ListingGeneratorService, GeminiClient],
  exports: [ListingGeneratorService, GeminiClient],
})
export class ListingGeneratorModule {}
