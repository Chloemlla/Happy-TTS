import legacyConfig from "../config";
import { runtimeMutableConfig } from "../config/config";
import type { EmailRuntimeConfig } from "../config/runtimeConfigDefaults";

describe("email runtime configuration", () => {
  it("keeps the outemail code in the runtime configuration shape", () => {
    const emailConfig: EmailRuntimeConfig = runtimeMutableConfig.email;

    expect(typeof emailConfig.outemailCode).toBe("string");
    expect(emailConfig.outemailCode).toBe("");
  });

  it("uses the runtime-managed code for the legacy config view", () => {
    expect(legacyConfig.email.outemail.code).toBe(runtimeMutableConfig.email.outemailCode);
  });
});
