# Seller listing price (experimental)

Shown on the Meesho product page, in the **Seller Insights** card, under the *Download all images* button:
**See seller listing price**. The button turns the card to a larger view (no popup) with the estimate, its range and a
slider.

All logic lives in the backend (`src/modules/listing-price/listing-price.algorithm.ts`). The extension only forwards the
pricing part of the product reply and draws what comes back.

## API

`POST /api/listing-price/estimate` (signed-in users)

```json
{ "catalog": { "min_product_price": 136, "original_price": 155, "deal": {}, "special_offers": {} }, "adjustment": 64 }
```

`adjustment` is optional (the slider value). The reply:

| Field | Meaning |
| --- | --- |
| `status` | `experimental`, or `insufficient` (with `reason`) when there is no usable price |
| `fields[]` | Values read as-is from the reply: label, value and the field they came from |
| `notes[]` | Consistency checks and discrepancies found in those values |
| `estimate.basePrice` | Customer price the estimate starts from |
| `estimate.adjustment` | `min`, `max`, `selected`, and the slider bounds |
| `estimate.listing` | `low`, `mid`, `high` estimated seller listing price |
| `algorithm` | Name, version, the steps with this product's numbers, and the disclaimer |

## What the reply gives us, and what it does not

Taken as-is (never estimated): `min_product_price`, `min_catalog_price`, `original_price`, `total_discount_in_rs`,
`deal.deal_price`, `deal.original_price`, and the prepaid (`cod_unbundling`) offer amount.

Not in the reply: the seller-entered supplier-panel price and the payout. These are the only thing estimated.

## Algorithm (`v1-field-first`)

```
P = min_product_price (else min_catalog_price)       customer price
A = shipping and fees between seller price and P      default 64, assumed range 57 - 70
listing price  = P - A
range          = P - max(70, A)   ...   P - min(57, A)
```

Worked example from the sample reply (P = 136):

| | |
| --- | --- |
| Mid (A = 64) | 136 - 64 = **72** |
| Range (A = 70 .. 57) | **66 - 79** |

Checks that run on the extracted values (they inform the notes, they never change the estimate):

- `original_price - customer price` should equal `total_discount_in_rs` (155 - 136 = 19).
- `customer price - prepaid offer amount` should equal the price in `special_offers.display_text` (136 - 29 = 107).
- `deal.original_price.price` (146) is compared with `original_price` (155); a gap is reported, and neither is treated as
  the seller's price. The special-offer price (107) is never used as the normal price.

## Limits

- The 57 - 70 adjustment is a provisional assumption, not a Meesho figure. The estimate is labelled **Experimental**
  with **low** confidence.
- To promote it: collect seller-confirmed panel prices (voluntarily shared) with the full reply, compare candidate
  formulas by mean absolute error and by the share of estimates within Rs 5 / 10 / 20, then replace
  `LISTING_PRICE_CONFIG.adjustment` (or the formula) and bump `version`.
- `rating_count` (25,637) and `review_count` (9,440) are separate metrics, not orders; the sales estimate stays a
  separate, adjustable model in the card.
