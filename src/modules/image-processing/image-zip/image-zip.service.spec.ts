import { unzipSync } from 'fflate';
import { ImageZipService, allowedImageUrl, zipStem } from './image-zip.service';

describe('allowedImageUrl', () => {
  it('accepts https Meesho image hosts', () => {
    expect(
      allowedImageUrl('https://images.meesho.com/images/p/1_512.webp'),
    ).toBeDefined();
    expect(allowedImageUrl('https://meesho.com/a.jpg')).toBeDefined();
  });

  it('rejects other hosts, look-alikes, plain http, ports and credentials', () => {
    for (const bad of [
      'https://evil.com/a.jpg',
      'https://meesho.com.evil.com/a.jpg',
      'https://notmeesho.com/a.jpg',
      'http://images.meesho.com/a.jpg',
      'https://images.meesho.com:8443/a.jpg',
      'https://user:pass@images.meesho.com/a.jpg',
      'http://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(allowedImageUrl(bad)).toBeUndefined();
    }
  });
});

describe('zipStem', () => {
  it('makes a safe file name stem', () => {
    expect(zipStem('Wall Hooks (Pack of 6)!')).toBe('wall-hooks-pack-of-6');
    expect(zipStem('../../etc/passwd')).toBe('etc-passwd');
    expect(zipStem(undefined)).toBe('listing');
    expect(zipStem('???')).toBe('listing');
  });
});

describe('ImageZipService.zipImages', () => {
  const service = new ImageZipService();
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const image = (bytes: number[], type = 'image/webp') =>
    new Response(new Uint8Array(bytes), { headers: { 'content-type': type } });

  it('zips the images it can fetch, in order, and skips the rest', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('a.webp')) return Promise.resolve(image([1, 2, 3]));
      if (url.endsWith('b.jpg'))
        return Promise.resolve(image([4, 5], 'image/jpeg'));
      return Promise.resolve(new Response('nope', { status: 404 }));
    }) as unknown as typeof fetch;

    const result = await service.zipImages(
      [
        'https://images.meesho.com/a.webp',
        'https://images.meesho.com/missing.webp',
        'https://images.meesho.com/b.jpg',
        'https://images.meesho.com/a.webp',
        'https://evil.com/c.jpg',
      ],
      'Wall Hooks',
    );

    expect(calls).toHaveLength(3); // duplicate and off-host links are never fetched
    expect(result.filename).toBe('wall-hooks-rocket-listing-img.zip');
    expect(result.included).toBe(2);
    const files = unzipSync(new Uint8Array(result.zip));
    expect(Object.keys(files)).toEqual(['01.webp', '02.jpg']);
    expect(Array.from(files['01.webp'])).toEqual([1, 2, 3]);
  });

  it('rejects a request with no allowed links, and one where nothing downloads', async () => {
    await expect(service.zipImages(['https://evil.com/a.jpg'])).rejects.toThrow(
      'No downloadable',
    );
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('offline')),
    ) as unknown as typeof fetch;
    await expect(
      service.zipImages(['https://images.meesho.com/a.webp']),
    ).rejects.toThrow('Could not download');
  });
});
