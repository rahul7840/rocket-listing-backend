import { SellerAnalysisService } from './seller-analysis.service';

/** A 2x2 white PNG: small, valid, and not WebP - enough to prove the image path runs. */
const catalog = {
  hero_product_name: 'Portronics Luxcell B12 Power Bank',
  sub_sub_category_name: 'Power Banks',
  category_id: 5012,
  min_product_price: 577,
  original_price: 1499,
  catalog_reviews_summary: { average_rating: 3.9, rating_count: 7014 },
  state_code: 'DL',
  activated_iso: '2024-03-15T18:43:56+0530',
  image: 'https://images.meesho.com/images/products/1/a_512.jpg',
  junk: 'should be dropped',
  url: 'https://www.meesho.com/power-bank/p/6ihva0',
};

describe('SellerAnalysisService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const pathFor = jest.fn();
  const generateInsights = jest.fn();
  const service = new SellerAnalysisService(
    { pathFor } as never,
    { generate: generateInsights } as never,
  );

  it('builds a one-page PDF, named after the product, with the category path from the lookup', async () => {
    pathFor.mockResolvedValue([
      'Electronics',
      'Mobile Accessories',
      'Chargers',
      'Power Banks',
    ]);
    generateInsights.mockResolvedValue({
      keywords: ['power bank'],
      takeaways: ['Priced low.'],
      tip: 'Lead with the capacity.',
    });
    const requested: string[] = [];
    global.fetch = jest.fn((input: string | URL | Request) => {
      requested.push(String(input));
      return Promise.resolve(new Response('not an image', { status: 404 }));
    }) as unknown as typeof fetch;

    const { pdf, filename } = await service.generate(catalog);

    expect(filename).toBe(
      'portronics-luxcell-b12-power-bank-rocket-listing-analysis.pdf',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length,
    ).toBe(1);
    expect(pathFor).toHaveBeenCalledWith(5012, 'Power Banks');
    expect(generateInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Portronics Luxcell B12 Power Bank',
        categoryPath: [
          'Electronics',
          'Mobile Accessories',
          'Chargers',
          'Power Banks',
        ],
        price: 577,
      }),
    );
    expect(requested).toEqual([
      'https://images.meesho.com/images/products/1/a_512.jpg',
    ]);
  });

  it('hands the model the listing text, and still makes a PDF (with N/A placeholders) from an almost empty product', async () => {
    pathFor.mockResolvedValue(undefined);
    generateInsights.mockResolvedValue(undefined);
    global.fetch = jest.fn() as unknown as typeof fetch;

    await service.generate({
      ...catalog,
      slug: 'portronics-luxcell-b12',
      description: 'Slim 10000 mAh power bank',
      full_details: 'Capacity: 10000 mAh',
    });
    expect(generateInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        subSubCategory: 'Power Banks',
        slug: 'portronics-luxcell-b12',
        description: 'Slim 10000 mAh power bank',
        details: 'Capacity: 10000 mAh',
      }),
    );

    const { pdf, filename } = await service.generate({});
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(filename).toBe('product-rocket-listing-analysis.pdf');
  });

  it('still produces the PDF when the category lookup or the image fails, and never fetches a foreign host', async () => {
    pathFor.mockRejectedValue(new Error('db down'));
    generateInsights.mockResolvedValue(undefined);
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('offline')),
    ) as unknown as typeof fetch;
    const { pdf } = await service.generate(catalog);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await service.generate({ ...catalog, image: 'https://evil.com/a.jpg' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
