import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService, JwtPayload } from '../auth.service';
import { User } from '../../users/models/user.model';

export interface AuthenticatedRequest extends Request {
  user: User;
}

/** Verifies our own JWT (issued by POST /auth/google) - no calls to Google here. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    const payload = await this.jwtService.verifyAsync<JwtPayload>(token).catch(() => {
      throw new UnauthorizedException('Invalid or expired session');
    });

    request.user = await this.authService.resolveUserById(payload.sub);
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
