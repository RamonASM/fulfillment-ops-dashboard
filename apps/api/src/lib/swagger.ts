/**
 * Swagger/OpenAPI Documentation Setup
 *
 * Phase 3.3: API Documentation
 *
 * Automatically generates interactive API documentation from JSDoc comments.
 * Access at: http://localhost:3001/api/docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Intelligence Platform API',
      version: '1.0.0',
      description:
        'API for managing inventory, orders, analytics, and fulfillment operations',
      contact: {
        name: 'API Support',
        email: 'support@inventoryiq.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Development server',
      },
      {
        url: 'https://api.inventoryiq.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from /auth/login endpoint',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Error code',
            },
            message: {
              type: 'string',
              description: 'Error message',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
            requestId: {
              type: 'string',
              format: 'uuid',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            total: { type: 'integer', minimum: 0 },
            totalPages: { type: 'integer', minimum: 0 },
          },
        },
      },
      parameters: {
        Page: {
          in: 'query',
          name: 'page',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1,
          },
          description: 'Page number (1-indexed)',
        },
        Limit: {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
          description: 'Items per page',
        },
        ClientId: {
          in: 'path',
          name: 'clientId',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
          description: 'Client UUID',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Clients', description: 'Client management' },
      { name: 'Products', description: 'Product inventory' },
      { name: 'Orders', description: 'Order management' },
      { name: 'Imports', description: 'Data import operations' },
      { name: 'Analytics', description: 'Analytics and reporting' },
      { name: 'Alerts', description: 'Alert management' },
      { name: 'Portal', description: 'Client portal endpoints' },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts',
    './dist/routes/*.js',
    './dist/routes/**/*.js',
  ],
};

// Generate OpenAPI specification
const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI at /api/docs
 *
 * @param app - Express application instance
 */
export function setupSwagger(app: Express): void {
  // Serve Swagger UI
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Inventory API Documentation',
    })
  );

  // Serve OpenAPI spec as JSON
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 API Documentation available at: /api/docs');
}
