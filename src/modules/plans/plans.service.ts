import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Plan } from './models/plan.model';
import { PlanFeature } from './models/plan-feature.model';

/**
 * Read-only access to plans and their feature configuration.
 * Enforcement (guards, usage checks) and mutation (admin CRUD) land in a later phase.
 */
@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan)
    private readonly planModel: typeof Plan,
  ) {}

  async findAll(): Promise<Plan[]> {
    return this.planModel.findAll({
      include: [PlanFeature],
      order: [['createdAt', 'ASC']],
    });
  }

  async findByCode(code: string): Promise<Plan | null> {
    return this.planModel.findOne({
      where: { code },
      include: [PlanFeature],
    });
  }
}
