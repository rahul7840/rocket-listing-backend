import { createHmac } from 'crypto';
import { UniqueConstraintError } from 'sequelize';
import { LearningService, normalizePhone } from './learning.service';
import { SessionBookingStatus } from './models/learning-session-booking.model';
import { SESSION_PRICE_PAISE } from './learning.constants';

const SECRET = 'test_secret';
const DAY = 24 * 60 * 60 * 1000;
const IST = 5.5 * 60 * 60 * 1000;
const ist = (days: number) =>
  new Date(Date.now() + IST + days * DAY).toISOString().slice(0, 10);

function makeBooking(over: Record<string, unknown> = {}) {
  return {
    bookingId: 'b1',
    status: SessionBookingStatus.PENDING,
    sessionDate: ist(5),
    slot: '7:00 PM',
    amount: SESSION_PRICE_PAISE,
    needsNewSlot: false,
    razorpayOrderId: 'order_1',
    ...over,
  };
}

function build(opts: { found?: any; taken?: any } = {}) {
  const create = jest.fn().mockResolvedValue({});
  const bookingModel: any = {
    sequelize: {
      transaction: (cb: (t: unknown) => unknown) => cb({}),
      query: jest.fn().mockResolvedValue([]),
    },
    // book() looks for a clash; verify()/fulfill look the booking up by order or payment id.
    findOne: jest.fn(async ({ where }: any) =>
      where?.razorpayOrderId || where?.razorpayPaymentId
        ? (opts.found ?? null)
        : (opts.taken ?? null),
    ),
    findByPk: jest.fn().mockResolvedValue(makeBooking({ status: 'paid' })),
    findAll: jest.fn().mockResolvedValue([]),
    create,
    update: jest.fn().mockResolvedValue([1]),
  };
  const config: any = {
    getOrThrow: () => ({
      keyId: 'rzp_test_x',
      keySecret: SECRET,
      webhookSecret: 'w',
    }),
  };
  const service = new LearningService(config, bookingModel);
  return { service, bookingModel, create };
}

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['091-9876543210', '9876543210'],
  ])('%s -> %s', (raw, out) => expect(normalizePhone(raw)).toBe(out));
});

describe('LearningService.book', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order_new' }),
    });
    (global as any).fetch = fetchMock;
  });
  const valid = {
    name: 'Asha',
    phone: '9876543210',
    date: ist(5),
    slot: '7:00 PM' as const,
  };

  it('creates the order at the server price and stores the booking', async () => {
    const { service, create, bookingModel } = build();
    const out = await service.book(valid);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.amount).toBe(SESSION_PRICE_PAISE);
    expect(out.orderId).toBe('order_new');
    expect(out.amount).toBe(SESSION_PRICE_PAISE);
    expect(create.mock.calls[0][0]).toMatchObject({
      phone: '9876543210',
      sessionDate: valid.date,
      slot: '7:00 PM',
      amount: SESSION_PRICE_PAISE,
    });
    // the real Razorpay order id replaces the placeholder
    expect(bookingModel.update).toHaveBeenCalledWith(
      { razorpayOrderId: 'order_new' },
      expect.anything(),
    );
  });

  it('takes a lock on the slot before looking for a clash', async () => {
    const { service, bookingModel } = build();
    await service.book(valid);
    expect(bookingModel.sequelize.query.mock.calls[0][0]).toContain(
      'pg_advisory_xact_lock',
    );
  });

  it('refuses a slot that is taken', async () => {
    const { service, create } = build({ taken: makeBooking() });
    await expect(service.book(valid)).rejects.toThrow('just taken');
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a buyer choose later (no day, no slot)', async () => {
    const { service, create } = build();
    await service.book({ name: 'Asha', phone: '9876543210' });
    expect(create.mock.calls[0][0]).toMatchObject({
      sessionDate: null,
      slot: null,
    });
  });

  it('refuses a day without a time, or a time without a day', async () => {
    const { service } = build();
    await expect(
      service.book({ name: 'Asha', phone: '9876543210', date: ist(5) }),
    ).rejects.toThrow('both a day and a start time');
    await expect(
      service.book({ name: 'Asha', phone: '9876543210', slot: '7:00 PM' }),
    ).rejects.toThrow('both a day and a start time');
  });

  it.each([[0], [-3], [60]])('refuses a day %i days from today', async (n) => {
    const { service } = build();
    await expect(
      service.book({
        name: 'Asha',
        phone: '9876543210',
        date: ist(n),
        slot: '7:00 PM',
      }),
    ).rejects.toThrow('within the next 45 days');
  });

  it('refuses a number that is not an Indian mobile', async () => {
    const { service } = build();
    await expect(
      service.book({ ...valid, phone: '1234567890' }),
    ).rejects.toThrow('valid 10-digit mobile number');
  });

  it('releases the slot when Razorpay cannot create the order', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    const { service, bookingModel } = build();
    await expect(service.book(valid)).rejects.toThrow(
      'Could not start the payment',
    );
    expect(bookingModel.update).toHaveBeenCalledWith(
      { status: SessionBookingStatus.FAILED },
      expect.anything(),
    );
  });
});

describe('LearningService.verify and the webhook path', () => {
  const sign = (o: string, p: string) =>
    createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');

  it('marks a booking paid on a good signature', async () => {
    const { service, bookingModel } = build({ found: makeBooking() });
    const out = await service.verify({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: sign('order_1', 'pay_1'),
    });
    expect(bookingModel.update.mock.calls[0][0]).toMatchObject({
      status: SessionBookingStatus.PAID,
      razorpayPaymentId: 'pay_1',
    });
    expect(out.status).toBe('paid');
  });

  it('rejects a forged signature and changes nothing', async () => {
    const { service, bookingModel } = build({ found: makeBooking() });
    await expect(
      service.verify({
        razorpay_order_id: 'order_1',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: sign('order_1', 'pay_OTHER'),
      }),
    ).rejects.toThrow('Invalid payment signature');
    expect(bookingModel.update).not.toHaveBeenCalled();
  });

  it('does nothing a second time for a booking that is already paid', async () => {
    const { service, bookingModel } = build({
      found: makeBooking({ status: SessionBookingStatus.PAID }),
    });
    await service.fulfillByOrder('order_1', 'pay_1', SESSION_PRICE_PAISE);
    expect(bookingModel.update).not.toHaveBeenCalled();
  });

  it('reports false for an order that is not a session booking', async () => {
    const { service } = build({ found: null });
    expect(await service.fulfillByOrder('order_x', 'pay_x', 100)).toBe(false);
  });

  it('refuses an amount that does not match', async () => {
    const { service } = build({ found: makeBooking() });
    await expect(
      service.fulfillByOrder('order_1', 'pay_1', 100),
    ).rejects.toThrow('Amount mismatch');
  });

  it('keeps the money and flags the booking when the slot was paid for by someone else first', async () => {
    const { service, bookingModel } = build({ found: makeBooking() });
    bookingModel.update
      .mockRejectedValueOnce(new UniqueConstraintError({}))
      .mockResolvedValueOnce([1]);
    await service.fulfillByOrder('order_1', 'pay_1', SESSION_PRICE_PAISE);
    expect(bookingModel.update.mock.calls[1][0]).toMatchObject({
      status: SessionBookingStatus.PAID,
      sessionDate: null,
      slot: null,
      needsNewSlot: true,
    });
  });

  it('marks a full refund and ignores a payment that is not a session', async () => {
    const { service, bookingModel } = build({ found: makeBooking() });
    expect(await service.handleRefund('pay_1', SESSION_PRICE_PAISE)).toBe(true);
    expect(bookingModel.update.mock.calls[0][0]).toMatchObject({
      status: SessionBookingStatus.REFUNDED,
    });
    const other = build({ found: null });
    expect(await other.service.handleRefund('pay_z', 100)).toBe(false);
  });
});

describe('LearningService: linking a booking to a signed-in user', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order_new' }),
    });
    (global as any).fetch = fetchMock;
  });

  it('stores the user id when a signed-in user books', async () => {
    const { service, create } = build();
    await service.book({ name: 'Asha', phone: '9876543210' }, 'user-1');
    expect(create.mock.calls[0][0]).toMatchObject({ userId: 'user-1' });
  });

  it('stores no user id for a visitor who is not signed in', async () => {
    const { service, create } = build();
    await service.book({ name: 'Asha', phone: '9876543210' });
    expect(create.mock.calls[0][0]).toMatchObject({ userId: null });
  });

  it("lists only that user's paid or refunded bookings, newest first", async () => {
    const { service, bookingModel } = build();
    bookingModel.findAll.mockResolvedValue([
      {
        ...makeBooking({ status: SessionBookingStatus.PAID }),
        name: 'Asha',
        currency: 'INR',
        paidAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const out = await service.listForUser('user-1');
    const arg = bookingModel.findAll.mock.calls[0][0];
    expect(arg.where.userId).toBe('user-1');
    expect(arg.order).toEqual([['createdAt', 'DESC']]);
    expect(out[0]).toMatchObject({
      status: 'paid',
      slot: '7:00 PM',
      amount: SESSION_PRICE_PAISE,
    });
    // never exposes the phone number or the Razorpay ids
    expect(out[0]).not.toHaveProperty('phone');
    expect(out[0]).not.toHaveProperty('razorpayOrderId');
  });
});
