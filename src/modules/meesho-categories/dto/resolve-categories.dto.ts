import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsInt, Min } from 'class-validator';

export const MAX_RESOLVE_IDS = 100;

/** `?ids=10177,10000` - the sub-sub-category ids the Meesho catalog form reports. */
export class ResolveCategoriesDto {
  @Transform(({ value }) =>
    String(value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
  )
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_RESOLVE_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
