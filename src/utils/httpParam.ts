export function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }

  return undefined;
}

export function firstStringOr(value: unknown, fallback = ""): string {
  return firstString(value) ?? fallback;
}
