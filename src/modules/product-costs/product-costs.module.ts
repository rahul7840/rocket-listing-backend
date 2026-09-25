import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { ProductCost } from './models/product-cost.model';
import { ProductCostsController } from './product-costs.controller';
import { ProductCostsService } from './product-costs.service';

@Module({
  imports: [SequelizeModule.forFeature([ProductCost]), AuthModule],
  controllers: [ProductCostsController],
  providers: [ProductCostsService],
  exports: [ProductCostsService],
})
export class ProductCostsModule {}
