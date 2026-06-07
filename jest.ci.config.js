const baseConfig = require("./jest.config");

// CI should only run tests that are self-contained in the checkout.
// These files exercise live services, local deployments, or deployment-specific
// database/API configuration and should be run manually in a prepared environment.
const liveEnvironmentTestPattern =
  "[\\\\/]src[\\\\/]tests[\\\\/](logshare-mongodb|policyApi|ipfs-upload|network-apis|media-social-life-apis|ip-query|yiyan-api)\\.test\\.(ts|js)$";

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns ?? []), liveEnvironmentTestPattern],
};
