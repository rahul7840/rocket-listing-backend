/**
 * The three Seller Insights card actions that come with a paid plan, as monthly-limit plan features (Pro: 100 each,
 * Max and Rocket: unlimited; Free has no row, so it is denied). Edit the numbers in the admin panel.
 */
export const LISTING_IMAGES_FEATURE = 'listing.images.download';
export const LISTING_PRICE_FEATURE = 'listing.price.estimate';
export const LISTING_REPORT_FEATURE = 'listing.report.pdf';
/**
 * Seller Insights "Supplier details" (manufacturer, packer, importer, supplier of a product). A monthly limit: Pro 10,
 * Max and Rocket unlimited, Free no row (denied). One use is counted per product opened (POST /supplier-details/use).
 */
export const LISTING_SUPPLIER_FEATURE = 'supplier_detail.show';
