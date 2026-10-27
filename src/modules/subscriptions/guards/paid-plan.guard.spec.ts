import { ExecutionContext } from '@nestjs/common';
import { SubscriptionDeniedException } from '../exceptions/subscription-denied.exception';
import { SubscriptionsService } from '../subscriptions.service';
import { PaidPlanGuard } from './paid-plan.guard';

const contextFor = (userId: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
  }) as unknown as ExecutionContext;

const guardFor = (planCode: string | null): PaidPlanGuard =>
  new PaidPlanGuard({
    getCurrentSubscription: () =>
      Promise.resolve(planCode ? { plan: { code: planCode } } : null),
  } as unknown as SubscriptionsService);

describe('PaidPlanGuard', () => {
  it.each(['PRO', 'MAX', 'ROCKET'])('lets %s through', async (code) => {
    await expect(guardFor(code).canActivate(contextFor('u1'))).resolves.toBe(
      true,
    );
  });

  it('turns Free away with 403', async () => {
    await expect(
      guardFor('FREE').canActivate(contextFor('u1')),
    ).rejects.toBeInstanceOf(SubscriptionDeniedException);
  });

  it('turns away a user with no active subscription', async () => {
    await expect(
      guardFor(null).canActivate(contextFor('u1')),
    ).rejects.toMatchObject({ status: 403 });
  });
});
