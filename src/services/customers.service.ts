import { customersRepository } from '../repositories/customers.repository.js';
import { ordersRepository } from '../repositories/orders.repository.js';
import { conflict, notFound, onDuplicate } from '../utils/errors.js';
import {
  CUSTOMER_SORT_COLUMNS,
  type CreateCustomerInput,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from '../validators/customers.validator.js';
import { toCustomer, toOrder } from './mappers.js';

const customerNotFound = () => notFound('CUSTOMER_NOT_FOUND', 'Customer not found');
const emailTaken = () => conflict('CUSTOMER_EMAIL_EXISTS', 'A customer with this email already exists');

export const customersService = {
  async list(storeId: string, query: ListCustomersQuery) {
    const result = await customersRepository.list(
      storeId,
      { search: query.search, status: query.status },
      { column: CUSTOMER_SORT_COLUMNS[query.sortBy], ascending: query.sortOrder === 'asc' },
      { page: query.page, limit: query.limit },
    );
    return { data: result.rows.map(toCustomer), pagination: result.pagination };
  },

  async get(storeId: string, id: string) {
    const [row, recentOrders] = await Promise.all([
      customersRepository.findById(storeId, id),
      ordersRepository.listForCustomer(storeId, id, 10),
    ]);
    if (!row) throw customerNotFound();
    return { ...toCustomer(row), recentOrders: recentOrders.map(toOrder) };
  },

  async create(storeId: string, input: CreateCustomerInput) {
    if (await customersRepository.findIdByEmail(storeId, input.email)) throw emailTaken();

    const id = await onDuplicate(
      customersRepository.insert(storeId, {
        first_name: input.firstName,
        last_name: input.lastName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        status: input.status,
      }),
      emailTaken,
    );

    const row = await customersRepository.findById(storeId, id);
    if (!row) throw customerNotFound();
    return toCustomer(row);
  },

  async update(storeId: string, id: string, input: UpdateCustomerInput) {
    if (input.email) {
      const existing = await customersRepository.findIdByEmail(storeId, input.email);
      if (existing && existing !== id) throw emailTaken();
    }

    const updated = await onDuplicate(
      customersRepository.update(storeId, id, {
        ...(input.firstName !== undefined && { first_name: input.firstName }),
        ...(input.lastName !== undefined && { last_name: input.lastName }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.status !== undefined && { status: input.status }),
      }),
      emailTaken,
    );
    if (!updated) throw customerNotFound();

    const row = await customersRepository.findById(storeId, id);
    if (!row) throw customerNotFound();
    return toCustomer(row);
  },

  /**
   * Deleting a customer detaches their orders (orders.customer_id is set
   * null by the schema), so by default customers with orders cannot be
   * deleted; set them inactive instead, or pass force=true.
   */
  async remove(storeId: string, id: string, force: boolean) {
    if (!(await customersRepository.exists(storeId, id))) throw customerNotFound();

    if (!force) {
      const orders = await customersRepository.countOrders(storeId, id);
      if (orders > 0) {
        throw conflict(
          'CUSTOMER_HAS_ORDERS',
          `Customer has ${orders} order(s). Set status to inactive, or delete with ?force=true to keep the orders without a customer.`,
        );
      }
    }

    if (!(await customersRepository.delete(storeId, id))) throw customerNotFound();
    return { id, deleted: true };
  },
};

