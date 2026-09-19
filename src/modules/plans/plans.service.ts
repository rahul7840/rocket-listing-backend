import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Plan } from './models/plan.model';
import {
  PlanFeature,
  PlanFeaturePeriod,
  PlanFeatureValueType,
} from './models/plan-feature.model';

export interface UpdatePlanOptions {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpsertPlanFeatureOptions {
  valueType: PlanFeatureValueType;
  boolValue?: boolean | null;
  limitValue?: number | null;
  isUnlimited?: boolean;
  period?: PlanFeaturePeriod | null;
  metadata?: object;
}

/**
 * Read access to plans and their feature configuration, plus admin-driven
 * mutation (findAll/findByCode stay read-only and are relied on by the
 * entitlement engine in SubscriptionsService - additive methods only below).
 */
@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan)
    private readonly planModel: typeof Plan,
    @InjectModel(PlanFeature)
    private readonly planFeatureModel: typeof PlanFeature,
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

  async findById(planId: string): Promise<Plan> {
    const plan = await this.planModel.findByPk(planId, {
      include: [PlanFeature],
    });
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    return plan;
  }

  /** Admin-driven metadata edit - never touches feature rows, see upsertPlanFeature for that. */
  async updatePlan(planId: string, options: UpdatePlanOptions): Promise<Plan> {
    const plan = await this.findById(planId);
    await plan.update({ ...options });
    return this.findById(planId);
  }

  /**
   * Creates or replaces the PlanFeature row for (planId, featureKey). Used
   * by the admin module to configure entitlements without a migration for
   * every plan/feature combination.
   */
  async upsertPlanFeature(
    planId: string,
    featureKey: string,
    options: UpsertPlanFeatureOptions,
  ): Promise<PlanFeature> {
    // Ensures the plan exists (404s otherwise) before touching its features.
    await this.findById(planId);

    const [feature] = await this.planFeatureModel.findOrCreate({
      where: { planId, featureKey },
      defaults: {
        planId,
        featureKey,
        valueType: options.valueType,
        boolValue: options.boolValue ?? null,
        limitValue: options.limitValue ?? null,
        isUnlimited: options.isUnlimited ?? false,
        period: options.period ?? null,
        metadata: options.metadata ?? {},
      },
    });

    return feature.update({
      valueType: options.valueType,
      boolValue: options.boolValue ?? null,
      limitValue: options.limitValue ?? null,
      isUnlimited: options.isUnlimited ?? false,
      period: options.period ?? null,
      metadata: options.metadata ?? feature.metadata,
    });
  }
}
