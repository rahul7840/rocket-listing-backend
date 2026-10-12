import { PaymentsService } from './payments.service';
import { BillingInterval, PaymentStatus } from './models/payment.model';
import { SubscriptionSource } from '../subscriptions/models/user-subscription.model';

const DAY = 24 * 60 * 60 * 1000;

function build(currentSubscription: unknown) {
  const payment: any = {
    userId: 'u1',
    planCode: 'PRO',
    interval: BillingInterval.MONTHLY,
    amount: 9900,
    fulfilledAt: null,
    status: PaymentStatus.CREATED,
    update: jest.fn(async function (this: any, patch: object) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const paymentModel: any = {
    findOne: jest.fn().mockResolvedValue(payment),
    sequelize: {
      transaction: (cb: (t: unknown) => unknown) =>
        cb({ LOCK: { UPDATE: 'UPDATE' } }),
    },
  };
  const subscriptions: any = {
    getCurrentSubscription: jest.fn().mockResolvedValue(currentSubscription),
    assignPlan: jest.fn(),
    extendCurrentPeriod: jest.fn(),
  };
  const service = new PaymentsService({} as any, paymentModel, subscriptions);
  return { service, payment, subscriptions };
}

describe('PaymentsService.fulfill', () => {
  it('moves a Free user to Pro for 30 days', async () => {
    const { service, payment, subscriptions } = build({
      plan: { code: 'FREE' },
      currentPeriodEnd: null,
    });
    const before = Date.now();

    await service.fulfill('order_1', 'pay_1', 9900);

    expect(subscriptions.assignPlan).toHaveBeenCalledTimes(1);
    const [userId, planCode, source, opts] =
      subscriptions.assignPlan.mock.calls[0];
    expect([userId, planCode, source]).toEqual([
      'u1',
      'PRO',
      SubscriptionSource.PAYMENT,
    ]);
    expect(opts.currentPeriodEnd.getTime() - opts.currentPeriodStart.getTime()).toBe(
      30 * DAY,
    );
    expect(opts.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(subscriptions.extendCurrentPeriod).not.toHaveBeenCalled();
    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.razorpayPaymentId).toBe('pay_1');
    expect(payment.fulfilledAt).toBeInstanceOf(Date);
  });

  it('extends an active Pro plan instead of replacing it', async () => {
    const end = new Date(Date.now() + 10 * DAY);
    const { service, subscriptions } = build({
      plan: { code: 'PRO' },
      currentPeriodEnd: end,
    });

    await service.fulfill('order_1', 'pay_1');

    expect(subscriptions.assignPlan).not.toHaveBeenCalled();
    expect(subscriptions.extendCurrentPeriod).toHaveBeenCalledWith(
      'u1',
      new Date(end.getTime() + 30 * DAY),
    );
  });

  it('does nothing the second time (webhook after verify)', async () => {
    const { service, payment, subscriptions } = build(null);
    payment.fulfilledAt = new Date();

    await service.fulfill('order_1', 'pay_1');

    expect(subscriptions.assignPlan).not.toHaveBeenCalled();
    expect(subscriptions.extendCurrentPeriod).not.toHaveBeenCalled();
  });

  it('rejects an amount that does not match the order', async () => {
    const { service, subscriptions } = build(null);

    await expect(service.fulfill('order_1', 'pay_1', 100)).rejects.toThrow(
      /Amount mismatch/,
    );
    expect(subscriptions.assignPlan).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.handleRefund', () => {
  it('drops to Free when the refunded payment was all the time left', async () => {
    const { service, payment, subscriptions } = build({
      plan: { code: 'PRO' },
      currentPeriodEnd: new Date(Date.now() + 29 * DAY),
    });
    payment.razorpayPaymentId = 'pay_1';

    await service.handleRefund('pay_1', 9900);

    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(subscriptions.assignPlan).toHaveBeenCalledWith(
      'u1',
      'FREE',
      SubscriptionSource.SYSTEM,
    );
  });

  it('keeps remaining paid time from another payment', async () => {
    const end = new Date(Date.now() + 59 * DAY);
    const { service, subscriptions } = build({
      plan: { code: 'PRO' },
      currentPeriodEnd: end,
    });

    await service.handleRefund('pay_1', 9900);

    expect(subscriptions.assignPlan).not.toHaveBeenCalled();
    expect(subscriptions.extendCurrentPeriod).toHaveBeenCalledWith(
      'u1',
      new Date(end.getTime() - 30 * DAY),
    );
  });

  it('ignores a partial refund', async () => {
    const { service, subscriptions } = build({
      plan: { code: 'PRO' },
      currentPeriodEnd: new Date(Date.now() + 29 * DAY),
    });

    await service.handleRefund('pay_1', 1000);

    expect(subscriptions.assignPlan).not.toHaveBeenCalled();
    expect(subscriptions.extendCurrentPeriod).not.toHaveBeenCalled();
  });
});
