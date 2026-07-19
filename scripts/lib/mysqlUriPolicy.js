"use strict";

const WEAK_MYSQL_URI_PATTERNS = [
  /mysql:\/\/root:password@/i,
  /mysql:\/\/root:root@/i,
  /mysql:\/\/root@/i,
  /mysql:\/\/user:password@/i,
  /mysql:\/\/admin:admin@/i,
  /mysql:\/\/test:test@/i,
];

function normalizeMysqlUri(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function isWeakMysqlUri(uri) {
  if (!uri) return true;
  return WEAK_MYSQL_URI_PATTERNS.some((pattern) => pattern.test(uri));
}

function requireMysqlUri(env = process.env) {
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

module.exports = {
  WEAK_MYSQL_URI_PATTERNS,
  normalizeMysqlUri,
  isWeakMysqlUri,
  requireMysqlUri,
};
