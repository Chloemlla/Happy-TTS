#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const mapPath = path.join(root, "docs", "privacy-data-map.json");
const requiredDatasetKeys = ["id", "collection", "fields", "purpose", "legalBasis", "retention", "delete", "export", "evidence"];
const knownRetentionTypes = new Set([
  "account_lifetime",
  "ttl",
  "optional_ttl",
  "operational",
  "account_linked",
  "client_ttl",
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(mapPath)) {
  fail(`Missing privacy data map: ${path.relative(root, mapPath)}`);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
if (!Array.isArray(map.datasets) || map.datasets.length === 0) {
  fail("privacy-data-map.json must define a non-empty datasets array");
}

const ids = new Set();
for (const dataset of map.datasets) {
  for (const key of requiredDatasetKeys) {
    if (!(key in dataset)) fail(`dataset ${dataset.id || "<unknown>"} is missing ${key}`);
  }

  if (ids.has(dataset.id)) fail(`duplicate dataset id: ${dataset.id}`);
  ids.add(dataset.id);

  if (!Array.isArray(dataset.fields) || dataset.fields.length === 0) {
    fail(`${dataset.id}: fields must be a non-empty array`);
  }
  if (!Array.isArray(dataset.evidence) || dataset.evidence.length === 0) {
    fail(`${dataset.id}: evidence must be a non-empty array`);
  }
  if (!dataset.retention || !knownRetentionTypes.has(dataset.retention.type)) {
    fail(`${dataset.id}: unsupported retention.type ${dataset.retention && dataset.retention.type}`);
  }
  if (dataset.retention.type === "ttl") {
    if (typeof dataset.retention.expireAfterSeconds !== "number") {
      fail(`${dataset.id}: ttl retention requires expireAfterSeconds`);
    }
    if (!dataset.retention.ttlField) fail(`${dataset.id}: ttl retention requires ttlField`);
  }

  for (const evidence of dataset.evidence) {
    const absolute = path.join(root, evidence);
    if (!fs.existsSync(absolute)) fail(`${dataset.id}: missing evidence file ${evidence}`);
  }
}

const requiredIds = [
  "user-fingerprints",
  "temp-fingerprints",
  "access-tokens",
  "ip-verification-tokens",
  "ip-bans",
  "policy-consents",
  "tts-jobs",
  "audit-logs",
  "data-collections",
  "device-tracking",
  "ipqs-lookup-logs",
  "browser-local-fingerprint-cache",
];
for (const id of requiredIds) {
  if (!ids.has(id)) fail(`required privacy dataset missing: ${id}`);
}

const gapCount = map.datasets.filter((dataset) => {
  const values = [dataset.delete?.onUserDelete, dataset.delete?.current, dataset.delete?.gap, dataset.retention?.description]
    .filter(Boolean)
    .join(" ");
  return /gap/i.test(values);
}).length;

if (process.exitCode) {
  console.error("Privacy contract check failed.");
  process.exit(process.exitCode);
}

console.log(`Privacy contract check passed for ${map.datasets.length} datasets (${gapCount} acknowledged gap(s)).`);
