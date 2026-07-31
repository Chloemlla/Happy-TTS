const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  testMatch: [
    "<rootDir>/src/tests/ipfs-upload.test.ts",
    "<rootDir>/src/tests/network-apis.test.ts",
    "<rootDir>/src/tests/media-social-life-apis.test.ts",
    "<rootDir>/src/tests/ip-query.test.ts",
    "<rootDir>/src/tests/yiyan-api.test.ts",
  ],
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns ?? [])],
  collectCoverage: false,
  maxWorkers: 1,
  testTimeout: 60_000,
};
