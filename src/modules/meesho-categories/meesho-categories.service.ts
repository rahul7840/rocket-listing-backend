import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { MeeshoCategory } from './models/meesho-category.model';

/** A sub-sub-category with the names of everything above it in the tree. */
export interface ResolvedCategory {
  id: number;
  name: string;
  subCategory: string;
  category: string;
  superCategory: string;
  /** "Men Fashion > Mens Clothing > Men Top Wear > Tshirts" */
  path: string;
}

@Injectable()
export class MeeshoCategoriesService {
  constructor(
    @InjectModel(MeeshoCategory)
    private readonly categoryModel: typeof MeeshoCategory,
  ) {}

  /**
   * Looks up sub-sub-category ids (the id Meesho's catalog form carries as
   * `sub_sub_category_id`). Ids that do not exist are left out of the result.
   */
  async resolve(ids: number[]): Promise<ResolvedCategory[]> {
    const rows = await this.categoryModel.sequelize!.query<
      Omit<ResolvedCategory, 'path'>
    >(
      `SELECT s."externalId" AS "id",
              s.name,
              sc.name AS "subCategory",
              c.name AS "category",
              sup.name AS "superCategory"
         FROM config.meesho_categories s
         JOIN config.meesho_categories sc ON sc."meeshoCategoryId" = s."parentId"
         JOIN config.meesho_categories c ON c."meeshoCategoryId" = sc."parentId"
         JOIN config.meesho_categories sup ON sup."meeshoCategoryId" = c."parentId"
        WHERE s.level = 4 AND s."externalId" IN (:ids)
        ORDER BY s."externalId"`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    return rows.map((row) => ({
      ...row,
      path: [row.superCategory, row.category, row.subCategory, row.name].join(
        ' > ',
      ),
    }));
  }
}
