import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { BOOKING_RATE_LIMIT } from './learning.constants';

/**
 * Booking is open to visitors who have not signed in, and every attempt creates a Razorpay order and a
 * row, so a script could fill both. This keeps one IP address to BOOKING_RATE_LIMIT.max attempts per
 * window. It lives in this process's memory (one dyno), which is enough to stop casual abuse.
 */
@Injectable()
export class BookingRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const { max, windowMs } = BOOKING_RATE_LIMIT;

    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      throw new HttpException(
        'Too many booking attempts. Please try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);

    // Keep the map small: drop addresses that have gone quiet.
    if (this.hits.size > 5000) {
      for (const [ip, times] of this.hits) {
        if (!times.some((t) => now - t < windowMs)) this.hits.delete(ip);
      }
    }
    return true;
  }
}
