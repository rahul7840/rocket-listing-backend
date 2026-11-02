import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { User } from '../users/models/user.model';
import { AutopayService } from './autopay.service';
import { AutopaySubscription } from './models/autopay-subscription.model';
import { Payment } from './models/payment.model';
import { PaymentWebhookEvent } from './models/payment-webhook-event.model';
import { RazorpayPlan } from './models/razorpay-plan.model';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentsService } from './payments.service';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PaymentWebhookEvent,
      Payment,
      User,
      AutopaySubscription,
      RazorpayPlan,
    ]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [PaymentGatewayController],
  providers: [RazorpayWebhookService, PaymentsService, AutopayService],
  exports: [PaymentsService],
})
export class PaymentGatewayModule {}
