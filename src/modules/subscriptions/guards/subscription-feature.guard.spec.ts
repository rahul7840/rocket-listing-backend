import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionFeatureGuard } from './subscription-feature.guard';
import { SubscriptionsService } from '../subscriptions.service';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { EntitlementReason } from '../entitlement.types';

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('SubscriptionFeatureGuard', () => {
  function makeGuard(
    featureKeyOnRoute: string | undefined,
    canUseResult: object,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(featureKeyOnRoute),
    } as unknown as Reflector;
    const subscriptionsService = {
      canUse: jest.fn().mockResolvedValue(canUseResult),
    } as unknown as SubscriptionsService;
    const guard = new SubscriptionFeatureGuard(reflector, subscriptionsService);
    return { guard, subscriptionsService };
  }

  it('allows the request through when the feature is enabled', async () => {
    const { guard } = makeGuard('marketplace.sync', {
      allowed: true,
      reason: EntitlementReason.ALLOWED,
    });
    const request = { user: { userId: 'user-1' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('rejects with a structured, machine-readable error when the feature is disabled', async () => {
    const { guard } = makeGuard('marketplace.sync', {
      allowed: false,
      featureKey: 'marketplace.sync',
      reason: EntitlementReason.FEATURE_DISABLED,
      limit: null,
      used: null,
      remaining: null,
      period: null,
    });
    const request = { user: { userId: 'user-1' } };

    const caught: unknown = await guard
      .canActivate(makeContext(request))
      .catch((err: unknown) => err);
    const error = caught as SubscriptionDeniedException;

    expect(error).toBeInstanceOf(SubscriptionDeniedException);
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: EntitlementReason.FEATURE_DISABLED,
      featureKey: 'marketplace.sync',
    });
  });

  it('is a no-op (always allows) when the route has no @RequiresFeature decorator', async () => {
    const { guard, subscriptionsService } = makeGuard(undefined, {});
    const request = { user: { userId: 'user-1' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(subscriptionsService.canUse).not.toHaveBeenCalled();
  });

  it('never trusts a plan/feature value forged onto the request - only userId reaches the service', async () => {
    const { guard, subscriptionsService } = makeGuard('marketplace.sync', {
      allowed: false,
      reason: EntitlementReason.FEATURE_DISABLED,
    });
    // Simulates a tampered client sending a fake elevated plan alongside the real user.
    const request = {
      user: { userId: 'user-1' },
      body: { plan: 'ROCKET', featureAccess: { 'marketplace.sync': true } },
      headers: { 'x-plan': 'ROCKET' },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      SubscriptionDeniedException,
    );
    expect(subscriptionsService.canUse).toHaveBeenCalledWith(
      'user-1',
      'marketplace.sync',
    );
    expect(subscriptionsService.canUse).toHaveBeenCalledTimes(1);
  });
});
