import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminUser } from '../models/admin-user.model';

export interface AdminJwtPayload {
  sub: string;
}

/**
 * Owns admin sign-in end to end and issues/verifies admin session JWTs.
 * The JwtService injected here is the admin-scoped instance registered by
 * AdminAuthModule (its own secret, ADMIN_JWT_SECRET) - never the app-wide
 * one from AuthModule, so an admin token and a user token are never
 * interchangeable.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(AdminUser)
    private readonly adminUserModel: typeof AdminUser,
    private readonly jwtService: JwtService,
  ) {}

  /** Cheap lookup used by AdminJwtAuthGuard on every request. */
  async resolveAdminById(id: string): Promise<AdminUser> {
    const admin = await this.adminUserModel.findByPk(id);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException(
        'Admin account no longer exists or is disabled',
      );
    }
    return admin;
  }

  async login(email: string, password: string): Promise<AdminUser> {
    const admin = await this.adminUserModel.findOne({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, admin.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return admin.update({ lastLoginAt: new Date() });
  }

  issueToken(admin: AdminUser): string {
    const payload: AdminJwtPayload = { sub: admin.adminUserId };
    return this.jwtService.sign(payload);
  }
}
