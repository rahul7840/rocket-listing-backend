import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeeshoCategoriesService } from './meesho-categories.service';
import { ResolveCategoriesDto } from './dto/resolve-categories.dto';

@Controller('meesho-categories')
@ApiTags('meesho-categories')
@UseGuards(JwtAuthGuard)
export class MeeshoCategoriesController {
  constructor(private readonly categoriesService: MeeshoCategoriesService) {}

  /** GET /meesho-categories/resolve?ids=10177,10000 */
  @Get('resolve')
  resolve(@Query() query: ResolveCategoriesDto) {
    return this.categoriesService.resolve(query.ids);
  }
}
