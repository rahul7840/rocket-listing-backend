import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { User } from '../users/models/user.model';
import { BookingRateLimitGuard } from './booking-rate-limit.guard';
import {
  CreateSessionBookingDto,
  VerifySessionPaymentDto,
} from './dto/session-booking.dto';
import { LearningService } from './learning.service';

/**
 * Public on purpose: visitors book the one-to-one session without signing in. Authenticity of a
 * payment comes from Razorpay's signature, and the price is set on the server.
 */
@ApiTags('learning')
@Controller('learning/sessions')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('availability')
  @ApiOperation({ summary: 'Days and start times that are already taken' })
  availability() {
    return this.learning.availability();
  }

  @Post('book')
  @UseGuards(BookingRateLimitGuard, OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Reserve a slot and create the Razorpay order for the session. A signed-in user is linked to it.',
  })
  book(
    @Body() dto: CreateSessionBookingDto,
    @CurrentUser() user: User | undefined,
  ) {
    return this.learning.book(dto, user?.userId);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm the Razorpay Checkout result' })
  verify(@Body() dto: VerifySessionPaymentDto) {
    return this.learning.verify(dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's paid session bookings" })
  mine(@CurrentUser() user: User) {
    return this.learning.listForUser(user.userId);
  }
}
