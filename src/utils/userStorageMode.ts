export const USER_STORAGE_MODE = "mongo" as const;

export function normalizeUserStorageMode(rawValue: unknown): typeof USER_STORAGE_MODE {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return USER_STORAGE_MODE;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized !== USER_STORAGE_MODE) {
    throw new Error(`USER_STORAGE_MODE 只支持 mongo，当前值为 ${String(rawValue)}`);
  }

  return USER_STORAGE_MODE;
}

export function assertMongoUserStorageMode(): void {
  process.env.USER_STORAGE_MODE = normalizeUserStorageMode(process.env.USER_STORAGE_MODE);
}

export function isUserStorageModeKey(key: string): boolean {
  const rawKey = key.includes(":") ? key.split(":").pop() || key : key;
  return rawKey === "USER_STORAGE_MODE";
}
