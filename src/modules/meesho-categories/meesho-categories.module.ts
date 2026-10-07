import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { MeeshoCategory } from './models/meesho-category.model';
import { MeeshoCategoriesController } from './meesho-categories.controller';
import { MeeshoCategoriesService } from './meesho-categories.service';

@Module({
  imports: [SequelizeModule.forFeature([MeeshoCategory]), AuthModule],
  controllers: [MeeshoCategoriesController],
  providers: [MeeshoCategoriesService],
  exports: [MeeshoCategoriesService],
})
export class MeeshoCategoriesModule {}
