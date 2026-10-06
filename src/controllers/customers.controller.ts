import type { Request, Response } from 'express';
import { storeIdOf } from '../middleware/auth.js';
import { customersService } from '../services/customers.service.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import {
  createCustomerBody,
  deleteCustomerQuery,
  listCustomersQuery,
  updateCustomerBody,
} from '../validators/customers.validator.js';

export const customersController = {
  async list(req: Request, res: Response) {
    const result = await customersService.list(storeIdOf(req), listCustomersQuery.parse(req.query));
    sendList(res, result.data, result.pagination);
  },

  async get(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await customersService.get(storeIdOf(req), id));
  },

  async create(req: Request, res: Response) {
    sendSuccess(res, await customersService.create(storeIdOf(req), createCustomerBody.parse(req.body)), 201);
  },

  async update(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    sendSuccess(res, await customersService.update(storeIdOf(req), id, updateCustomerBody.parse(req.body)));
  },

  async remove(req: Request, res: Response) {
    const { id } = idParams.parse(req.params);
    const { force } = deleteCustomerQuery.parse(req.query);
    sendSuccess(res, await customersService.remove(storeIdOf(req), id, force ?? false));
  },
};
