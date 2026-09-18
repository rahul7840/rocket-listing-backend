import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserSubscription } from './models/user-subscription.model';
import { PlansModule } from '../plans/plans.module';
import { UsageModule } from '../usage/usage.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionFeatureGuard } from './guards/subscription-feature.guard';
import { SubscriptionLimitGuard } from './guards/subscription-limit.guard';
import { UsageRecordingInterceptor } from './interceptors/usage-recording.interceptor';

@Module({
  imports: [
    SequelizeModule.forFeature([UserSubscription]),
    PlansModule,
    UsageModule,
  ],
  providers: [
    SubscriptionsService,
    SubscriptionFeatureGuard,
    SubscriptionLimitGuard,
    UsageRecordingInterceptor,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionFeatureGuard,
    SubscriptionLimitGuard,
    UsageRecordingInterceptor,
  ],
})
export class SubscriptionsModule {}
