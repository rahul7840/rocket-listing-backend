import { estimateListingPrice } from './listing-price.algorithm';

const payload = {
  min_catalog_price: 136,
  min_product_price: 136,
  original_price: 155,
  total_discount_in_rs: 19,
  deal: {
    deal_price: { price: 136, original_price: 155 },
    original_price: { price: 146 },
  },
  special_offers: {
    display_text: '₹107 with 1 Special Offers',
    offers: [{ type: 'cod_unbundling', amount: 29 }],
  },
};

describe('estimateListingPrice', () => {
  it('extracts the reply fields as they are', () => {
    const r = estimateListingPrice(payload);
    const byKey = Object.fromEntries(r.fields.map((f) => [f.key, f.value]));
    expect(byKey).toMatchObject({
      productPrice: 136,
      originalPrice: 155,
      dealPrice: 136,
      dealOriginal: 146,
      offerAmount: 29,
    });
  });

  it('checks the discount and the offer price, and flags the 155 vs 146 gap', () => {
    const notes = estimateListingPrice(payload).notes.join(' | ');
    expect(notes).toContain('Discount checks out');
    expect(notes).toContain('₹107 = ₹136 - ₹29');
    expect(notes).toContain('₹146 differs from original price ₹155');
  });

  it('subtracts the default adjustment and spans 57-70', () => {
    const { estimate } = estimateListingPrice(payload);
    expect(estimate?.listing).toEqual({ low: 66, mid: 72, high: 79 });
    expect(estimate?.adjustment.selected).toBe(64);
  });

  it('follows the slider and widens the range when it leaves 57-70', () => {
    expect(estimateListingPrice(payload, 60).estimate?.listing.mid).toBe(76);
    expect(estimateListingPrice(payload, 80).estimate?.listing).toEqual({
      low: 56,
      mid: 56,
      high: 79,
    });
    expect(estimateListingPrice(payload, 5).estimate?.adjustment.selected).toBe(
      40,
    );
  });

  it('says so when there is no price or nothing is left after the adjustment', () => {
    expect(estimateListingPrice({}).status).toBe('insufficient');
    expect(estimateListingPrice(undefined).status).toBe('insufficient');
    expect(estimateListingPrice({ min_product_price: 50 }).status).toBe(
      'insufficient',
    );
  });
});
