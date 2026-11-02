import { createHmac } from 'crypto';
import { AutopayService } from './autopay.service';
import { AutopayStatus } from './models/autopay-subscription.model';
import { AUTOPAY_GRACE_DAYS } from './plan-pricing';

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'test_secret';

function makeRow(over: Record<string, unknown> = {}) {
  const row: any = {
    userId: 'u1',
    planCode: 'PRO',
    interval: 'monthly',
    razorpaySubscriptionId: 'sub_1',
    razorpayPlanId: 'plan_1',
    status: AutopayStatus.CREATED,
    startAt: new Date(Date.now() + 10 * DAY),
    paidCount: 0,
    cancelRequestedAt: null,
    cancelledAt: null,
    update: jest.fn(async function (this: any, patch: object) {
      Object.assign(this, patch);
      return this;
    }),
    ...over,
  };
  return row;
}

function build(opts: { current?: unknown; live?: any; row?: any } = {}) {
  const autopayModel: any = {
    findOne: jest.fn(async ({ where }: any) =>
      where.razorpaySubscriptionId ? (opts.row ?? null) : (opts.live ?? null),
    ),
    create: jest.fn(async (v: any) => makeRow(v)),
  };
  const planModel: any = {
    findOne: jest.fn().mockResolvedValue({
      razorpayPlanId: 'plan_1',
      amount: 9900,
    }),
    create: jest.fn(),
  };
  const paymentModel: any = {
    findOrCreate: jest.fn().mockResolvedValue([{}, true]),
  };
  const subscriptions: any = {
    getCurrentSubscription: jest.fn().mockResolvedValue(opts.current),
  };
  const payments: any = { fulfill: jest.fn() };
  const config: any = {
    getOrThrow: () => ({
      keyId: 'rzp_test_x',
      keySecret: SECRET,
      webhookSecret: 'w',
    }),
  };
  const service = new AutopayService(
    config,
    autopayModel,
    planModel,
    paymentModel,
    subscriptions,
    payments,
  );
  return { service, autopayModel, planModel, paymentModel, payments };
}

describe('AutopayService.start', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('refuses when the user has not bought the plan', async () => {
    const { service } = build({
      current: { plan: { code: 'FREE' }, currentPeriodEnd: null },
    });
    await expect(
      service.start('u1', { planCode: 'PRO', interval: 'monthly' as any }),
    ).rejects.toThrow('Buy the plan first');
  });

  it('starts the subscription when the paid period ends', async () => {
    const end = new Date(Date.now() + 20 * DAY);
    const { service, planModel, autopayModel } = build({
      current: { plan: { code: 'PRO' }, currentPeriodEnd: end },
    });
    planModel.findOne.mockResolvedValue(null);
    planModel.create.mockResolvedValue({ razorpayPlanId: 'plan_new' });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'plan_new' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'sub_new' }),
      });

    const out = await service.start('u1', {
      planCode: 'PRO',
      interval: 'monthly' as any,
    });

    const planBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(planBody).toMatchObject({ period: 'monthly', interval: 1 });
    expect(planBody.item.amount).toBe(9900);
    const subBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(subBody.plan_id).toBe('plan_new');
    expect(subBody.start_at).toBe(Math.ceil(end.getTime() / 1000));
    expect(autopayModel.create).toHaveBeenCalledTimes(1);
    expect(out.subscriptionId).toBe('sub_new');
  });

  it('never asks Razorpay for a start in the past', async () => {
    const { service, fetchBody } = (() => {
      const b = build({
        current: {
          plan: { code: 'PRO' },
          currentPeriodEnd: new Date(Date.now() + 1000),
        },
      });
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'sub_x' }),
      });
      return {
        service: b.service,
        fetchBody: () => JSON.parse(fetchMock.mock.calls[0][1].body),
      };
    })();
    await service.start('u1', { planCode: 'PRO', interval: 'monthly' as any });
    expect(fetchBody().start_at * 1000).toBeGreaterThan(Date.now());
  });

  it('reuses a created subscription instead of making a second', async () => {
    const live = makeRow();
    const { service } = build({
      current: {
        plan: { code: 'PRO' },
        currentPeriodEnd: new Date(Date.now() + 20 * DAY),
      },
      live,
    });
    const out = await service.start('u1', {
      planCode: 'PRO',
      interval: 'monthly' as any,
    });
    expect(out.subscriptionId).toBe('sub_1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when autopay is already on', async () => {
    const { service } = build({
      current: {
        plan: { code: 'PRO' },
        currentPeriodEnd: new Date(Date.now() + 20 * DAY),
      },
      live: makeRow({ status: AutopayStatus.ACTIVE }),
    });
    await expect(
      service.start('u1', { planCode: 'PRO', interval: 'monthly' as any }),
    ).rejects.toThrow('already set up');
  });
});

describe('AutopayService.verify', () => {
  const sign = (payId: string, subId: string) =>
    createHmac('sha256', SECRET).update(`${payId}|${subId}`).digest('hex');

  it('accepts a good signature and marks it authenticated, without granting access', async () => {
    const row = makeRow();
    const { service, payments } = build({ row });
    await service.verify('u1', {
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: sign('pay_1', 'sub_1'),
    });
    expect(row.status).toBe(AutopayStatus.AUTHENTICATED);
    expect(payments.fulfill).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const row = makeRow();
    const { service } = build({ row });
    await expect(
      service.verify('u1', {
        razorpay_payment_id: 'pay_1',
        razorpay_subscription_id: 'sub_1',
        razorpay_signature: sign('pay_1', 'sub_OTHER'),
      }),
    ).rejects.toThrow('Invalid payment signature');
    expect(row.status).toBe(AutopayStatus.CREATED);
  });
});

describe('AutopayService.handleEvent', () => {
  const charged = (chargeAt: number | null) => ({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: 'sub_1',
          status: 'active',
          paid_count: 1,
          charge_at: chargeAt,
        },
      },
      payment: { entity: { id: 'pay_9', order_id: 'order_9', amount: 9900 } },
    },
  });

  it('records a renewal and gives access to the next charge date plus grace', async () => {
    const row = makeRow({ status: AutopayStatus.ACTIVE });
    const { service, paymentModel, payments } = build({ row });
    const next = Math.floor((Date.now() + 30 * DAY) / 1000);

    await service.handleEvent('subscription.charged', charged(next));

    expect(
      paymentModel.findOrCreate.mock.calls[0][0].where.razorpayOrderId,
    ).toBe('order_9');
    expect(paymentModel.findOrCreate.mock.calls[0][0].defaults.amount).toBe(
      9900,
    );
    const [orderId, payId, amount, opts] = payments.fulfill.mock.calls[0];
    expect([orderId, payId, amount]).toEqual(['order_9', 'pay_9', 9900]);
    expect(opts.accessUntil.getTime()).toBe(
      next * 1000 + AUTOPAY_GRACE_DAYS * DAY,
    );
    expect(row.paidCount).toBe(1);
    expect(row.lastChargedAt).toBeInstanceOf(Date);
  });

  it('falls back to the payment id when Razorpay sends no order id', async () => {
    const row = makeRow({ status: AutopayStatus.ACTIVE });
    const { service, paymentModel } = build({ row });
    const body = charged(null);
    body.payload.payment.entity.order_id = undefined as any;
    await service.handleEvent('subscription.charged', body);
    expect(
      paymentModel.findOrCreate.mock.calls[0][0].where.razorpayOrderId,
    ).toBe('sub_pay_9');
  });

  it('ignores a subscription we do not know', async () => {
    const { service, payments } = build({ row: null });
    await service.handleEvent('subscription.charged', charged(1));
    expect(payments.fulfill).not.toHaveBeenCalled();
  });

  it('does not move an active subscription back to authenticated', async () => {
    const row = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ row });
    await service.handleEvent('subscription.authenticated', {
      payload: { subscription: { entity: { id: 'sub_1' } } },
    });
    expect(row.status).toBe(AutopayStatus.ACTIVE);
  });

  it('marks halted and cancelled', async () => {
    const row = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ row });
    await service.handleEvent('subscription.halted', {
      payload: { subscription: { entity: { id: 'sub_1' } } },
    });
    expect(row.status).toBe(AutopayStatus.HALTED);
    await service.handleEvent('subscription.cancelled', {
      payload: { subscription: { entity: { id: 'sub_1' } } },
    });
    expect(row.status).toBe(AutopayStatus.CANCELLED);
    expect(row.cancelledAt).toBeInstanceOf(Date);
  });
});

describe('AutopayService.cancel', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    (global as any).fetch = fetchMock;
  });

  it('cancels at the end of the cycle when active, so paid access is kept', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    await service.cancel('u1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      cancel_at_cycle_end: true,
    });
    expect(live.cancelRequestedAt).toBeInstanceOf(Date);
    expect(live.status).toBe(AutopayStatus.ACTIVE);
  });

  it('cancels at once when no cycle is running yet', async () => {
    const live = makeRow({ status: AutopayStatus.AUTHENTICATED });
    const { service } = build({ live });
    await service.cancel('u1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      cancel_at_cycle_end: false,
    });
    expect(live.status).toBe(AutopayStatus.CANCELLED);
  });
});
