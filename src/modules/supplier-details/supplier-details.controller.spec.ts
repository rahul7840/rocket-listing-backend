// The auth guard drags in an ES-module-only JWT package that jest does not transform; the controller is tested without it.
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

import { REQUIRES_LIMIT_KEY } from '../subscriptions/subscription.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/models/user.model';
import { SupplierDetailsController } from './supplier-details.controller';

describe('SupplierDetailsController', () => {
  const user = { userId: 'u1' } as User;
  const standing = { allowed: true, limit: 10, used: 3, remaining: 7 };

  it('counts one use and returns where the user stands', async () => {
    const recordUsage = jest.fn().mockResolvedValue(undefined);
    const checkLimit = jest.fn().mockResolvedValue(standing);
    const controller = new SupplierDetailsController({
      recordUsage,
      checkLimit,
    } as unknown as SubscriptionsService);

    await expect(controller.use(user)).resolves.toBe(standing);
    expect(recordUsage).toHaveBeenCalledWith('u1', 'supplier_detail.show');
    expect(checkLimit).toHaveBeenCalledWith('u1', 'supplier_detail.show');
    // counted once, and only after the check
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('is guarded by the supplier_detail.show limit (the guard turns Free and a used-up month away)', () => {
    const metadata = Reflect.getMetadata(
      REQUIRES_LIMIT_KEY,
      SupplierDetailsController.prototype.use,
    );
    expect(metadata).toEqual({ featureKey: 'supplier_detail.show' });
  });
});
