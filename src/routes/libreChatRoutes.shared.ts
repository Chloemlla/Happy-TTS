const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizePagination(pageValue: unknown, limitValue: unknown): { page: number; limit: number } {
  return {
    page: parsePositiveInt(pageValue, DEFAULT_PAGE),
    limit: Math.min(parsePositiveInt(limitValue, DEFAULT_LIMIT), MAX_LIMIT),
  };
}
