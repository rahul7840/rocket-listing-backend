import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/models/user.model';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { GoogleProfile } from './services/google-auth.service';

export interface JwtPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
    private readonly jwtService: JwtService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  /** At most one lastActiveAt write per user per window, however many requests (or page refreshes) arrive. */
  private static readonly ACTIVE_WRITE_INTERVAL_MS = 10 * 60 * 1000;

  /** userId -> when this process last wrote lastActiveAt; skips the DB entirely for repeat requests inside the window. */
  private readonly lastActiveWrites = new Map<string, number>();

  /** Cheap lookup used by JwtAuthGuard on every request. */
  async resolveUserById(id: string): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Account no longer exists or is disabled',
      );
    }
    this.touchLastActive(user);
    return user;
  }

  /**
   * Records "the user was just active", fire-and-forget so it never slows or fails a request.
   * Throttled twice: an in-memory check (no DB cost for bursts), then a conditional UPDATE that only
   * writes when the stored value is older than the window - which also keeps several server instances
   * from writing the same user at once. `silent` leaves updatedAt alone.
   */
  private touchLastActive(user: User): void {
    const now = Date.now();
    const window = AuthService.ACTIVE_WRITE_INTERVAL_MS;
    const lastWrite = this.lastActiveWrites.get(user.userId) ?? 0;
    const stored = user.lastActiveAt
      ? new Date(user.lastActiveAt).getTime()
      : 0;
    if (now - Math.max(lastWrite, stored) < window) return;

    this.lastActiveWrites.set(user.userId, now);
    void this.userModel
      .update(
        { lastActiveAt: new Date(now) },
        {
          where: {
            userId: user.userId,
            [Op.or]: [
              { lastActiveAt: null },
              { lastActiveAt: { [Op.lt]: new Date(now - window) } },
            ],
          },
          silent: true,
        },
      )
      .catch((error: unknown) => {
        this.lastActiveWrites.delete(user.userId);
        this.logger.warn(
          `lastActiveAt update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /** Sign-up/login: upserts the row and refreshes profile fields + lastLoginAt. */
  async findOrCreateAndSync(profile: GoogleProfile): Promise<User> {
    const [user, created] = await this.userModel.findOrCreate({
      where: { googleId: profile.googleId },
      defaults: {
        ...profile,
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    if (created) {
      await this.subscriptionsService.assignFreePlanIfMissing(user.userId);
    }

    return user.update({
      email: profile.email,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    });
  }

  issueToken(user: User): string {
    const payload: JwtPayload = { sub: user.userId };
    return this.jwtService.sign(payload);
  }
}
