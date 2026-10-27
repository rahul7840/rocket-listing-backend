import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingPriceController } from './listing-price.controller';
import { ListingPriceService } from './listing-price.service';

@Module({
  imports: [AuthModule],
  controllers: [ListingPriceController],
  providers: [ListingPriceService],
})
export class ListingPriceModule {}
