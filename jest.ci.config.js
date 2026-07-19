const baseConfig = require("./jest.config");

// CI should only run tests that are self-contained in the checkout.
// These files exercise live services, local deployments, or deployment-specific
// database/API configuration and should be run manually in a prepared environment.
const liveEnvironmentTestPattern =
  "[\\\\/]src[\\\\/]tests[\\\\/](logshare-mongodb|policyApi|ipfs-upload|network-apis|media-social-life-apis|ip-query|yiyan-api)\\.test\\.(ts|js)$";

// Playwright browser specs live under tests/browser and must not be collected by Jest.
const playwrightBrowserTestPattern =
  "[\\\\/]tests[\\\\/]browser[\\\\/].*\\.(test|spec)\\.(ts|tsx|js|jsx)$";

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns ?? []),
    liveEnvironmentTestPattern,
    playwrightBrowserTestPattern,
  ],
};
