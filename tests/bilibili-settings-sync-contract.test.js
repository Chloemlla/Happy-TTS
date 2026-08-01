const FORBIDDEN_KEYS = [
  "cookie",
  "cookies",
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "authorization",
];

function canEnableSync({ isBilibiliLoggedIn, validatedUid }) {
  return Boolean(isBilibiliLoggedIn && typeof validatedUid === "string" && validatedUid.trim());
}

function canBind({ cookieValid, cookieUid, requestedUid }) {
  return Boolean(cookieValid && cookieUid && cookieUid === requestedUid);
}

function serializeSettings(source) {
  const payload = Object.fromEntries(
    Object.entries(source).filter(([key]) => !FORBIDDEN_KEYS.includes(key)),
  );
  return {
    schemaVersion: 2,
    category: "settings",
    id: "bilibili-settings",
    payload,
  };
}

function assertDoesNotContainForbiddenKeys(value) {
  const encoded = JSON.stringify(value);
  for (const key of FORBIDDEN_KEYS) {
    expect(encoded).not.toContain(key);
  }
}

describe("Bilibili settings sync contract", () => {
  test("does not enable synchronization without a validated login", () => {
    expect(canEnableSync({ isBilibiliLoggedIn: false, validatedUid: null })).toBe(false);
    expect(canEnableSync({ isBilibiliLoggedIn: true, validatedUid: null })).toBe(false);
    expect(canEnableSync({ isBilibiliLoggedIn: true, validatedUid: "" })).toBe(false);
    expect(canEnableSync({ isBilibiliLoggedIn: true, validatedUid: "12345" })).toBe(true);
  });

  test("requires a valid cookie and matching UID before binding", () => {
    expect(canBind({ cookieValid: false, cookieUid: "12345", requestedUid: "12345" })).toBe(false);
    expect(canBind({ cookieValid: true, cookieUid: "99999", requestedUid: "12345" })).toBe(false);
    expect(canBind({ cookieValid: true, cookieUid: "12345", requestedUid: "12345" })).toBe(true);
  });

  test("settings serialization removes cookie and session credentials", () => {
    const record = serializeSettings({
      bilibiliUid: "12345",
      searchHistory: ["cats"],
      cookie: "SESSDATA=must-not-sync",
      cookies: { bili_jct: "must-not-sync" },
      authorization: "Bearer must-not-sync",
    });

    expect(record.payload).toEqual({ bilibiliUid: "12345", searchHistory: ["cats"] });
    assertDoesNotContainForbiddenKeys(record);
  });

  test("successful bind response contains capability but not the cookie", () => {
    const response = {
      success: true,
      data: { bound: true, uid: "12345", boundAt: "2026-08-01T00:00:00.000Z" },
    };

    expect(response.data.bound).toBe(true);
    expect(response.data.uid).toBe("12345");
    assertDoesNotContainForbiddenKeys(response);
  });

  test("credential archive metadata is ciphertext-only", () => {
    const archive = {
      credentialCiphertext: "ciphertext",
      credentialIv: "iv",
      credentialTag: "tag",
      credentialKeyVersion: "v1",
      credentialStatus: "active",
    };

    expect(archive.credentialCiphertext).toBeTruthy();
    expect(archive).not.toHaveProperty("cookie");
    expect(JSON.stringify(archive)).not.toContain("SESSDATA=");
  });

  test("conflict metadata is opaque", () => {
    const conflict = {
      category: "settings",
      id: "bilibili-settings",
      serverUpdatedAt: "2026-08-01T00:00:00.000Z",
      clientUpdatedAt: "2026-07-31T23:59:00.000Z",
    };

    expect(conflict).toMatchObject({ category: "settings", id: "bilibili-settings" });
    assertDoesNotContainForbiddenKeys(conflict);
  });
});
