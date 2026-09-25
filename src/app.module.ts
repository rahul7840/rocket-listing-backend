import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ListingGeneratorModule } from './modules/listing-generator/listing-generator.module';
import { ImageProcessingModule } from './modules/image-processing/image-processing.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SubscriptionsHttpModule } from './modules/subscriptions/subscriptions-http.module';
import { UsageModule } from './modules/usage/usage.module';
import { AdminModule } from './modules/admin/admin.module';
import { MeeshoPaymentsModule } from './modules/meesho-payments/meesho-payments.module';
import { ProductCostsModule } from './modules/product-costs/product-costs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RecordingsModule,
    TemplatesModule,
    ListingGeneratorModule,
    ImageProcessingModule,
    PlansModule,
    SubscriptionsModule,
    SubscriptionsHttpModule,
    UsageModule,
    AdminModule,
    MeeshoPaymentsModule,
    ProductCostsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
