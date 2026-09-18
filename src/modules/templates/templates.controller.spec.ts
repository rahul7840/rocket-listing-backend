// @nestjs/jwt ships as pure ESM, which Jest's default CJS transform can't
// parse. Stubbing it out is safe here: this spec only inspects route
// metadata via Reflect, it never instantiates JwtAuthGuard/JwtService.
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { TemplatesController } from './templates.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionFeatureGuard } from '../subscriptions/guards/subscription-feature.guard';
import { SubscriptionLimitGuard } from '../subscriptions/guards/subscription-limit.guard';
import { UsageRecordingInterceptor } from '../subscriptions/interceptors/usage-recording.interceptor';
import {
  REQUIRES_FEATURE_KEY,
  REQUIRES_LIMIT_KEY,
} from '../subscriptions/subscription.constants';

/**
 * Proves the subscription system is wired onto the intended routes only -
 * without a live DB or HTTP server - and, just as importantly, that
 * JwtAuthGuard (existing authentication) was not removed anywhere. This is
 * what stands in for "unauthenticated request" / "direct API request
 * without the extension" for these routes: both are rejected by
 * JwtAuthGuard before a subscription guard ever runs, exactly as before
 * this phase.
 */
describe('TemplatesController subscription wiring', () => {
  it('still requires authentication at the controller level (unchanged from before this phase)', () => {
    const controllerGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      TemplatesController,
    );
    expect(controllerGuards).toContain(JwtAuthGuard);
  });

  it('gates template creation with a limit check on "template.create"', () => {
    const handler = TemplatesController.prototype.create;
    expect(Reflect.getMetadata(REQUIRES_LIMIT_KEY, handler)).toMatchObject({
      featureKey: 'template.create',
    });
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      SubscriptionLimitGuard,
    );
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toContain(
      UsageRecordingInterceptor,
    );
  });

  it('gates template deletion with a feature check on "template.delete"', () => {
    const handler = TemplatesController.prototype.remove;
    expect(Reflect.getMetadata(REQUIRES_FEATURE_KEY, handler)).toBe(
      'template.delete',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      SubscriptionFeatureGuard,
    );
  });

  it('leaves findAll and incrementPlayCount unguarded by subscription checks (not subscription-controlled yet)', () => {
    expect(
      Reflect.getMetadata(
        REQUIRES_LIMIT_KEY,
        TemplatesController.prototype.findAll,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        REQUIRES_FEATURE_KEY,
        TemplatesController.prototype.incrementPlayCount,
      ),
    ).toBeUndefined();
  });
});
