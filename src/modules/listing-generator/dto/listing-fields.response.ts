export class GeneratedVariant {
  sku: string;
}

export class ListingFieldsResponse {
  productName: string;
  description: string;
  /** Same order and length as the request's `variants` array. */
  variants: GeneratedVariant[];
}
