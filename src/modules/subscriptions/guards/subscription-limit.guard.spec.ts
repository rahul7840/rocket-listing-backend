import { ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { SubscriptionLimitGuard } from './subscription-limit.guard';
import { SubscriptionsService } from '../subscriptions.service';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { ResourceCountResolver } from '../interfaces/resource-count-resolver.interface';
import { EntitlementReason } from '../entitlement.types';
import { RequiresLimitMetadata } from '../subscription.constants';

class FakeResolver implements ResourceCountResolver {
  resolveCurrentCount(): number | null {
    return null;
  }
}

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('SubscriptionLimitGuard', () => {
  function makeGuard(
    metadata: RequiresLimitMetadata | undefined,
    checkLimitResult: object,
    resolveCurrentCount?: jest.Mock,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(metadata),
    } as unknown as Reflector;
    const subscriptionsService = {
      checkLimit: jest.fn().mockResolvedValue(checkLimitResult),
    } as unknown as SubscriptionsService;
    const moduleRef = {
      get: jest.fn().mockReturnValue({ resolveCurrentCount }),
    } as unknown as ModuleRef;
    const guard = new SubscriptionLimitGuard(
      reflector,
      subscriptionsService,
      moduleRef,
    );
    return { guard, subscriptionsService, moduleRef };
  }

  it('allows the request when the usage-based limit has not been reached', async () => {
    const { guard, subscriptionsService } = makeGuard(
      { featureKey: 'listing.create' },
      { allowed: true, reason: EntitlementReason.ALLOWED },
    );
    const request = { user: { userId: 'user-1' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(subscriptionsService.checkLimit).toHaveBeenCalledWith(
      'user-1',
      'listing.create',
      {},
    );
  });

  it('rejects with LIMIT_REACHED once the usage-based limit is hit', async () => {
    const { guard } = makeGuard(
      { featureKey: 'listing.create' },
      {
        allowed: false,
        featureKey: 'listing.create',
        reason: EntitlementReason.LIMIT_REACHED,
        limit: 50,
        used: 50,
        remaining: 0,
        period: 'daily',
      },
    );
    const request = { user: { userId: 'user-1' } };

    const caught: unknown = await guard
      .canActivate(makeContext(request))
      .catch((err: unknown) => err);
    const error = caught as SubscriptionDeniedException;

    expect(error).toBeInstanceOf(SubscriptionDeniedException);
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: EntitlementReason.LIMIT_REACHED,
      limit: 50,
      used: 50,
    });
  });

  it('passes a resolver-provided resource count through to checkLimit', async () => {
    const resolveCurrentCount = jest.fn().mockResolvedValue(5);
    const { guard, subscriptionsService } = makeGuard(
      { featureKey: 'template.create', resolver: FakeResolver },
      {
        allowed: false,
        reason: EntitlementReason.LIMIT_REACHED,
        limit: 5,
        used: 5,
        remaining: 0,
      },
      resolveCurrentCount,
    );
    const request = { user: { userId: 'user-1' }, body: { clientId: 'x' } };

    await guard.canActivate(makeContext(request)).catch(() => undefined);

    expect(resolveCurrentCount).toHaveBeenCalledWith(request);
    expect(subscriptionsService.checkLimit).toHaveBeenCalledWith(
      'user-1',
      'template.create',
      { currentCount: 5 },
    );
  });

  it('skips the limit check entirely when the resolver reports null (e.g. an upsert that is really an update)', async () => {
    const resolveCurrentCount = jest.fn().mockResolvedValue(null);
    const { guard, subscriptionsService } = makeGuard(
      { featureKey: 'template.create', resolver: FakeResolver },
      { allowed: false, reason: EntitlementReason.LIMIT_REACHED },
      resolveCurrentCount,
    );
    const request = {
      user: { userId: 'user-1' },
      body: { clientId: 'existing' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(subscriptionsService.checkLimit).not.toHaveBeenCalled();
  });

  it('is a no-op (always allows) when the route has no @RequiresLimit decorator', async () => {
    const { guard, subscriptionsService } = makeGuard(undefined, {});
    const request = { user: { userId: 'user-1' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(subscriptionsService.checkLimit).not.toHaveBeenCalled();
  });
});
