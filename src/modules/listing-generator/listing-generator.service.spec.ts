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

describe('ListingGeneratorService', () => {
  function service(generateJson: jest.Mock): ListingGeneratorService {
    const gemini = { generateJson } as unknown as GeminiClient;
    return new ListingGeneratorService(gemini);
  }

  it('renames a duplicate SKU so every variant stays unique, however many there are', async () => {
    const dto = makeDto({
      variants: [{ label: 'Black' }, { label: 'White' }, { label: 'Red' }, { label: 'Blue' }],
    });
    const generateJson = jest.fn().mockResolvedValue({
      productName: 'Wireless Mouse',
      description: 'A sleek wireless mouse.',
      variants: [{ sku: 'WM-001' }, { sku: 'WM-001' }, { sku: 'WM-001' }, { sku: 'WM-002' }],
    });

    const result = await service(generateJson).generate(dto);

    const skus = result.variants.map((v) => v.sku);
    expect(skus).toHaveLength(4);
    expect(new Set(skus).size).toBe(4);
    expect(skus[0]).toBe('WM-001');
  });

  it('falls back to a productName-derived SKU when Gemini omits one, instead of an unrelated code', async () => {
    const dto = makeDto({ productName: 'Wireless Mouse', variants: [{ label: 'Black' }] });
    const generateJson = jest.fn().mockResolvedValue({
      productName: 'Wireless Mouse',
      description: 'A sleek wireless mouse.',
      variants: [{ sku: '' }],
    });

    const result = await service(generateJson).generate(dto);

    expect(result.variants[0].sku.toUpperCase()).toContain('WIRELE');
  });

  it('passes through however many variants were requested without truncating or padding', async () => {
    const labels = Array.from({ length: 12 }, (_, i) => `Variant ${i + 1}`);
    const dto = makeDto({ variants: labels.map((label) => ({ label })) });
    const generateJson = jest.fn().mockResolvedValue({
      productName: 'Wireless Mouse',
      description: 'A sleek wireless mouse.',
      variants: labels.map((_, i) => ({ sku: `WM-${i}` })),
    });

    const result = await service(generateJson).generate(dto);

    expect(result.variants).toHaveLength(12);
  });
});
