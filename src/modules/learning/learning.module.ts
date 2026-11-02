import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { BookingRateLimitGuard } from './booking-rate-limit.guard';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningSessionBooking } from './models/learning-session-booking.model';

/** Learning: the paid one-to-one Meesho seller session (bookings, Razorpay payment, webhook hooks). */
@Module({
  // AuthModule: the guards that read the visitor's login token (optional when booking, required for "mine").
  imports: [SequelizeModule.forFeature([LearningSessionBooking]), AuthModule],
  controllers: [LearningController],
  providers: [LearningService, BookingRateLimitGuard],
  exports: [LearningService],
})
export class LearningModule {}
