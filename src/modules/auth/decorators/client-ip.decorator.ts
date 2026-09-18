import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Client IP for the request. `req.ip` already honours X-Forwarded-For when
 * Express's `trust proxy` setting is enabled (see main.ts), so this is safe
 * behind a reverse proxy/load balancer as well as in direct connections.
 */
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.ip ?? request.socket?.remoteAddress ?? null;
});
