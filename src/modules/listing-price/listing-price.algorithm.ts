/**
 * Seller listing price estimator (see docs/seller-listing-price.md).
 *
 * Field-first: every value Meesho's customer-facing product reply already carries is read as it is, and only the one thing
 * the reply never reveals - what Meesho takes between the seller's panel price and the customer's price - is estimated.
 * Pure functions, no I/O. Everything here is an ESTIMATE, labelled experimental until it is checked against
 * seller-confirmed prices.
 *
 *   listing price ~= customer price - adjustment        (adjustment = shipping and fees, Rs 57-70 by default)
 */

export const LISTING_PRICE_CONFIG = {
  version: 'v1-field-first',
  /** Rupees between the seller's panel price and the customer's price. Provisional: replace once validated against seller-confirmed prices. */
  adjustment: { min: 57, default: 64, max: 70 },
  /** What the slider may reach */
  sliderMin: 40,
  sliderMax: 90,
  /** Rounding slack when comparing two prices that should be equal */
  tolerance: 1,
} as const;

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const positive = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
};

/** Meesho sends some prices bare (`136`) and some wrapped (`{ price: 136 }`). */
const priceOf = (v: unknown): number | undefined =>
  positive(isBag(v) ? v.price : v);

const rupee = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

export interface PriceField {
  key: string;
  label: string;
  value: number;
  /** Where in the reply it came from */
  source: string;
}

export interface ListingPriceResult {
  status: 'experimental' | 'insufficient';
  /** Present only when the reply carried no usable customer price */
  reason?: string;
  fields: PriceField[];
  /** Plain-language findings about the extracted values (consistency checks and discrepancies) */
  notes: string[];
  estimate?: {
    /** The customer price the estimate starts from */
    basePrice: number;
    adjustment: {
      min: number;
      max: number;
      selected: number;
      sliderMin: number;
      sliderMax: number;
    };
    listing: { low: number; mid: number; high: number };
    confidence: 'low';
  };
  algorithm: {
    name: string;
    version: string;
    steps: string[];
    disclaimer: string;
  };
}

const DISCLAIMER =
  'Meesho does not publish the seller-entered price or the payout. This is an estimate from the customer-facing price, not a confirmed figure.';

export function estimateListingPrice(
  catalog: unknown,
  requestedAdjustment?: number,
): ListingPriceResult {
  const c: Bag = isBag(catalog) ? catalog : {};
  const cfg = LISTING_PRICE_CONFIG;
  const fields: PriceField[] = [];
  const notes: string[] = [];
  const add = (
    key: string,
    label: string,
    value: number | undefined,
    source: string,
  ): number | undefined => {
    if (value !== undefined) fields.push({ key, label, value, source });
    return value;
  };

  const productPrice = add(
    'productPrice',
    'Customer price',
    positive(c.min_product_price),
    'min_product_price',
  );
  const catalogPrice = add(
    'catalogPrice',
    'Catalog price',
    positive(c.min_catalog_price),
    'min_catalog_price',
  );
  const original = add(
    'originalPrice',
    'Original price',
    positive(c.original_price),
    'original_price',
  );
  const stated = positive(c.total_discount_in_rs);
  const deal = isBag(c.deal) ? c.deal : {};
  const dealPrice = add(
    'dealPrice',
    'Deal price',
    priceOf(deal.deal_price),
    'deal.deal_price.price',
  );
  const dealOriginal = add(
    'dealOriginal',
    'Deal original price',
    priceOf(deal.original_price),
    'deal.original_price.price',
  );

  const offers =
    isBag(c.special_offers) && Array.isArray(c.special_offers.offers)
      ? c.special_offers.offers
      : [];
  const cod = offers.find(
    (o): o is Bag =>
      isBag(o) && o.type === 'cod_unbundling' && positive(o.amount) !== undefined,
  );
  const offerAmount = add(
    'offerAmount',
    'Prepaid offer',
    cod ? positive(cod.amount) : undefined,
    'special_offers.offers[].amount',
  );
  const displayText =
    isBag(c.special_offers) && typeof c.special_offers.display_text === 'string'
      ? c.special_offers.display_text
      : '';
  const displayed = positive(
    /₹\s*([\d,]+(?:\.\d+)?)/.exec(displayText)?.[1],
  );

  // Consistency checks: they say how far the reply can be trusted, they never change the estimate.
  const price = productPrice ?? catalogPrice;
  if (original !== undefined && price !== undefined && original > price && stated !== undefined) {
    const expected = original - price;
    notes.push(
      Math.abs(expected - stated) <= cfg.tolerance
        ? `Discount checks out: ${rupee(original)} - ${rupee(price)} = ${rupee(stated)}.`
        : `Stated discount ${rupee(stated)} does not match ${rupee(original)} - ${rupee(price)} = ${rupee(expected)}.`,
    );
  }
  if (offerAmount !== undefined && price !== undefined) {
    const offerPrice = price - offerAmount;
    notes.push(
      displayed === undefined || Math.abs(displayed - offerPrice) <= cfg.tolerance
        ? `Prepaid offer price ${rupee(offerPrice)} = ${rupee(price)} - ${rupee(offerAmount)}.`
        : `Prepaid offer price ${rupee(offerPrice)} differs from the ${rupee(displayed)} Meesho displays.`,
    );
  }
  if (
    dealOriginal !== undefined &&
    original !== undefined &&
    Math.abs(dealOriginal - original) > cfg.tolerance
  ) {
    notes.push(
      `Deal reference ${rupee(dealOriginal)} differs from original price ${rupee(original)}; neither is treated as the seller's price.`,
    );
  }
  if (
    dealPrice !== undefined &&
    price !== undefined &&
    Math.abs(dealPrice - price) > cfg.tolerance
  ) {
    notes.push(
      `Deal price ${rupee(dealPrice)} differs from customer price ${rupee(price)}.`,
    );
  }

  const describe = (steps: string[]): ListingPriceResult['algorithm'] => ({
    name: 'Field-first listing price',
    version: cfg.version,
    steps,
    disclaimer: DISCLAIMER,
  });

  if (price === undefined) {
    return {
      status: 'insufficient',
      reason: 'Meesho sent no customer price for this product.',
      fields,
      notes,
      algorithm: describe([]),
    };
  }

  const { min, max } = cfg.adjustment;
  const selected = Math.round(
    clamp(
      num(requestedAdjustment) ?? cfg.adjustment.default,
      cfg.sliderMin,
      cfg.sliderMax,
    ),
  );
  const at = (adjustment: number): number => Math.max(0, price - adjustment);
  const widest = Math.max(max, selected);
  const narrowest = Math.min(min, selected);
  const listing = { low: at(widest), mid: at(selected), high: at(narrowest) };

  const steps = [
    `Customer price: ${rupee(price)} (${productPrice !== undefined ? 'min_product_price' : 'min_catalog_price'}).`,
    `Shipping and fees between the seller price and the customer price are assumed to be ${rupee(min)}-${rupee(max)}; selected ${rupee(selected)}.`,
    `Listing price = ${rupee(price)} - ${rupee(selected)} = ${rupee(listing.mid)}.`,
    `Range: ${rupee(listing.low)} (minus ${rupee(widest)}) to ${rupee(listing.high)} (minus ${rupee(narrowest)}).`,
  ];

  if (listing.mid <= 0) {
    return {
      status: 'insufficient',
      reason: 'The customer price is below the assumed shipping and fees.',
      fields,
      notes,
      algorithm: describe(steps),
    };
  }

  return {
    status: 'experimental',
    fields,
    notes,
    estimate: {
      basePrice: price,
      adjustment: {
        min,
        max,
        selected,
        sliderMin: cfg.sliderMin,
        sliderMax: cfg.sliderMax,
      },
      listing,
      confidence: 'low',
    },
    algorithm: describe(steps),
  };
}
