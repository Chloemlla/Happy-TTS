module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/integration/**/*.test.js"],
  testTimeout: 45_000,
  maxWorkers: 1,
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
};
