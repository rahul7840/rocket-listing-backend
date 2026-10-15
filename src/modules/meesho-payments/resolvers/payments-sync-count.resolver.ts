import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ResourceCountResolver } from '../../subscriptions/interfaces/resource-count-resolver.interface';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { MeeshoPaymentSyncLog } from '../models/meesho-payment-sync-log.model';

/**
 * Backs @RequiresLimit('meesho.payments.sync', ...) on POST /meesho-payments/sync.
 *
 * The plan row decides how the limit works: a daily row (Pro and above) is counted from the usage counters and
 * ignores this resolver; a row with no period (Free: one sync, ever) is a standing cap, and this is the count it
 * is checked against - every successful payments sync the user has ever made.
 */
@Injectable()
export class PaymentsSyncCountResolver implements ResourceCountResolver {
  constructor(
    @InjectModel(MeeshoPaymentSyncLog)
    private readonly syncLogModel: typeof MeeshoPaymentSyncLog,
  ) {}

  resolveCurrentCount(request: AuthenticatedRequest): Promise<number> {
    return countPaymentsSyncs(this.syncLogModel, request.user.userId);
  }
}

export function countPaymentsSyncs(
  syncLogModel: typeof MeeshoPaymentSyncLog,
  userId: string,
): Promise<number> {
  return syncLogModel.count({
    where: { userId, kind: 'payments', status: 'success' },
  });
}
