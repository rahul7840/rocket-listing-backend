import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MAX_RESOLVE_IDS,
  ResolveCategoriesDto,
} from './resolve-categories.dto';

const parse = (ids: unknown) => plainToInstance(ResolveCategoriesDto, { ids });

describe('ResolveCategoriesDto', () => {
  it('turns "10177, 10000" into numbers', async () => {
    const dto = parse('10177, 10000');
    expect(dto.ids).toEqual([10177, 10000]);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a missing or empty list', async () => {
    expect(await validate(parse(undefined))).not.toHaveLength(0);
    expect(await validate(parse(' , '))).not.toHaveLength(0);
  });

  it('rejects non-numeric, zero and negative ids', async () => {
    expect(await validate(parse('abc'))).not.toHaveLength(0);
    expect(await validate(parse('0'))).not.toHaveLength(0);
    expect(await validate(parse('-5'))).not.toHaveLength(0);
    expect(await validate(parse('1.5'))).not.toHaveLength(0);
  });

  it('caps how many ids one request can ask for', async () => {
    const many = Array.from({ length: MAX_RESOLVE_IDS + 1 }, (_, i) => i + 1);
    expect(await validate(parse(many.join(',')))).not.toHaveLength(0);
  });
});
