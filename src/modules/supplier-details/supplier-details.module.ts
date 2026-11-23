import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SupplierDetailsController } from './supplier-details.controller';

@Module({
  imports: [AuthModule, SubscriptionsModule],
  controllers: [SupplierDetailsController],
})
export class SupplierDetailsModule {}
