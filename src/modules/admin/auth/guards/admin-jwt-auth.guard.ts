import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AdminAuthService, AdminJwtPayload } from '../admin-auth.service';
import { AdminUser } from '../../models/admin-user.model';

export interface AdminAuthenticatedRequest extends Request {
  admin: AdminUser;
}

/** Verifies our own admin JWT (issued by POST /admin/auth/login) against the admin-only secret. */
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const token = this.extractToken(request);

    const payload = await this.jwtService
      .verifyAsync<AdminJwtPayload>(token)
      .catch(() => {
        throw new UnauthorizedException('Invalid or expired admin session');
      });

    request.admin = await this.adminAuthService.resolveAdminById(payload.sub);
    return true;
  }

  private extractToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
