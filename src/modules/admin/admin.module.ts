import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminUser } from './models/admin-user.model';
import { Template } from '../templates/models/template.model';
import { User } from '../users/models/user.model';
import { UserSubscription } from '../subscriptions/models/user-subscription.model';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlansModule } from '../plans/plans.module';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminSubscriptionsController } from './subscriptions/admin-subscriptions.controller';
import { AdminPlansController } from './plans/admin-plans.controller';
import { AdminTemplatesController } from './templates/admin-templates.controller';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';

/**
 * Back-office API, entirely additive to the app: its own auth (AdminAuthModule,
 * separate JWT secret from the extension-facing AuthModule), and read/write
 * access into the existing users/subscriptions/plans/templates data by
 * reusing their services (UsersService, SubscriptionsService, PlansService)
 * rather than duplicating business logic. TemplatesModule doesn't export the
 * Template model and SubscriptionsModule doesn't export the UserSubscription
 * model, so both are registered directly here for the cross-user admin
 * queries (AdminTemplatesController, AdminDashboardController,
 * AdminSubscriptionsController) that the user-scoped services don't support.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([AdminUser, Template, UserSubscription, User]),
    AdminAuthModule,
    UsersModule,
    SubscriptionsModule,
    PlansModule,
  ],
  controllers: [
    AdminUsersController,
    AdminSubscriptionsController,
    AdminPlansController,
    AdminTemplatesController,
    AdminDashboardController,
  ],
})
export class AdminModule {}
