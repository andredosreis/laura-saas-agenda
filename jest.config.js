export default {
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/laura-saas-frontend/'],
  clearMocks: true,
  restoreMocks: true,
};
