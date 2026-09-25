import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ProductCostsModule } from '../product-costs/product-costs.module';
import { MeeshoPayment } from './models/meesho-payment.model';
import { MeeshoPaymentDetail } from './models/meesho-payment-detail.model';
import { MeeshoPaymentSyncLog } from './models/meesho-payment-sync-log.model';
import { MeeshoPaymentsController } from './meesho-payments.controller';
import { MeeshoPaymentsService } from './meesho-payments.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MeeshoPayment,
      MeeshoPaymentDetail,
      MeeshoPaymentSyncLog,
    ]),
    AuthModule,
    SubscriptionsModule,
    ProductCostsModule,
  ],
  controllers: [MeeshoPaymentsController],
  providers: [MeeshoPaymentsService],
  exports: [MeeshoPaymentsService],
})
export class MeeshoPaymentsModule {}
