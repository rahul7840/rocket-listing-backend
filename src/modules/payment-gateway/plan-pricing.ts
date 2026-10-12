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
