import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/models/user.model';
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
  ) {}

  /** Cheap lookup used by JwtAuthGuard on every request. */
  async resolveUserById(id: string): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer exists or is disabled');
    }
    return user;
  }

  /** Sign-up/login: upserts the row and refreshes profile fields + lastLoginAt. */
  async findOrCreateAndSync(profile: GoogleProfile): Promise<User> {
    const [user] = await this.userModel.findOrCreate({
      where: { googleId: profile.googleId },
      defaults: { ...profile, lastLoginAt: new Date() },
    });

    return user.update({
      email: profile.email,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      lastLoginAt: new Date(),
    });
  }

  issueToken(user: User): string {
    const payload: JwtPayload = { sub: user.id };
    return this.jwtService.sign(payload);
  }
}
