import { UseGuards } from '@nestjs/common';
import { PaidPlanGuard } from '../guards/paid-plan.guard';

/**
 * The route is for paid plans only (Pro, Max, Rocket); Free gets 403. Used on the Seller Insights card actions: the
 * listing images zip, the listing price estimate and the PDF report. Must be used on a route that already runs
 * JwtAuthGuard.
 */
export const RequiresPaidPlan = () => UseGuards(PaidPlanGuard);
