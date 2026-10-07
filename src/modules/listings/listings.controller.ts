import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { ListingsService } from './listings.service';

@Controller('listings')
@ApiTags('listings')
@UseGuards(JwtAuthGuard)
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /** Plan cap, used and remaining listings; `allowed` is false once the cap is used up. */
  @Get('usage')
  usage(@CurrentUser() user: User) {
    return this.listingsService.getStatus(user.userId);
  }

  /** Counts one filled listing. 403 { code: 'LIMIT_REACHED' } when the plan's cap is already used. */
  @Post('usage')
  record(@CurrentUser() user: User) {
    return this.listingsService.record(user.userId);
  }
}
