const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|passwd|token|secret|api[-_]?key|session|credential/i;
const MAX_STRING_LENGTH = 1024;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 4;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return "[max-depth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_OBJECT_KEYS).map((item) => sanitizeLogValue(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);

  for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeLogValue(item, depth + 1);
  }

  if (entries.length > MAX_OBJECT_KEYS) {
    sanitized.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }

  return sanitized;
}

