import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, firstValueFrom } from 'rxjs';
import { UsageRecordingInterceptor } from './usage-recording.interceptor';
import { SubscriptionsService } from '../subscriptions.service';

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('UsageRecordingInterceptor', () => {
  function makeInterceptor(metadata: object | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(metadata),
    } as unknown as Reflector;
    const subscriptionsService = {
      recordUsage: jest.fn().mockResolvedValue(undefined),
    } as unknown as SubscriptionsService;
    const interceptor = new UsageRecordingInterceptor(
      reflector,
      subscriptionsService,
    );
    return { interceptor, subscriptionsService };
  }

  it('records usage after the protected operation succeeds', async () => {
    const { interceptor, subscriptionsService } = makeInterceptor({
      featureKey: 'listing.create',
    });
    const request = { user: { userId: 'user-1' } };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(
      interceptor.intercept(makeContext(request), next),
    );

    expect(result).toEqual({ ok: true });
    // recordUsage is fired-and-forgotten (void) inside tap, so let microtasks flush.
    await Promise.resolve();
    expect(subscriptionsService.recordUsage).toHaveBeenCalledWith(
      'user-1',
      'listing.create',
    );
  });

  it('does not record usage when the protected operation fails', async () => {
    const { interceptor, subscriptionsService } = makeInterceptor({
      featureKey: 'listing.create',
    });
    const request = { user: { userId: 'user-1' } };
    const next: CallHandler = {
      handle: () => throwError(() => new Error('business operation failed')),
    };

    await expect(
      firstValueFrom(interceptor.intercept(makeContext(request), next)),
    ).rejects.toThrow('business operation failed');
    expect(subscriptionsService.recordUsage).not.toHaveBeenCalled();
  });

  it('is a no-op when the route has no @RequiresLimit decorator', async () => {
    const { interceptor, subscriptionsService } = makeInterceptor(undefined);
    const request = { user: { userId: 'user-1' } };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(subscriptionsService.recordUsage).not.toHaveBeenCalled();
  });
});
