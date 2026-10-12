import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Payment } from './models/payment.model';
import { PaymentWebhookEvent } from './models/payment-webhook-event.model';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentsService } from './payments.service';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  imports: [
    SequelizeModule.forFeature([PaymentWebhookEvent, Payment]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [PaymentGatewayController],
  providers: [RazorpayWebhookService, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentGatewayModule {}
