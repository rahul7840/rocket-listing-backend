/**
 * The one-to-one Meesho seller session sold on rl-website (/meesho-seller-session). The server decides
 * the price: the browser never sends an amount. Keep SESSION_SLOTS in step with `sessionSlotGroups`
 * in rl-website/src/content/seller-session.ts.
 */
export const SESSION_PRICE_PAISE = 999 * 100;
export const SESSION_CURRENCY = 'INR';
export const SESSION_NAME = 'Meesho Seller Growth Session';

/** Start times of the 2-hour session: 6 AM to 10 AM and 7 PM to midnight. */
export const SESSION_SLOTS = [
  '6:00 AM',
  '7:00 AM',
  '8:00 AM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
] as const;

/** A day can be booked from tomorrow until this many days later (India date). */
export const BOOKING_WINDOW_DAYS = 45;

/** An unpaid booking holds its slot for this long, so two people do not pay for one slot. */
export const SLOT_HOLD_MINUTES = 15;

/** Public booking attempts allowed per IP address in one window. */
export const BOOKING_RATE_LIMIT = { max: 8, windowMs: 10 * 60 * 1000 };
