import { createHmac } from 'crypto';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { WebhookEventStatus } from './models/payment-webhook-event.model';

const SECRET = 'whsec_test';

function build() {
  const eventRow: any = {
    status: WebhookEventStatus.RECEIVED,
    update: jest.fn(async function (this: any, patch: object) {
      Object.assign(this, patch);
      return this;
    }),
  };
  const eventModel: any = {
    create: jest.fn().mockResolvedValue(eventRow),
    findOne: jest.fn(),
  };
  const paymentModel: any = { findOne: jest.fn().mockResolvedValue(null) };
  const userModel: any = { update: jest.fn() };
  const payments: any = { fulfill: jest.fn(), handleRefund: jest.fn() };
  const autopay: any = { handleEvent: jest.fn() };
  // By default an order is not a session booking, so the plan purchase path runs as before.
  const learning: any = {
    fulfillByOrder: jest.fn().mockResolvedValue(false),
    handleRefund: jest.fn().mockResolvedValue(false),
  };
  const config: any = {
    getOrThrow: () => ({ keyId: 'k', keySecret: 's', webhookSecret: SECRET }),
  };
  const service = new RazorpayWebhookService(
    config,
    eventModel,
    paymentModel,
    userModel,
    payments,
    autopay,
    learning,
  );
  return { service, eventRow, eventModel, payments, autopay, learning };
}

const signed = (body: object) => {
  const raw = Buffer.from(JSON.stringify(body));
  const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
  return { raw, sig };
};

describe('RazorpayWebhookService', () => {
  it('rejects a webhook with a wrong signature and touches nothing', async () => {
    const { service, eventModel, autopay } = build();
    const { raw } = signed({ event: 'subscription.charged' });
    await expect(service.handle(raw, 'bad', 'evt_1')).rejects.toThrow(
      'Invalid signature',
    );
    expect(eventModel.create).not.toHaveBeenCalled();
    expect(autopay.handleEvent).not.toHaveBeenCalled();
  });

  it.each([
    'subscription.authenticated',
    'subscription.activated',
    'subscription.charged',
    'subscription.pending',
    'subscription.halted',
    'subscription.cancelled',
  ])(
    'sends %s to the autopay service and marks it processed',
    async (event) => {
      const { service, eventRow, autopay } = build();
      const body = {
        event,
        payload: {
          subscription: { entity: { id: 'sub_1', status: 'active' } },
        },
      };
      const { raw, sig } = signed(body);

      const out = await service.handle(raw, sig, `evt_${event}`);

      expect(out.duplicate).toBe(false);
      expect(autopay.handleEvent).toHaveBeenCalledWith(event, body);
      expect(eventRow.status).toBe(WebhookEventStatus.PROCESSED);
    },
  );

  it('records a failed handler and returns an error so Razorpay retries', async () => {
    const { service, eventRow, autopay } = build();
    autopay.handleEvent.mockRejectedValue(new Error('db down'));
    const { raw, sig } = signed({
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_1' } } },
    });
    await expect(service.handle(raw, sig, 'evt_fail')).rejects.toThrow(
      'db down',
    );
    expect(eventRow.status).toBe(WebhookEventStatus.FAILED);
    expect(eventRow.error).toBe('db down');
  });

  it('still grants a one-time purchase on payment.captured (unchanged path)', async () => {
    const { service, payments, autopay } = build();
    const { raw, sig } = signed({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 9900 } },
      },
    });
    await service.handle(raw, sig, 'evt_pay');
    expect(payments.fulfill).toHaveBeenCalledWith('order_1', 'pay_1', 9900);
    expect(autopay.handleEvent).not.toHaveBeenCalled();
  });

  it('hands a paid session booking to the learning module and does not touch plan purchases', async () => {
    const { service, payments, learning } = build();
    learning.fulfillByOrder.mockResolvedValue(true);
    const { raw, sig } = signed({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_s', order_id: 'order_s', amount: 99900 },
        },
      },
    });
    await service.handle(raw, sig, 'evt_session');
    expect(learning.fulfillByOrder).toHaveBeenCalledWith(
      'order_s',
      'pay_s',
      99900,
    );
    expect(payments.fulfill).not.toHaveBeenCalled();
  });

  it('sends a refund to the learning module first, then to plan purchases', async () => {
    const { service, payments, learning } = build();
    const { raw, sig } = signed({
      event: 'refund.processed',
      payload: { refund: { entity: { payment_id: 'pay_r', amount: 99900 } } },
    });
    await service.handle(raw, sig, 'evt_refund');
    expect(learning.handleRefund).toHaveBeenCalledWith('pay_r', 99900);
    expect(payments.handleRefund).toHaveBeenCalledWith('pay_r', 99900);
  });

  it('ignores a duplicate delivery that already succeeded', async () => {
    const { service, eventModel, autopay } = build();
    const { UniqueConstraintError } = await import('sequelize');
    eventModel.create.mockRejectedValue(new UniqueConstraintError({}));
    eventModel.findOne.mockResolvedValue({
      status: WebhookEventStatus.PROCESSED,
    });
    const { raw, sig } = signed({
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_1' } } },
    });
    const out = await service.handle(raw, sig, 'evt_dup');
    expect(out.duplicate).toBe(true);
    expect(autopay.handleEvent).not.toHaveBeenCalled();
  });
});
