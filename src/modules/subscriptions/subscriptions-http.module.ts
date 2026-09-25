import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from './subscriptions.module';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Separate from SubscriptionsModule because SubscriptionsModule is imported
 * by AuthModule (assignFreePlanIfMissing on login) - importing AuthModule
 * back into SubscriptionsModule for JwtAuthGuard would be circular. Mirrors
 * how MeeshoPaymentsModule/TemplatesModule/UsersModule pull in both.
 */
@Module({
  imports: [AuthModule, SubscriptionsModule],
  controllers: [SubscriptionsController],
})
export class SubscriptionsHttpModule {}
