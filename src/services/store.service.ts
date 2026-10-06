import { storeRepository } from '../repositories/store.repository.js';
import { conflict, notFound, onDuplicate } from '../utils/errors.js';
import type { UpdateStoreInput, UpdateStoreSettingsInput } from '../validators/store.validator.js';
import { toStore, toStoreSettings } from './mappers.js';

const storeNotFound = () => notFound('STORE_NOT_FOUND', 'Store not found');

export const storeService = {
  async get(storeId: string) {
    const [store, settings] = await Promise.all([storeRepository.findById(storeId), storeRepository.findSettings(storeId)]);
    if (!store) throw storeNotFound();
    return { ...toStore(store), settings: toStoreSettings(settings) };
  },

  async update(storeId: string, input: UpdateStoreInput) {
    const updated = await onDuplicate(storeRepository.update(storeId, input), () =>
      conflict('STORE_SLUG_EXISTS', 'Another store already uses this slug'),
    );
    if (!updated) throw storeNotFound();
    return this.get(storeId);
  },

  async getSettings(storeId: string) {
    const [store, settings] = await Promise.all([storeRepository.findById(storeId), storeRepository.findSettings(storeId)]);
    if (!store) throw storeNotFound();
    return toStoreSettings(settings);
  },

  async updateSettings(storeId: string, input: UpdateStoreSettingsInput) {
    if (!(await storeRepository.findById(storeId))) throw storeNotFound();
    const row = await storeRepository.upsertSettings(storeId, {
      ...(input.aiInsightsEnabled !== undefined && { ai_insights_enabled: input.aiInsightsEnabled }),
      ...(input.lowStockDefaultThreshold !== undefined && {
        low_stock_default_threshold: input.lowStockDefaultThreshold,
      }),
    });
    return toStoreSettings(row);
  },
};
