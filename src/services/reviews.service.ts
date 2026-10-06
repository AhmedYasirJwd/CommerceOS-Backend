import { customersRepository } from '../repositories/customers.repository.js';
import { productsRepository } from '../repositories/products.repository.js';
import { reviewsRepository } from '../repositories/reviews.repository.js';
import { notFound } from '../utils/errors.js';
import {
  REVIEW_SORT_COLUMNS,
  type CreateReviewInput,
  type ListReviewsQuery,
  type UpdateReviewInput,
} from '../validators/reviews.validator.js';
import { toReview } from './mappers.js';

const reviewNotFound = () => notFound('REVIEW_NOT_FOUND', 'Review not found');

async function assertCustomer(storeId: string, customerId: string | null | undefined) {
  if (customerId && !(await customersRepository.exists(storeId, customerId))) {
    throw notFound('CUSTOMER_NOT_FOUND', 'Customer not found');
  }
}

export const reviewsService = {
  async list(storeId: string, query: ListReviewsQuery) {
    const result = await reviewsRepository.list(
      storeId,
      {
        search: query.search,
        productId: query.productId,
        customerId: query.customerId,
        rating: query.rating,
        minRating: query.minRating,
        maxRating: query.maxRating,
        sentiment: query.sentiment,
      },
      { column: REVIEW_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toReview), pagination: result.pagination };
  },

  async get(storeId: string, id: string) {
    const row = await reviewsRepository.findById(storeId, id);
    if (!row) throw reviewNotFound();
    return toReview(row);
  },

  /** `sentiment` may be set manually; automatic sentiment analysis is a later (AI) phase. */
  async create(storeId: string, input: CreateReviewInput) {
    if (!(await productsRepository.exists(storeId, input.productId))) {
      throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    }
    await assertCustomer(storeId, input.customerId);

    const id = await reviewsRepository.insert(storeId, {
      product_id: input.productId,
      customer_id: input.customerId ?? null,
      rating: input.rating,
      title: input.title ?? null,
      review_text: input.reviewText ?? null,
      sentiment: input.sentiment ?? null,
    });
    return this.get(storeId, id);
  },

  async update(storeId: string, id: string, input: UpdateReviewInput) {
    await assertCustomer(storeId, input.customerId);

    const updated = await reviewsRepository.update(storeId, id, {
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.reviewText !== undefined && { review_text: input.reviewText }),
      ...(input.sentiment !== undefined && { sentiment: input.sentiment }),
      ...(input.customerId !== undefined && { customer_id: input.customerId }),
    });
    if (!updated) throw reviewNotFound();
    return this.get(storeId, id);
  },

  async remove(storeId: string, id: string) {
    if (!(await reviewsRepository.delete(storeId, id))) throw reviewNotFound();
    return { id, deleted: true };
  },
};
