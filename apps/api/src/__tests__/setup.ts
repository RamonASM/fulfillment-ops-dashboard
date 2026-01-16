import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../lib/prisma.js';

// =============================================================================
// TEST SETUP
// =============================================================================
// Global setup and teardown for all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-min-32-chars';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/inventory_test';

// Connect to database before all tests
beforeAll(async () => {
  try {
    await prisma.$connect();
    console.log('✅ Test database connected');
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error);
    throw error;
  }
});

// Clean up after each test
afterEach(async () => {
  // Optional: Clean up test data after each test
  // Uncomment if you want to clean the database after each test
  // const tables = ['User', 'Client', 'Product', 'Order', 'Alert'];
  // for (const table of tables) {
  //   await prisma[table.toLowerCase()].deleteMany({});
  // }
});

// Disconnect from database after all tests
afterAll(async () => {
  await prisma.$disconnect();
  console.log('✅ Test database disconnected');
});
