import { stateName } from './indian-states';
import {
  ageText,
  buildReport,
  chooseCategoryPath,
  compact,
  percentagesSummingTo100,
  REPORT_CONFIG,
  safeProductUrl,
} from './seller-analysis.report';

const NOW = new Date('2026-10-26T10:00:00+05:30');

const powerBank = {
  hero_product_name: 'Portronics Luxcell B12 Power Bank',
  sub_sub_category_name: 'Power Banks',
  category_id: 5012,
  min_product_price: 577,
  min_catalog_price: 577,
  original_price: 1499,
  special_offers: {
    display_text: '₹515 with 1 Special Offer',
    offers: [{ type: 'cod_unbundling', amount: 62 }],
  },
  catalog_reviews_summary: {
    average_rating: 3.9,
    rating_count: 7014,
    rating_count_map: { '1': 834, '2': 298, '3': 725, '4': 1459, '5': 3698 },
  },
  url: 'https://www.meesho.com/power-bank/p/6ihva0',
  state_code: 'DL',
  activated_iso: '2024-03-15T18:43:56+0530',
  image: 'https://images.meesho.com/images/products/1/a_512.jpg',
};

describe('formatting', () => {
  it('writes numbers the Indian short way', () => {
    expect(compact(846)).toBe('846');
    expect(compact(4400)).toBe('4.4K');
    expect(compact(6_970_000)).toBe('69.7L');
    expect(compact(14_000_000)).toBe('1.4Cr');
  });

  it('writes a listing age plainly', () => {
    expect(ageText(1)).toBe('1 day');
    expect(ageText(16)).toBe('16 days');
    expect(ageText(580)).toBe('19 months');
    expect(ageText(955)).toBe('2 years 7 months');
  });
});

describe('state names', () => {
  it('maps known codes and never guesses an unknown one', () => {
    expect(stateName('DL')).toBe('Delhi');
    expect(stateName('gj')).toBe('Gujarat');
    expect(stateName('ZZ')).toBeUndefined();
    expect(stateName(undefined)).toBeUndefined();
  });
});

describe('category path', () => {
  const path = ['Electronics', 'Mobile Accessories', 'Chargers', 'Power Banks'];
  it('uses the path the category id resolved to', () => {
    expect(chooseCategoryPath('Power Banks', path)).toEqual(path);
  });
  it("falls back to the product's own sub-sub-category name when nothing resolved", () => {
    expect(chooseCategoryPath('Car Polishes', undefined)).toEqual([
      'Car Polishes',
    ]);
    expect(chooseCategoryPath('Car Polishes', [])).toEqual(['Car Polishes']);
    expect(chooseCategoryPath(undefined, undefined)).toEqual([]);
  });
});

describe('product link', () => {
  it('accepts an https Meesho page and drops the query', () => {
    expect(
      safeProductUrl('https://www.meesho.com/power-bank/p/6ihva0?utm_source=x'),
    ).toBe('https://www.meesho.com/power-bank/p/6ihva0');
  });
  it('rejects anything else', () => {
    for (const bad of [
      'http://www.meesho.com/a',
      'https://evil.com/a',
      'https://meesho.com.evil.com/a',
      'https://u:p@www.meesho.com/a',
      'javascript:alert(1)',
      'nope',
      undefined,
    ]) {
      expect(safeProductUrl(bad)).toBeUndefined();
    }
  });
});

describe('buildReport', () => {
  const report = buildReport(powerBank, undefined, NOW);

  it('reads the product, seller state, listing age and rating', () => {
    expect(report.title).toBe('Portronics Luxcell B12 Power Bank');
    expect(report.soldFrom).toBe('Delhi');
    expect(report.listed).toEqual({
      age: '2 years 7 months',
      since: '15 Mar 2024',
    });
    expect(report.rating).toMatchObject({ average: 3.9, count: 7014 });
    expect(report.imageUrl).toContain('images.meesho.com');
  });

  it('works out the price, discount and prepaid-offer price', () => {
    expect(report.price).toEqual({
      current: 577,
      original: 1499,
      discountPct: 62,
      withOffer: 515,
    });
    expect(report.sellerPrice).toEqual({ mid: 513, low: 507, high: 520 });
  });

  it('takes no returns off by default, so the orders are ratings x orders-per-rating', () => {
    const orders = 7014 * REPORT_CONFIG.ordersPerRating.base;
    expect(report.sales?.returnRatePct).toBe(0);
    expect(report.sales?.lifetimeOrders).toBeCloseTo(orders);
    expect(report.sales?.lifetimeSales).toBeCloseTo(orders * 577);
  });

  it('takes the chosen return rate off the orders, then prices them', () => {
    const withReturns = buildReport(powerBank, undefined, NOW, 20);
    const kept = 0.8;
    const orders = 7014 * REPORT_CONFIG.ordersPerRating.base * kept;
    expect(withReturns.sales?.returnRatePct).toBe(20);
    expect(withReturns.sales?.lifetimeOrders).toBeCloseTo(orders);
    expect(withReturns.sales?.lifetimeSales).toBeCloseTo(orders * 577);
    expect(withReturns.sales?.lifetimeOrdersRange.low).toBeCloseTo(
      7014 * 1 * kept,
    );
    expect(withReturns.sales?.lifetimeOrdersRange.high).toBeCloseTo(
      7014 * 4 * kept,
    );
    expect(
      buildReport(powerBank, undefined, NOW, 0.5).sales?.returnRatePct,
    ).toBe(0.5);
  });

  it('keeps a silly return rate inside 0 to 50', () => {
    expect(
      buildReport(powerBank, undefined, NOW, 90).sales?.returnRatePct,
    ).toBe(50);
    expect(
      buildReport(powerBank, undefined, NOW, -5).sales?.returnRatePct,
    ).toBe(0);
    expect(
      buildReport(powerBank, undefined, NOW, Number.NaN).sales?.returnRatePct,
    ).toBe(0);
  });

  it('averages a month from the listing age', () => {
    const days = Math.floor(
      (NOW.getTime() - new Date('2024-03-15T18:43:56+05:30').getTime()) /
        86_400_000,
    );
    const perMonth = REPORT_CONFIG.daysPerMonth / days;
    expect(report.sales?.monthly?.orders).toBeCloseTo(
      report.sales!.lifetimeOrders * perMonth,
    );
    expect(report.sales?.monthly?.sales).toBeCloseTo(
      report.sales!.lifetimeSales! * perMonth,
    );
  });

  it('gives no monthly figure for a listing under 30 days old', () => {
    const young = buildReport(
      { ...powerBank, activated_iso: '2026-10-10T10:00:00+0530' },
      undefined,
      NOW,
    );
    expect(young.sales?.monthly).toBeUndefined();
    expect(young.sales?.lifetimeOrders).toBeGreaterThan(0);
  });

  it('leaves out what the data does not carry instead of inventing it', () => {
    const bare = buildReport({ hero_product_name: 'Thing' }, undefined, NOW);
    expect(bare.price).toBeUndefined();
    expect(bare.sales).toBeUndefined();
    expect(bare.soldFrom).toBeUndefined();
    expect(bare.listed).toBeUndefined();
    expect(bare.categoryPath).toEqual([]);
  });

  it('shows no discount when the original price is not above the price', () => {
    const flat = buildReport(
      { ...powerBank, original_price: 577 },
      undefined,
      NOW,
    );
    expect(flat.price?.original).toBeUndefined();
    expect(flat.price?.discountPct).toBeUndefined();
  });

  it('lists the values the seller price is worked out from, by plain names', () => {
    expect(report.priceInputs).toEqual([
      { label: 'Customer price', value: '₹577' },
      { label: 'Catalog price', value: '₹577' },
      { label: 'Original price', value: '₹1,499' },
      { label: 'Prepaid offer', value: '−₹62' },
    ]);
    expect(JSON.stringify(report.priceInputs)).not.toMatch(
      /min_|_price|special_offers/,
    );
  });

  it('turns the star counts into a chart that adds up to 100%', () => {
    const rows = report.rating?.rows ?? [];
    expect(rows.map((r) => r.star)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((r) => r.count)).toEqual([3698, 1459, 725, 298, 834]);
    expect(rows.reduce((a, r) => a + r.pct, 0)).toBe(100);
    expect(report.rating?.positivePct).toBe(rows[0].pct + rows[1].pct);
    expect(report.rating?.negativePct).toBe(rows[3].pct + rows[4].pct);
  });

  it('carries the product link only when it is a Meesho page', () => {
    expect(report.productUrl).toBe(
      'https://www.meesho.com/power-bank/p/6ihva0',
    );
    expect(
      buildReport({ ...powerBank, url: 'https://evil.com/x' }, undefined, NOW)
        .productUrl,
    ).toBeUndefined();
  });

  it('shows the category path the id resolved to', () => {
    const withPath = buildReport(
      powerBank,
      ['Electronics', 'Mobile Accessories', 'Power Banks'],
      NOW,
    );
    expect(withPath.categoryPath).toEqual([
      'Electronics',
      'Mobile Accessories',
      'Power Banks',
    ]);
  });
});

describe('percentagesSummingTo100', () => {
  it('always adds up to 100', () => {
    expect(percentagesSummingTo100([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(
      100,
    );
    expect(percentagesSummingTo100([0, 0])).toEqual([0, 0]);
  });
});
