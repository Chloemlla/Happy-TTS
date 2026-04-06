const DEFAULT_SCAMALYTICS_USER = "happyclovo";
const SCAMALYTICS_USER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function getSafeFallback(fallback?: string): string {
  const candidate =
    typeof fallback === "string" ? fallback.trim() : DEFAULT_SCAMALYTICS_USER;
  return SCAMALYTICS_USER_PATTERN.test(candidate)
    ? candidate
    : DEFAULT_SCAMALYTICS_USER;
}

export function validateScamalyticsUser(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const candidate = value.trim();
  if (!candidate) {
    return "";
  }

  if (!SCAMALYTICS_USER_PATTERN.test(candidate)) {
    throw new Error(
      "Scamalytics 用户名仅允许字母、数字、点、下划线和连字符",
    );
  }

  return candidate;
}

export function normalizeScamalyticsUser(
  value: unknown,
  fallback?: string,
): string {
  try {
    const validated = validateScamalyticsUser(value);
    return validated || getSafeFallback(fallback);
  } catch {
    return getSafeFallback(fallback);
  }
}

export function buildScamalyticsLookupUrl(user: string): string {
  const safeUser = normalizeScamalyticsUser(user);
  const url = new URL("https://api13.scamalytics.com/v3/");
  url.pathname = `/v3/${encodeURIComponent(safeUser)}/`;
  return url.toString();
}
