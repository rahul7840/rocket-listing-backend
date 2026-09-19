import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminAuthenticatedRequest } from '../guards/admin-jwt-auth.guard';

/** The authenticated AdminUser row, attached to the request by AdminJwtAuthGuard. */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    return request.admin;
  },
);
