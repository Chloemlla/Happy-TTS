const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  testMatch: [
    "<rootDir>/src/tests/logshare-mongodb.test.ts",
    "<rootDir>/src/tests/policyApi.test.ts",
  ],
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns ?? [])],
  collectCoverage: false,
  maxWorkers: 1,
  testTimeout: 60_000,
};
