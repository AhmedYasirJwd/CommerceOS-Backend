import { inventoryRepository, type InventoryChangeResult } from '../repositories/inventory.repository.js';
import { productsRepository } from '../repositories/products.repository.js';
import { parseDateBoundary } from '../utils/dateRange.js';
import { notFound } from '../utils/errors.js';
import type { PageRequest } from '../utils/pagination.js';
import {
  INVENTORY_SORT_COLUMNS,
  type AdjustInventoryInput,
  type InventoryHistoryQuery,
  type ListInventoryQuery,
  type RestockInventoryInput,
} from '../validators/inventory.validator.js';
import { toInventoryItem, toMovement } from './mappers.js';

const productNotFound = () => notFound('PRODUCT_NOT_FOUND', 'Product not found');

async function currentItem(storeId: string, productId: string) {
  const row = await productsRepository.findById(storeId, productId);
  if (!row) throw productNotFound();
  return toInventoryItem(row);
}

async function withItem(storeId: string, change: InventoryChangeResult) {
  return {
    movement: {
      id: change.movement_id,
      type: change.type,
      quantityChange: change.quantity_change,
      previousQuantity: change.previous_quantity,
      newQuantity: change.new_quantity,
    },
    inventory: await currentItem(storeId, change.product_id),
  };
}

export const inventoryService = {
  async list(storeId: string, query: ListInventoryQuery) {
    const result = await inventoryRepository.list(
      storeId,
      { search: query.search, category: query.category, stock: query.stock },
      { column: INVENTORY_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toInventoryItem), pagination: result.pagination };
  },

  /** Low-stock and out-of-stock products, most urgent (lowest quantity) first. Inactive products are excluded. */
  async alerts(storeId: string, page: PageRequest) {
    const result = await inventoryRepository.list(
      storeId,
      { stock: ['low', 'out'], active: true },
      { column: 'quantity', ascending: true },
      page,
    );
    return { data: result.rows.map(toInventoryItem), pagination: result.pagination };
  },

  async get(storeId: string, productId: string) {
    const [item, history] = await Promise.all([
      currentItem(storeId, productId),
      inventoryRepository.movements(storeId, { productId }, false, { page: 1, limit: 20 }),
    ]);
    return { ...item, recentMovements: history.rows.map(toMovement) };
  },

  async history(storeId: string, query: InventoryHistoryQuery) {
    const result = await inventoryRepository.movements(
      storeId,
      {
        productId: query.productId,
        type: query.type,
        from: query.from ? parseDateBoundary(query.from, false) : undefined,
        to: query.to ? parseDateBoundary(query.to, true) : undefined,
      },
      query.sortOrder === 'asc',
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toMovement), pagination: result.pagination };
  },

  async adjust(storeId: string, input: AdjustInventoryInput) {
    const change = await inventoryRepository.applyChange(storeId, {
      productId: input.productId,
      type: input.type,
      quantityChange: input.quantityChange,
      newQuantity: input.newQuantity,
      note: input.note,
    });
    return withItem(storeId, change);
  },

  async restock(storeId: string, input: RestockInventoryInput) {
    const change = await inventoryRepository.applyChange(storeId, {
      productId: input.productId,
      type: 'restock',
      quantityChange: input.quantity,
      note: input.note,
    });
    return withItem(storeId, change);
  },

  async updateThreshold(storeId: string, productId: string, lowStockThreshold: number) {
    if (!(await productsRepository.exists(storeId, productId))) throw productNotFound();
    await inventoryRepository.setThreshold(productId, lowStockThreshold);
    return currentItem(storeId, productId);
  },
};
