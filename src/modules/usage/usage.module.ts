import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsageCounter } from './models/usage-counter.model';
import { UsageService } from './usage.service';

@Module({
  imports: [SequelizeModule.forFeature([UsageCounter])],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
