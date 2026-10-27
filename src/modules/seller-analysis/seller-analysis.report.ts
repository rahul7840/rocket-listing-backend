/**
 * Everything the seller analysis PDF shows, worked out from the product data the extension already read from Meesho's
 * search reply. Pure functions, no I/O: nothing here calls Meesho, and every figure is an ESTIMATE.
 */

import { estimateListingPrice } from '../listing-price/listing-price.algorithm';
import { stateName } from './indian-states';
import type { ListingInsights } from './seller-analysis.insights';

export const REPORT_CONFIG = {
  /** Orders one rating is assumed to stand for: lower / base / higher (same assumption the extension's card uses). */
  ordersPerRating: { lower: 1, base: 2, higher: 4 },
  daysPerMonth: 30.4375,
  /** Under this many days of history there is too little to average a month from */
  minAgeDaysForMonthly: 30,
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
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/** "2025-03-08T18:43:56+0530" / "2025-03-08 18:43:56": the offset gets its colon so Date can read it. */
export function parseTimestamp(v: unknown): Date | undefined {
  const raw = text(v);
  if (!raw) return undefined;
  const date = new Date(
    raw.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ── Display formatting ──────────────────────────────────────────────────────

/** Three significant figures at most: 69,712,345 -> 69,700,000. */
function roundSensible(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1000) return Math.round(n);
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / magnitude) * magnitude;
}

/** Indian short form: 846, 4.4K, 69.7L, 1.4Cr. */
export function compact(n: number): string {
  const value = roundSensible(n);
  const trim = (x: number): string => String(Math.round(x * 10) / 10);
  if (value >= 1e7) return `${trim(value / 1e7)}Cr`;
  if (value >= 1e5) return `${trim(value / 1e5)}L`;
  if (value >= 1e3) return `${trim(value / 1e3)}K`;
  return String(value);
}

export const rupees = (n: number): string =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;
export const rupeesCompact = (n: number): string => `₹${compact(n)}`;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const shortDate = (d: Date): string =>
  `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** "12 days", "19 months", "2 years 3 months". */
export function ageText(days: number): string {
  if (days < 30) return `${Math.max(days, 0)} ${days === 1 ? 'day' : 'days'}`;
  const months = Math.floor(days / REPORT_CONFIG.daysPerMonth);
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ${years === 1 ? 'year' : 'years'}`;
  return rest > 0 ? `${y} ${rest} ${rest === 1 ? 'month' : 'months'}` : y;
}

/** Whole-number percentages of `counts` that add up to exactly 100 (largest remainder); all zeros for an empty set. */
export function percentagesSummingTo100(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rest: r - floors[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors;
}

// ── The report ──────────────────────────────────────────────────────────────

export interface Range {
  low: number;
  high: number;
}

export interface StarRow {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  pct: number;
}

export interface ReportModel {
  title: string;
  imageUrl?: string;
  /** The product's page on Meesho (the report's "View on Meesho" button) */
  productUrl?: string;
  /** Top to bottom: super category > category > sub category > sub-sub category (or just the one name Meesho sent) */
  categoryPath: string[];
  soldFrom?: string;
  listed?: { age: string; since: string };
  rating?: {
    average?: number;
    count: number;
    /** 5 stars first; only when Meesho sent the per-star counts */
    rows?: StarRow[];
    positivePct?: number;
    negativePct?: number;
  };
  price?: {
    current: number;
    original?: number;
    discountPct?: number;
    /** The price with Meesho's prepaid offer, when the product carries one */
    withOffer?: number;
  };
  /** The values the seller price is worked out from, by their plain names (no field names) */
  priceInputs: Array<{ label: string; value: string }>;
  sellerPrice?: { mid: number; low: number; high: number };
  sales?: {
    /** Percent of orders taken off as returns (0 = none chosen) */
    returnRatePct: number;
    lifetimeOrders: number;
    lifetimeOrdersRange: Range;
    lifetimeSales?: number;
    lifetimeSalesRange?: Range;
    /** Only once the listing has enough history to average a month from */
    monthly?: {
      orders: number;
      ordersRange: Range;
      sales?: number;
      salesRange?: Range;
    };
  };
  /** From the language model; absent when it could not be reached */
  insights?: ListingInsights;
  generatedOn: string;
}

/** The names of the category tree for the product's category id, when the lookup found it; else the product's own name. */
export function chooseCategoryPath(
  ownName: string | undefined,
  resolvedPath: string[] | undefined,
): string[] {
  const path = (resolvedPath ?? []).filter(Boolean);
  if (path.length > 0) return path;
  return ownName ? [ownName] : [];
}

/** The product page link, only when it really is an https Meesho address (it becomes a clickable button). */
export function safeProductUrl(raw: unknown): string | undefined {
  const value = text(raw);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return undefined;
    if (!/(^|\.)meesho\.com$/i.test(url.hostname)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function offerPrice(c: Bag, price: number): number | undefined {
  const offers =
    isBag(c.special_offers) && Array.isArray(c.special_offers.offers)
      ? c.special_offers.offers
      : [];
  for (const o of offers) {
    if (isBag(o) && o.type === 'cod_unbundling') {
      const amount = positive(o.amount);
      if (amount !== undefined && amount < price) return price - amount;
    }
  }
  const shown = isBag(c.special_offers)
    ? text(c.special_offers.display_text)
    : undefined;
  const match = shown ? /₹\s*([\d,]+(?:\.\d+)?)/.exec(shown) : null;
  const value = match ? positive(match[1]) : undefined;
  return value !== undefined && value < price ? value : undefined;
}

function ratingBreakdown(
  summary: Bag,
): Pick<
  NonNullable<ReportModel['rating']>,
  'rows' | 'positivePct' | 'negativePct'
> {
  const map = isBag(summary.rating_count_map)
    ? summary.rating_count_map
    : undefined;
  if (!map) return {};
  const stars = [5, 4, 3, 2, 1] as const;
  const counts = stars.map((s) => Math.max(0, num(map[String(s)]) ?? 0));
  if (counts.every((c) => c === 0)) return {};
  const pcts = percentagesSummingTo100(counts);
  const rows = stars.map((star, i): StarRow => ({
    star,
    count: counts[i],
    pct: pcts[i],
  }));
  return {
    rows,
    positivePct: pcts[0] + pcts[1],
    negativePct: pcts[3] + pcts[4],
  };
}

export function buildReport(
  catalog: unknown,
  resolvedPath?: string[],
  now: Date = new Date(),
  returnRatePct = 0,
): ReportModel {
  const c: Bag = isBag(catalog) ? catalog : {};
  const cfg = REPORT_CONFIG;
  /** Percent of orders taken off as returns: what the reader chose, none (0) by default. */
  const returns = Number.isFinite(returnRatePct)
    ? Math.min(50, Math.max(0, returnRatePct))
    : 0;

  const title = text(c.hero_product_name) ?? text(c.name) ?? 'Product';
  const price = positive(c.min_product_price) ?? positive(c.min_catalog_price);
  const original = positive(c.original_price);
  const listPrice =
    price !== undefined && original !== undefined && original > price
      ? original
      : undefined;

  const summary = isBag(c.catalog_reviews_summary)
    ? c.catalog_reviews_summary
    : {};
  const ratingCount = positive(summary.rating_count);
  const average = positive(summary.average_rating);

  let listedAt: Date | undefined;
  for (const raw of [c.activated_iso, c.created_iso]) {
    const d = parseTimestamp(raw);
    if (d && d.getTime() <= now.getTime()) {
      listedAt = d;
      break;
    }
  }
  const ageDays = listedAt
    ? Math.floor((now.getTime() - listedAt.getTime()) / 86_400_000)
    : undefined;

  const model: ReportModel = {
    title,
    imageUrl: text(c.image),
    productUrl: safeProductUrl(c.url),
    categoryPath: chooseCategoryPath(
      text(c.sub_sub_category_name),
      resolvedPath,
    ),
    soldFrom: stateName(c.state_code),
    listed:
      listedAt && ageDays !== undefined
        ? { age: ageText(ageDays), since: shortDate(listedAt) }
        : undefined,
    rating:
      ratingCount !== undefined
        ? { average, count: ratingCount, ...ratingBreakdown(summary) }
        : undefined,
    priceInputs: [],
    generatedOn: shortDate(now),
  };

  if (price !== undefined) {
    const withOffer = offerPrice(c, price);
    model.price = {
      current: price,
      original: listPrice,
      discountPct:
        listPrice !== undefined
          ? Math.round(((listPrice - price) / listPrice) * 100)
          : undefined,
      withOffer,
    };

    const catalogPrice = positive(c.min_catalog_price);
    model.priceInputs = [
      { label: 'Customer price', value: rupees(price) },
      catalogPrice !== undefined && {
        label: 'Catalog price',
        value: rupees(catalogPrice),
      },
      original !== undefined && {
        label: 'Original price',
        value: rupees(original),
      },
      withOffer !== undefined && {
        label: 'Prepaid offer',
        value: `−${rupees(price - withOffer)}`,
      },
    ].filter((row): row is { label: string; value: string } => row !== false);

    const listing = estimateListingPrice(c).estimate?.listing;
    if (listing)
      model.sellerPrice = {
        mid: listing.mid,
        low: listing.low,
        high: listing.high,
      };
  }

  if (ratingCount !== undefined) {
    const kept = 1 - returns / 100;
    const orders = (perRating: number): number =>
      ratingCount * perRating * kept;
    const range = (f: (perRating: number) => number): Range => ({
      low: f(cfg.ordersPerRating.lower),
      high: f(cfg.ordersPerRating.higher),
    });
    const lifetimeOrders = orders(cfg.ordersPerRating.base);
    const hasPace =
      ageDays !== undefined && ageDays >= cfg.minAgeDaysForMonthly;
    const perMonth = hasPace
      ? cfg.daysPerMonth / Math.max(ageDays, 1)
      : undefined;

    model.sales = {
      returnRatePct: returns,
      lifetimeOrders,
      lifetimeOrdersRange: range(orders),
      lifetimeSales: price !== undefined ? lifetimeOrders * price : undefined,
      lifetimeSalesRange:
        price !== undefined ? range((p) => orders(p) * price) : undefined,
      monthly:
        perMonth !== undefined
          ? {
              orders: lifetimeOrders * perMonth,
              ordersRange: range((p) => orders(p) * perMonth),
              sales:
                price !== undefined
                  ? lifetimeOrders * price * perMonth
                  : undefined,
              salesRange:
                price !== undefined
                  ? range((p) => orders(p) * price * perMonth)
                  : undefined,
            }
          : undefined,
    };
  }

  return model;
}
