import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ProductCost } from './models/product-cost.model';
import { UpsertProductCostDto } from './dto/upsert-product-cost.dto';

export interface ProductCostItem {
  sku: string;
  productCost: number;
  packagingCost: number;
  otherCost: number;
}

@Injectable()
export class ProductCostsService {
  constructor(
    @InjectModel(ProductCost)
    private readonly productCostModel: typeof ProductCost,
  ) {}

  private toItem(row: any): ProductCostItem {
    return {
      sku: row.sku,
      productCost: Number(row.productCost ?? 0),
      packagingCost: Number(row.packagingCost ?? 0),
      otherCost: Number(row.otherCost ?? 0),
    };
  }

  async list(userId: string): Promise<ProductCostItem[]> {
    const rows = await this.productCostModel.findAll({
      where: { userId },
      order: [['sku', 'ASC']],
      raw: true,
    });
    return rows.map((r) => this.toItem(r));
  }

  /** Looked up by callers that need cost-per-SKU as a map (e.g. profitability calc). */
  async mapForUser(userId: string): Promise<Map<string, ProductCostItem>> {
    const rows = await this.list(userId);
    return new Map(rows.map((r) => [r.sku, r]));
  }

  async upsert(
    userId: string,
    dto: UpsertProductCostDto,
  ): Promise<ProductCostItem> {
    const [row] = await this.productCostModel.upsert(
      {
        userId,
        sku: dto.sku,
        productCost: dto.productCost,
        packagingCost: dto.packagingCost,
        otherCost: dto.otherCost,
      },
      { conflictFields: ['userId', 'sku'] as any },
    );
    return this.toItem(row);
  }

  async remove(userId: string, sku: string): Promise<void> {
    await this.productCostModel.destroy({ where: { userId, sku } });
  }
}
