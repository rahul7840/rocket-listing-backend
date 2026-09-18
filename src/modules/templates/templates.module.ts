import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Template } from './models/template.model';
import { TemplateData } from './models/template-data.model';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { TemplateCountResolver } from './resolvers/template-count.resolver';

@Module({
  imports: [
    SequelizeModule.forFeature([Template, TemplateData]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateCountResolver],
  exports: [TemplatesService],
})
export class TemplatesModule {}
