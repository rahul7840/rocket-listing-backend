import { Type } from '@nestjs/common';
import { ResourceCountResolver } from './interfaces/resource-count-resolver.interface';

export const REQUIRES_FEATURE_KEY = 'subscription:requiresFeature';
export const REQUIRES_LIMIT_KEY = 'subscription:requiresLimit';

export interface RequiresLimitMetadata {
  featureKey: string;
  /**
   * Only needed for standing-cap resource limits (a plan feature with no
   * period, e.g. "max 5 templates") - a provider, resolvable anywhere in the
   * app's DI graph, that counts the user's existing resources. Omit it for
   * period-based limits (daily/monthly): those are resolved from
   * UsageService automatically.
   */
  resolver?: Type<ResourceCountResolver>;
}
