import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { ProductCostsService } from './product-costs.service';
import { UpsertProductCostDto } from './dto/upsert-product-cost.dto';

@Controller('product-costs')
@ApiTags('product-costs')
@UseGuards(JwtAuthGuard)
export class ProductCostsController {
  constructor(private readonly productCostsService: ProductCostsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.productCostsService.list(user.userId);
  }

  @Put()
  upsert(@Body() dto: UpsertProductCostDto, @CurrentUser() user: User) {
    return this.productCostsService.upsert(user.userId, dto);
  }

  @Delete(':sku')
  remove(@Param('sku') sku: string, @CurrentUser() user: User) {
    return this.productCostsService.remove(
      user.userId,
      decodeURIComponent(sku),
    );
  }
}
