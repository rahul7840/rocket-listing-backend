import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, JwtPayload } from '../auth.service';
import { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * For public endpoints that do something extra for a signed-in user. A valid bearer token puts the
 * user on `request.user`; a missing, expired or bad token is ignored and the request goes on as a
 * visitor, never as an error.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return true;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        header.slice('Bearer '.length),
      );
      request.user = await this.authService.resolveUserById(payload.sub);
    } catch {
      // Treated as a visitor.
    }
    return true;
  }
}
