// The auth guard drags in an ES-module-only JWT package that jest does not transform; the controller is tested without it.
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/models/user.model';
import { EstimateListingPriceDto } from './dto/estimate-listing-price.dto';
import { ListingPriceController } from './listing-price.controller';
import { ListingPriceService } from './listing-price.service';

describe('ListingPriceController usage', () => {
  const user = { userId: 'u1' } as User;
  const setup = () => {
    const recordUsage = jest.fn().mockResolvedValue(undefined);
    const controller = new ListingPriceController(
      {
        estimate: () => ({ status: 'experimental' }),
      } as unknown as ListingPriceService,
      { recordUsage } as unknown as SubscriptionsService,
    );
    return { controller, recordUsage };
  };

  it('counts one use when the view is opened', async () => {
    const { controller, recordUsage } = setup();
    await controller.estimate({ catalog: {} } as EstimateListingPriceDto, user);
    expect(recordUsage).toHaveBeenCalledWith('u1', 'listing.price.estimate');
  });

  it('does not count again when the shipping slider is moved', async () => {
    const { controller, recordUsage } = setup();
    await controller.estimate(
      { catalog: {}, adjustment: 60 } as EstimateListingPriceDto,
      user,
    );
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
