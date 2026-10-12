import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PaymentWebhookEvent } from './models/payment-webhook-event.model';
import { PaymentGatewayController } from './payment-gateway.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  imports: [SequelizeModule.forFeature([PaymentWebhookEvent])],
  controllers: [PaymentGatewayController],
  providers: [RazorpayWebhookService],
  exports: [RazorpayWebhookService],
})
export class PaymentGatewayModule {}
