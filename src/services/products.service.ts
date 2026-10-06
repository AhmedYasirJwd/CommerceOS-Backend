import { categoriesRepository } from '../repositories/categories.repository.js';
import { productsRepository } from '../repositories/products.repository.js';
import { notFound } from '../utils/errors.js';
import { slugify } from '../utils/slug.js';
import {
  PRODUCT_SORT_COLUMNS,
  type CreateProductInput,
  type ListProductsQuery,
  type UpdateProductInput,
} from '../validators/products.validator.js';
import { toProduct } from './mappers.js';

const productNotFound = () => notFound('PRODUCT_NOT_FOUND', 'Product not found');

/** A category must belong to the same store; the foreign key alone does not guarantee that. */
async function assertCategory(storeId: string, categoryId: string | null | undefined) {
  if (categoryId && !(await categoriesRepository.exists(storeId, categoryId))) {
    throw notFound('CATEGORY_NOT_FOUND', 'Category not found');
  }
}

export const productsService = {
  async list(storeId: string, query: ListProductsQuery) {
    const result = await productsRepository.list(
      storeId,
      {
        search: query.search,
        category: query.category,
        stock: query.stock,
        active: query.active,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
      },
      { column: PRODUCT_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toProduct), pagination: result.pagination };
  },

  async get(storeId: string, id: string) {
    const row = await productsRepository.findById(storeId, id);
    if (!row) throw productNotFound();
    return toProduct(row);
  },

  async create(storeId: string, input: CreateProductInput) {
    await assertCategory(storeId, input.categoryId);

    const id = await productsRepository.create(storeId, {
      name: input.name,
      price: input.price,
      categoryId: input.categoryId ?? null,
      slug: input.slug ?? (slugify(input.name) || null),
      description: input.description ?? null,
      sku: input.sku ?? null,
      costPrice: input.costPrice ?? null,
      active: input.active,
      initialQuantity: input.initialQuantity,
      lowStockThreshold: input.lowStockThreshold ?? null,
    });
    return this.get(storeId, id);
  },

  /** Stock levels are changed through /api/inventory so every change is recorded as a movement. */
  async update(storeId: string, id: string, input: UpdateProductInput) {
    await assertCategory(storeId, input.categoryId);

    const updated = await productsRepository.update(storeId, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.costPrice !== undefined && { cost_price: input.costPrice }),
      ...(input.categoryId !== undefined && { category_id: input.categoryId }),
      ...(input.active !== undefined && { active: input.active }),
    });
    if (!updated) throw productNotFound();
    return this.get(storeId, id);
  },

  /**
   * Permanently deletes the product with its inventory and movement history.
   * Past orders keep their line items (product name and price are stored on
   * order_items). To hide a product but keep its history, PATCH active=false.
   */
  async remove(storeId: string, id: string) {
    if (!(await productsRepository.delete(storeId, id))) throw productNotFound();
    return { id, deleted: true };
  },
};
