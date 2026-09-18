import { ListingGeneratorService } from './listing-generator.service';
import { GeminiClient } from './gemini/gemini.client';
import { GenerateListingDto } from './dto/generate-listing.dto';

function makeDto(overrides: Partial<GenerateListingDto> = {}): GenerateListingDto {
  return {
    productName: 'Wireless Mouse',
    description: 'Old description',
    variants: [{ label: 'Black' }, { label: 'White' }],
    ...overrides,
  } as GenerateListingDto;
}

const GEMINI_RESPONSE = {
  productName: 'Wireless Mouse',
  description: 'A sleek wireless mouse.',
};

describe('ListingGeneratorService', () => {
  function service(generateJson: jest.Mock = jest.fn().mockResolvedValue(GEMINI_RESPONSE)): ListingGeneratorService {
    const gemini = { generateJson } as unknown as GeminiClient;
    return new ListingGeneratorService(gemini);
  }

  it('generates a SKU per variant, derived from the product name, with a trailing 4-char unique code', async () => {
    const dto = makeDto({ productName: 'Wireless Mouse', variants: [{ label: 'Black' }] });

    const result = await service().generate(dto);

    expect(result.variants).toHaveLength(1);
    // "WIRELE" (first 6 alnum chars of the product name) - "BLAC" (variant) - 4-char code
    expect(result.variants[0].sku).toMatch(/^WIRELE-BLAC-[A-Z0-9]{4}$/);
  });

  it('produces a unique SKU for every variant, however many there are - never a duplicate', async () => {
    const labels = Array.from({ length: 50 }, (_, i) => `Variant ${i + 1}`);
    const dto = makeDto({ variants: labels.map((label) => ({ label })) });

    const result = await service().generate(dto);

    const skus = result.variants.map((v) => v.sku);
    expect(skus).toHaveLength(50);
    expect(new Set(skus).size).toBe(50);
  });

  it('gives every variant a SKU tied to the product name even with no variant label', async () => {
    const dto = makeDto({ productName: 'Wireless Mouse', variants: [{}, {}, {}] });

    const result = await service().generate(dto);

    const skus = result.variants.map((v) => v.sku);
    expect(new Set(skus).size).toBe(3);
    for (const sku of skus) expect(sku).toMatch(/^WIRELE-[A-Z0-9]{4}$/);
  });

  it('ignores whatever SKU Gemini might still return - SKUs are always generated locally', async () => {
    const dto = makeDto({ variants: [{ label: 'Black' }] });
    const generateJson = jest.fn().mockResolvedValue({ ...GEMINI_RESPONSE, sku: 'RANDOM-UNRELATED-CODE' });

    const result = await service(generateJson).generate(dto);

    expect(result.variants[0].sku).not.toContain('RANDOM-UNRELATED-CODE');
    expect(result.variants[0].sku).toMatch(/^WIRELE-BLAC-[A-Z0-9]{4}$/);
  });

  it('falls back to productName/description when Gemini omits them', async () => {
    const dto = makeDto({ productName: 'Wireless Mouse', description: 'Old description', variants: [{}] });
    const generateJson = jest.fn().mockResolvedValue({ productName: '', description: '' });

    const result = await service(generateJson).generate(dto);

    expect(result.productName).toBe('Wireless Mouse');
    expect(result.description).toBe('Old description');
  });
});
