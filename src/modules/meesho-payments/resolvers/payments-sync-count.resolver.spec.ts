import { PaymentsSyncCountResolver } from './payments-sync-count.resolver';
import { MeeshoPaymentSyncLog } from '../models/meesho-payment-sync-log.model';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

describe('PaymentsSyncCountResolver', () => {
  it('counts only this user\'s successful payments syncs (what Free\'s one-sync-ever cap is checked against)', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const resolver = new PaymentsSyncCountResolver({ count } as unknown as typeof MeeshoPaymentSyncLog);

    const result = await resolver.resolveCurrentCount({ user: { userId: 'u1' } } as AuthenticatedRequest);

    expect(result).toBe(1);
    expect(count).toHaveBeenCalledWith({ where: { userId: 'u1', kind: 'payments', status: 'success' } });
  });
});
