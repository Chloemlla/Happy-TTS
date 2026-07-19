/**
 * MySQL connection URI policy for optional legacy storage adapters.
 *
 * MySQL is not the system of record (Mongo-only). When a storage backend
 * explicitly selects mysql, MYSQL_URI must be provided — never a hard-coded
 * root/password default.
 */

const WEAK_MYSQL_URI_PATTERNS = [
  /mysql:\/\/root:password@/i,
  /mysql:\/\/root:root@/i,
  /mysql:\/\/root@/i,
  /mysql:\/\/user:password@/i,
  /mysql:\/\/admin:admin@/i,
  /mysql:\/\/test:test@/i,
];

export function normalizeMysqlUri(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export function isWeakMysqlUri(uri: string): boolean {
  if (!uri) return true;
  return WEAK_MYSQL_URI_PATTERNS.some((pattern) => pattern.test(uri));
}

/**
 * Resolve MYSQL_URI for an enabled mysql storage backend.
 * Throws if missing or weak — adapters must never fall back to root:password.
 */
export function requireMysqlUri(env: NodeJS.ProcessEnv = process.env): string {
  const uri = normalizeMysqlUri(env.MYSQL_URI);
  if (!uri) {
    throw new Error(
      "MYSQL_URI is required when a storage backend is set to mysql (no default connection string is allowed)",
    );
  }
  if (isWeakMysqlUri(uri)) {
    throw new Error(
      "MYSQL_URI rejects weak/default credentials (e.g. mysql://root:password@...). Provide an explicit non-default URI.",
    );
  }
  if (!/^mysql(s)?:\/\//i.test(uri)) {
    throw new Error("MYSQL_URI must start with mysql:// or mysqls://");
  }
  return uri;
}
