import { createHmac } from 'crypto';
import { AutopayService } from './autopay.service';
import { AutopayStatus } from './models/autopay-subscription.model';
import { AUTOPAY_GRACE_DAYS } from './plan-pricing';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const SECRET = 'test_secret';

/** A Razorpay answer for the fetch mock. */
const ok = (body: unknown) => ({ ok: true, json: async () => body });
/** A Razorpay refusal, shaped like its real error body. */
const refused = (status: number, description: string) => ({
  ok: false,
  status,
  text: async () =>
    JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description } }),
});

function makeRow(over: Record<string, unknown> = {}) {
  const row: any = {
    userId: 'u1',
    planCode: 'PRO',
    interval: 'monthly',
    razorpaySubscriptionId: 'sub_1',
    razorpayPlanId: 'plan_1',
    status: AutopayStatus.CREATED,
    createdAt: new Date(),
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

  it('charges the first cycle at once for a user with no paid time (one step)', async () => {
    const { service, planModel, autopayModel } = build({
      current: { plan: { code: 'FREE' }, currentPeriodEnd: null },
    });
    planModel.findOne.mockResolvedValue({
      razorpayPlanId: 'plan_1',
      amount: 9900,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'sub_now' }),
    });
    autopayModel.create.mockImplementation(async (v: any) =>
      makeRow({ ...v, createdAt: new Date() }),
    );

    const out = await service.start('u1', {
      planCode: 'PRO',
      interval: 'monthly' as any,
    });

    const subBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(subBody.start_at).toBeUndefined();
    expect(out.subscriptionId).toBe('sub_now');
    expect(out.chargedNow).toBe(true);
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
    expect(out.chargedNow).toBe(false);
  });

  it('charges now (no start_at) when the paid period is about to end', async () => {
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
    expect(fetchBody().start_at).toBeUndefined();
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
    fetchMock.mockResolvedValueOnce(
      ok({
        status: 'active',
        paid_count: 0,
        charge_at: Math.floor((Date.now() + 20 * DAY) / 1000),
      }),
    );
    await expect(
      service.start('u1', { planCode: 'PRO', interval: 'monthly' as any }),
    ).rejects.toThrow('already set up');
  });

  it('starts a new autopay when the old one was cancelled from the UPI app', async () => {
    const live = makeRow({ status: AutopayStatus.AUTHENTICATED });
    const { service } = build({
      current: { plan: { code: 'FREE' }, currentPeriodEnd: null },
      live,
    });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'cancelled' }))
      .mockResolvedValueOnce(ok({ id: 'sub_new' }));

    const out = await service.start('u1', {
      planCode: 'PRO',
      interval: 'monthly' as any,
    });

    expect(fetchMock.mock.calls[0][0]).toContain('/subscriptions/sub_1');
    expect(live.status).toBe(AutopayStatus.CANCELLED);
    expect(out.subscriptionId).toBe('sub_new');
  });
});

describe('AutopayService.verify', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });
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

  it('grants the plan at once when the first cycle was charged now', async () => {
    const row = makeRow({ startAt: new Date() });
    const { service, payments } = build({ row });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pay_1',
          status: 'captured',
          amount: 9900,
          order_id: 'order_1',
          subscription_id: 'sub_1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ paid_count: 1, charge_at: 1800000000 }),
      });
    await service.verify('u1', {
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: sign('pay_1', 'sub_1'),
    });
    expect(payments.fulfill).toHaveBeenCalledWith('order_1', 'pay_1', 9900, {
      accessUntil: new Date(1800000000 * 1000 + AUTOPAY_GRACE_DAYS * DAY),
    });
    expect(row.status).toBe(AutopayStatus.ACTIVE);
  });

  it('does not grant when the first payment is not captured', async () => {
    const row = makeRow({ startAt: new Date() });
    const { service, payments } = build({ row });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pay_1',
        status: 'failed',
        amount: 9900,
        subscription_id: 'sub_1',
      }),
    });
    await service.verify('u1', {
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: sign('pay_1', 'sub_1'),
    });
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
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('cancels at the end of the cycle when active, so paid access is kept', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'active', remaining_count: 11 }))
      .mockResolvedValueOnce(ok({}));
    await service.cancel('u1');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      cancel_at_cycle_end: true,
    });
    expect(live.cancelRequestedAt).toBeInstanceOf(Date);
    expect(live.status).toBe(AutopayStatus.ACTIVE);
  });

  it('cancels at once when no cycle is running yet', async () => {
    const live = makeRow({ status: AutopayStatus.AUTHENTICATED });
    const { service } = build({ live });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'authenticated' }))
      .mockResolvedValueOnce(ok({}));
    await service.cancel('u1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      cancel_at_cycle_end: false,
    });
    expect(live.status).toBe(AutopayStatus.CANCELLED);
  });

  it('closes an expired autopay instead of failing (never approved before its start date)', async () => {
    const live = makeRow({
      status: AutopayStatus.CREATED,
      createdAt: new Date(Date.now() - 40 * DAY),
      startAt: new Date(Date.now() - 13 * DAY),
    });
    const { service } = build({ live });
    fetchMock.mockResolvedValueOnce(ok({ status: 'expired' }));

    const out = await service.cancel('u1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(live.status).toBe(AutopayStatus.EXPIRED);
    expect(out.status).toBe(AutopayStatus.EXPIRED);
  });

  it('closes an autopay Razorpay does not know (e.g. made with the other key)', async () => {
    const live = makeRow({ status: AutopayStatus.AUTHENTICATED });
    const { service } = build({ live });
    fetchMock.mockResolvedValueOnce(
      refused(400, 'The id provided does not exist'),
    );

    await service.cancel('u1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(live.status).toBe(AutopayStatus.CANCELLED);
    expect(live.cancelledAt).toBeInstanceOf(Date);
  });

  it('closes the row when it was cancelled from the UPI app in the meantime', async () => {
    const live = makeRow({ status: AutopayStatus.AUTHENTICATED });
    const { service } = build({ live });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'authenticated' }))
      .mockResolvedValueOnce(
        refused(400, 'Subscription is not cancellable in cancelled status.'),
      )
      .mockResolvedValueOnce(ok({ status: 'cancelled' }));

    await service.cancel('u1');

    expect(live.status).toBe(AutopayStatus.CANCELLED);
  });

  it('only marks it stopping in the last paid cycle (nothing more will be charged)', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    fetchMock.mockResolvedValueOnce(
      ok({ status: 'active', remaining_count: 0 }),
    );

    await service.cancel('u1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(live.cancelRequestedAt).toBeInstanceOf(Date);
  });

  it('reports a network failure as unreachable and changes nothing', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(service.cancel('u1')).rejects.toThrow(
      'Could not reach the payment provider',
    );
    expect(live.update).not.toHaveBeenCalled();
  });

  it('keeps a real refusal as an error with a clear message', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'active', remaining_count: 5 }))
      .mockResolvedValueOnce(
        refused(
          400,
          'Request failed because another subscription operation is in progress.',
        ),
      )
      .mockResolvedValueOnce(ok({ status: 'active', remaining_count: 5 }));

    await expect(service.cancel('u1')).rejects.toThrow(
      'The payment provider refused this request',
    );
    expect(live.cancelRequestedAt).toBeNull();
  });
});

describe('AutopayService.mine', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('does not report a checkout the user has not approved as autopay', async () => {
    const live = makeRow({ status: AutopayStatus.CREATED });
    const { service } = build({ live });
    expect(await service.mine('u1')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes an unapproved autopay that expired at Razorpay', async () => {
    const live = makeRow({
      status: AutopayStatus.CREATED,
      createdAt: new Date(Date.now() - 40 * DAY),
      startAt: new Date(Date.now() - 13 * DAY),
    });
    const { service } = build({ live });
    fetchMock.mockResolvedValueOnce(ok({ status: 'expired' }));

    expect(await service.mine('u1')).toBeNull();
    expect(live.status).toBe(AutopayStatus.EXPIRED);
  });

  it('closes a checkout abandoned more than an hour ago', async () => {
    const live = makeRow({
      status: AutopayStatus.CREATED,
      createdAt: new Date(Date.now() - 2 * HOUR),
      startAt: new Date(Date.now() - 2 * HOUR),
    });
    const { service } = build({ live });
    fetchMock
      .mockResolvedValueOnce(ok({ status: 'created' }))
      .mockResolvedValueOnce(ok({}));

    expect(await service.mine('u1')).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      cancel_at_cycle_end: false,
    });
    expect(live.status).toBe(AutopayStatus.CANCELLED);
  });

  it('records a renewal the webhook missed and moves the next payment date', async () => {
    const live = makeRow({
      status: AutopayStatus.ACTIVE,
      paidCount: 1,
      createdAt: new Date(Date.now() - 45 * DAY),
      startAt: new Date(Date.now() - 13 * DAY),
    });
    const { service, payments } = build({ live });
    const next = Math.floor((Date.now() + 17 * DAY) / 1000);
    const paid = (id: string, amount: number) => ({
      status: 'paid',
      payment_id: id,
      order_id: `order_${id}`,
      amount,
      amount_paid: amount,
    });
    fetchMock
      .mockResolvedValueOnce(
        ok({ status: 'active', paid_count: 2, charge_at: next }),
      )
      .mockResolvedValueOnce(
        ok({
          items: [
            paid('pay_2', 9900),
            paid('pay_1', 9900),
            paid('pay_auth', 500),
            { status: 'issued', payment_id: null, amount: 9900 },
          ],
        }),
      );

    const out = await service.mine('u1');

    expect(fetchMock.mock.calls[1][0]).toContain(
      '/invoices?subscription_id=sub_1',
    );
    // Both cycle charges go through fulfill(), which skips the one already recorded.
    expect(payments.fulfill.mock.calls.map((c: any[]) => c[1])).toEqual([
      'pay_2',
      'pay_1',
    ]);
    expect(payments.fulfill.mock.calls[0][3].accessUntil.getTime()).toBe(
      next * 1000 + AUTOPAY_GRACE_DAYS * DAY,
    );
    expect(live.paidCount).toBe(2);
    expect(live.startAt.getTime()).toBe(next * 1000);
    expect(out?.status).toBe(AutopayStatus.ACTIVE);
  });

  it('grants the plan when a one-step payment was taken but never verified', async () => {
    const live = makeRow({
      status: AutopayStatus.CREATED,
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      startAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    const { service, payments } = build({ live });
    const next = Math.floor((Date.now() + 30 * DAY) / 1000);
    fetchMock
      .mockResolvedValueOnce(
        ok({ status: 'active', paid_count: 1, charge_at: next }),
      )
      .mockResolvedValueOnce(
        ok({
          items: [
            {
              status: 'paid',
              payment_id: 'pay_1',
              order_id: 'order_1',
              amount: 9900,
              amount_paid: 9900,
            },
          ],
        }),
      );

    const out = await service.mine('u1');

    expect(payments.fulfill).toHaveBeenCalledWith('order_1', 'pay_1', 9900, {
      accessUntil: new Date(next * 1000 + AUTOPAY_GRACE_DAYS * DAY),
    });
    expect(out?.status).toBe(AutopayStatus.ACTIVE);
  });

  it('still answers from our own row when Razorpay is down', async () => {
    const live = makeRow({
      status: AutopayStatus.ACTIVE,
      startAt: new Date(Date.now() - 2 * DAY),
    });
    const { service } = build({ live });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const out = await service.mine('u1');

    expect(out?.status).toBe(AutopayStatus.ACTIVE);
  });

  it('does not call Razorpay for an autopay that is up to date', async () => {
    const live = makeRow({ status: AutopayStatus.ACTIVE });
    const { service } = build({ live });
    const out = await service.mine('u1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out?.status).toBe(AutopayStatus.ACTIVE);
  });
});
