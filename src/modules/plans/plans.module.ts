import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Plan } from './models/plan.model';
import { PlanFeature } from './models/plan-feature.model';
import { PlansService } from './plans.service';

@Module({
  imports: [SequelizeModule.forFeature([Plan, PlanFeature])],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
