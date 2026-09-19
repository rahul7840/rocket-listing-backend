import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlansService } from '../../plans/plans.service';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpsertPlanFeatureDto } from './dto/upsert-plan-feature.dto';

@Controller('admin/plans')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.updatePlan(id, dto);
  }

  @Patch(':id/features/:featureKey')
  upsertFeature(
    @Param('id') id: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: UpsertPlanFeatureDto,
  ) {
    return this.plansService.upsertPlanFeature(id, featureKey, dto);
  }
}
