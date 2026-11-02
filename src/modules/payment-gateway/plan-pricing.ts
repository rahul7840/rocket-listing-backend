import { BillingInterval } from './models/payment.model';

export interface PriceOption {
  /** Smallest currency unit (paise). The server decides this - the client never sends an amount. */
  amount: number;
  /** How long one purchase keeps the plan active. */
  days: number;
}

/**
 * Purchasable plans. Mirrors rl-website's pricing page: Pro is Rs 99/month,
 * or Rs 79/month billed yearly (Rs 948). A monthly purchase lasts 30 days,
 * a yearly one 365. Max is "coming soon" on the site, so it is not listed
 * here yet - add a MAX entry to open it for sale.
 */
export const PLAN_PRICING: Record<
  string,
  Record<BillingInterval, PriceOption>
> = {
  PRO: {
    [BillingInterval.MONTHLY]: { amount: 99 * 100, days: 30 },
    [BillingInterval.YEARLY]: { amount: 79 * 12 * 100, days: 365 },
  },
};

export const CURRENCY = 'INR';

/**
 * How an autopay subscription bills for each interval. Razorpay plans bill
 * per calendar month or year, so a renewal's access runs to the NEXT charge
 * date plus a short grace (AUTOPAY_GRACE_DAYS) instead of a fixed 30/365
 * days, which would drift against the real charge dates.
 * totalCount is how many cycles are authorised; after that the user must
 * choose autopay again.
 */
export const AUTOPAY_CYCLE: Record<
  BillingInterval,
  { period: 'monthly' | 'yearly'; interval: number; totalCount: number }
> = {
  [BillingInterval.MONTHLY]: { period: 'monthly', interval: 1, totalCount: 12 },
  [BillingInterval.YEARLY]: { period: 'yearly', interval: 1, totalCount: 5 },
};

/** Extra days of access after a renewal, so a charge retried late does not cut the user off. */
export const AUTOPAY_GRACE_DAYS = 2;

/** Razorpay needs start_at in the future; never ask for less than this. */
export const AUTOPAY_MIN_LEAD_MS = 5 * 60 * 1000;
