/**
 * Single source of truth for the marketplace image-variant presets.
 * Add/change a variant here only - nothing else needs to know about it.
 */
export interface ImageVariantPreset {
  readonly id: string;
  readonly name: string;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly quality: number;
  /** Proportional whitespace added around the resized image, on each side. */
  readonly paddingPercent: number;
}

export const IMAGE_VARIANT_PRESETS: readonly ImageVariantPreset[] = [
  {
    id: 'v1',
    name: 'balanced',
    maxWidth: 1500,
    maxHeight: 1500,
    quality: 90,
    paddingPercent: 0,
  },
  {
    id: 'v2',
    name: 'medium',
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 85,
    paddingPercent: 0,
  },
  {
    id: 'v3',
    name: 'compressed',
    maxWidth: 1000,
    maxHeight: 1000,
    quality: 75,
    paddingPercent: 0,
  },
  {
    id: 'v4',
    name: 'compact',
    maxWidth: 1000,
    maxHeight: 1000,
    quality: 65,
    paddingPercent: 5,
  },
  {
    id: 'v5',
    name: 'small',
    maxWidth: 800,
    maxHeight: 800,
    quality: 70,
    paddingPercent: 10,
  },
  {
    id: 'v6',
    name: 'aggressive-compression',
    maxWidth: 800,
    maxHeight: 800,
    quality: 55,
    paddingPercent: 10,
  },
] as const;
