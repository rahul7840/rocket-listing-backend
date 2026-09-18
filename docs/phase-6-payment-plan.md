# Phase 6 — Payment, Webhooks & Billing (not implemented yet)

Status: **planning only**. Nothing in this document has been built. This file exists so
the plan survives between sessions and doesn't need to be re-explained when Phase 6
actually starts. Phases 1-5 (plans, user_subscriptions, usage_counters,
SubscriptionsService entitlement engine, guards/decorators) are complete and are the
foundation this plugs into without any redesign.

## Where Phase 6 fits in the roadmap

| Phase | What it built | Status |
|---|---|---|
| 1 | `plans` + `plan_features` | done |
| 2 | `user_subscriptions`, subscription history, current-plan resolution | done |
| 3 | `usage_counters`, `UsageService` | done |
| 4 | `SubscriptionsService` entitlement engine (`canUse`, `checkLimit`, `recordUsage`) | done |
| 5 | `@RequiresFeature`/`@RequiresLimit` guards wired onto `TemplatesController` | done |
| 6 | Payment gateway + webhooks + billing | **this phase - not started** |

## The core insight

Every piece Phase 6 needs already exists:

- `SubscriptionsService.assignPlan(userId, planCode, source, { currentPeriodStart?, currentPeriodEnd? })`
  already accepts `SubscriptionSource.PAYMENT` and an optional period window - a
  successful payment is just a call to this method. See
  `src/modules/subscriptions/subscriptions.service.ts`.
- `SubscriptionsService.expireSubscription(userId)` already flips the active row to
  `expired` and stamps `currentPeriodEnd` - a failed renewal is just a call to this.
- Every guard (`SubscriptionFeatureGuard`, `SubscriptionLimitGuard`) always resolves the
  plan **live** from the database on every request - nothing is cached, so a plan change
  takes effect on the user's very next API call with zero extra wiring.
- `user_subscriptions` already preserves full history and already has a `source` column
  (`admin` / `system` / `payment`) distinguishing how a plan was granted.

So Phase 6 is almost entirely: **payment gateway integration + a webhook handler that
calls the two methods above.** No changes to the permission/entitlement system itself.

## The flows (as agreed)

### Upgrade

```
User clicks "Upgrade to Pro"
  -> Payment Gateway checkout
  -> Payment successful
  -> Payment webhook fires
  -> Backend verifies the webhook signature/payload
  -> SubscriptionsService.assignPlan(userId, 'PRO', SubscriptionSource.PAYMENT, { currentPeriodEnd })
  -> user_subscriptions: old row closed, new PRO row active
  -> Every subsequent request resolves PRO live via SubscriptionsService
  -> Pro features immediately available - no cache to invalidate, no extra step
```

### Renewal

```
Pro subscription nears/reaches currentPeriodEnd
  -> Payment gateway auto-charges (per its own billing cycle)
  -> Renewal successful webhook fires
  -> Backend extends currentPeriodEnd on the SAME active subscription row
     (does not need a new assignPlan/history row - it's the same stint, just extended)
```

This is the one operation that doesn't map onto an existing method yet: `assignPlan`
always closes-and-replaces, which is correct for a *plan change* but wrong for a
same-plan renewal (that should just extend the period, not create new history rows on
every billing cycle). Phase 6 will need one new method, tentatively:

```ts
SubscriptionsService.extendCurrentPeriod(userId: string, currentPeriodEnd: Date): Promise<UserSubscription>
```

...which updates `currentPeriodEnd` in place on the existing active row instead of
calling `assignPlan`.

### Payment failure / expiry

```
Pro subscription's currentPeriodEnd passes with no successful renewal
  -> A scheduled job (or the next payment-gateway "subscription cancelled" webhook)
     calls SubscriptionsService.expireSubscription(userId)
  -> user_subscriptions: status = expired
  -> User now has NO active subscription
  -> SubscriptionsService.getCurrentPlan(userId) resolves to null
```

Open design question for Phase 6: does "no active subscription" mean the user is
blocked entirely, or does it mean "fall back to Free"? The entitlement engine currently
treats "no active subscription" as `NO_ACTIVE_SUBSCRIPTION` (deny), which is NOT the
same as being on Free. Two options to resolve when this phase starts:
1. A scheduled job proactively re-assigns Free (`assignPlan(userId, 'FREE', SYSTEM)`)
   when a subscription expires, so the user always has *some* active subscription.
2. Or teach `SubscriptionsService` to treat "no active subscription" as an implicit
   Free-tier fallback rather than a hard denial.
Option 1 is simpler and keeps the "exactly one active subscription per user" invariant
clean (backed by the partial unique index) - lean toward that unless a reason emerges
not to.

### Admin-granted upgrades (already fully supported today)

```
Admin Panel -> Select User -> Select Pro/Max/Rocket
  -> Backend
  -> SubscriptionsService.assignPlan(userId, planCode, SubscriptionSource.ADMIN)
  -> user_subscriptions: source = 'admin'
  -> New permissions live immediately
```

No new capability needed here - `assignPlan` already does exactly this. The only
missing piece is the admin-facing HTTP endpoint/UI to call it (explicitly out of scope
until an admin module exists - see Phase 1-5 notes).

## What Phase 6 will actually need to build

1. **Payment gateway integration** (Razorpay/Stripe/whatever is chosen) - checkout
   session creation, likely a new `PaymentsModule`.
2. **Webhook endpoint** - verifies the gateway's signature, is idempotent (a webhook can
   fire more than once for the same event), and dispatches to:
   - `assignPlan(..., SubscriptionSource.PAYMENT, { currentPeriodEnd })` on first purchase/upgrade
   - the new `extendCurrentPeriod(...)` method on renewal
   - `expireSubscription(...)` (or the Free-fallback job from the open question above) on failure/cancellation
3. **A `payments`/`invoices` table** (separate from `user_subscriptions`) if billing
   history/receipts are needed - deliberately not part of Phases 1-5's scope.
4. **A scheduled job** (`@nestjs/schedule` is not yet a dependency) to catch
   subscriptions that silently lapse without a gateway webhook firing (safety net).
5. **Upgrade/downgrade checkout endpoints** the extension calls to start a purchase.
6. **Admin endpoints** to call `assignPlan`/`expireSubscription` over HTTP, if/when an
   admin panel exists.

None of this requires touching `plans`, `plan_features`, the entitlement logic in
`SubscriptionsService`, or any of the guards - by design.
