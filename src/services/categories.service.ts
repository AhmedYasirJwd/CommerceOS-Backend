import { categoriesRepository } from '../repositories/categories.repository.js';
import { badRequest, conflict, notFound, onDuplicate } from '../utils/errors.js';
import { slugify } from '../utils/slug.js';
import {
  CATEGORY_SORT_COLUMNS,
  type CreateCategoryInput,
  type ListCategoriesQuery,
  type UpdateCategoryInput,
} from '../validators/categories.validator.js';
import { toCategory } from './mappers.js';

const categoryNotFound = () => notFound('CATEGORY_NOT_FOUND', 'Category not found');
const slugTaken = () => conflict('CATEGORY_SLUG_EXISTS', 'A category with this slug already exists in this store');

export const categoriesService = {
  async list(storeId: string, query: ListCategoriesQuery) {
    const result = await categoriesRepository.list(
      storeId,
      query.search,
      { column: CATEGORY_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toCategory), pagination: result.pagination };
  },

  async get(storeId: string, id: string) {
    const row = await categoriesRepository.findById(storeId, id);
    if (!row) throw categoryNotFound();
    return toCategory(row);
  },

  async create(storeId: string, input: CreateCategoryInput) {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw badRequest('INVALID_SLUG', 'Could not derive a slug from the name; provide `slug` explicitly');
    if (await categoriesRepository.findIdBySlug(storeId, slug)) throw slugTaken();

    const id = await onDuplicate(
      categoriesRepository.insert(storeId, { name: input.name, slug, description: input.description ?? null }),
      slugTaken,
    );
    return this.get(storeId, id);
  },

  async update(storeId: string, id: string, input: UpdateCategoryInput) {
    if (input.slug) {
      const existing = await categoriesRepository.findIdBySlug(storeId, input.slug);
      if (existing && existing !== id) throw slugTaken();
    }

    const updated = await onDuplicate(
      categoriesRepository.update(storeId, id, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
      }),
      slugTaken,
    );
    if (!updated) throw categoryNotFound();
    return this.get(storeId, id);
  },

  /** Products in the category are kept and become uncategorized (ON DELETE SET NULL). */
  async remove(storeId: string, id: string) {
    if (!(await categoriesRepository.delete(storeId, id))) throw categoryNotFound();
    return { id, deleted: true };
  },
};
