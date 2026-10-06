import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { analyticsController } from '../controllers/analytics.controller.js';
import { categoriesController } from '../controllers/categories.controller.js';
import { customersController } from '../controllers/customers.controller.js';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { inventoryController } from '../controllers/inventory.controller.js';
import { ordersController } from '../controllers/orders.controller.js';
import { productsController } from '../controllers/products.controller.js';
import { reviewsController } from '../controllers/reviews.controller.js';
import { storeController } from '../controllers/store.controller.js';
import { authenticate } from '../middleware/auth.js';

const customers = Router()
  .get('/', customersController.list)
  .get('/:id', customersController.get)
  .post('/', customersController.create)
  .patch('/:id', customersController.update)
  .delete('/:id', customersController.remove);

const products = Router()
  .get('/', productsController.list)
  .get('/:id', productsController.get)
  .post('/', productsController.create)
  .patch('/:id', productsController.update)
  .delete('/:id', productsController.remove);

const categories = Router()
  .get('/', categoriesController.list)
  .get('/:id', categoriesController.get)
  .post('/', categoriesController.create)
  .patch('/:id', categoriesController.update)
  .delete('/:id', categoriesController.remove);

const orders = Router()
  .get('/', ordersController.list)
  .get('/:id', ordersController.get)
  .post('/', ordersController.create)
  .patch('/:id', ordersController.update);

// Static paths must be registered before /:productId.
const inventory = Router()
  .get('/', inventoryController.list)
  .get('/alerts', inventoryController.alerts)
  .get('/history', inventoryController.history)
  .post('/adjust', inventoryController.adjust)
  .post('/restock', inventoryController.restock)
  .get('/:productId', inventoryController.get)
  .patch('/:productId', inventoryController.update);

const dashboard = Router()
  .get('/summary', dashboardController.summary)
  .get('/revenue', dashboardController.revenue)
  .get('/orders', dashboardController.orders)
  .get('/top-products', dashboardController.topProducts)
  .get('/recent-orders', dashboardController.recentOrders);

const analytics = Router()
  .get('/overview', analyticsController.overview)
  .get('/revenue', analyticsController.revenue)
  .get('/orders', analyticsController.orders)
  .get('/conversion', analyticsController.conversion)
  .get('/customers', analyticsController.customers)
  .get('/retention', analyticsController.retention)
  .get('/categories', analyticsController.categories)
  .get('/products', analyticsController.products);

const ai = Router()
  .get('/insights', aiController.listInsights)
  .get('/insights/:id', aiController.getInsight)
  .patch('/insights/:id', aiController.updateInsight)
  .get('/actions', aiController.listActions)
  .get('/actions/:id', aiController.getAction)
  .patch('/actions/:id/approve', aiController.approveAction)
  .patch('/actions/:id/reject', aiController.rejectAction)
  .get('/analysis-runs', aiController.listRuns)
  .get('/analysis-runs/:id', aiController.getRun);

const reviews = Router()
  .get('/', reviewsController.list)
  .get('/:id', reviewsController.get)
  .post('/', reviewsController.create)
  .patch('/:id', reviewsController.update)
  .delete('/:id', reviewsController.remove);

const store = Router()
  .get('/', storeController.get)
  .patch('/', storeController.update)
  .get('/settings', storeController.getSettings)
  .patch('/settings', storeController.updateSettings);

/** All /api routes are authenticated and store-scoped. */
export const apiRouter = Router()
  .use(authenticate)
  .use('/customers', customers)
  .use('/products', products)
  .use('/categories', categories)
  .use('/orders', orders)
  .use('/inventory', inventory)
  .use('/dashboard', dashboard)
  .use('/analytics', analytics)
  .use('/ai', ai)
  .use('/reviews', reviews)
  .use('/store', store);
