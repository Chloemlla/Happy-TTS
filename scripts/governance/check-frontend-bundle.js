#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..", "..");
const distDir = path.join(root, "frontend", "dist");
const manifestPath = path.join(distDir, ".vite", "manifest.json");
const entryMaxGzipBytes = Number(process.env.FRONTEND_ENTRY_MAX_GZIP_KB || 220) * 1024;
// diagrams/mermaid can exceed 1.5MB gzip even when isolated; keep it separate and budget it.
const chunkMaxGzipBytes = Number(process.env.FRONTEND_CHUNK_MAX_GZIP_KB || 1800) * 1024;
const totalMaxGzipBytes = Number(process.env.FRONTEND_TOTAL_MAX_GZIP_KB || 4500) * 1024;
// Require isolation for heavy deps that actually split. code-highlight may fold into other chunks depending on imports.
const heavyChunkNames = ["documents", "pdf", "diagrams", "charts", "fingerprint"];

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

if (!fs.existsSync(manifestPath)) {
  console.error(`Missing Vite manifest: ${path.relative(root, manifestPath)}`);
  console.error("Run the frontend production build before checking its budget.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entries = Object.values(manifest).filter((item) => item && item.isEntry && item.file);
if (entries.length === 0) {
  console.error("Vite manifest has no entry chunk.");
  process.exit(1);
}

const assetFiles = listFiles(path.join(distDir, "assets")).filter((file) => /\.(?:js|css)$/.test(file));
const measured = assetFiles.map((file) => ({
  file,
  relative: path.relative(distDir, file).replace(/\\/g, "/"),
  gzipBytes: gzipSize(file),
}));
const failures = [];

for (const entry of entries) {
  const match = measured.find((item) => item.relative === entry.file);
  if (!match) {
    failures.push(`entry asset missing: ${entry.file}`);
  } else if (match.gzipBytes > entryMaxGzipBytes) {
    failures.push(`entry ${match.relative} is ${(match.gzipBytes / 1024).toFixed(1)} KiB gzip (budget ${entryMaxGzipBytes / 1024} KiB)`);
  }
}

for (const item of measured.filter((entry) => entry.relative.endsWith(".js"))) {
  if (item.gzipBytes > chunkMaxGzipBytes) {
    failures.push(`chunk ${item.relative} is ${(item.gzipBytes / 1024).toFixed(1)} KiB gzip (budget ${chunkMaxGzipBytes / 1024} KiB)`);
  }
}

const totalGzipBytes = measured.reduce((sum, item) => sum + item.gzipBytes, 0);
if (totalGzipBytes > totalMaxGzipBytes) {
  failures.push(`total JS/CSS is ${(totalGzipBytes / 1024).toFixed(1)} KiB gzip (budget ${totalMaxGzipBytes / 1024} KiB)`);
}

const emittedNames = measured.map((item) => path.basename(item.relative));
for (const chunkName of heavyChunkNames) {
  if (!emittedNames.some((name) => name.startsWith(`${chunkName}.`) || name.startsWith(`${chunkName}-`))) {
    failures.push(`expected isolated heavy-dependency chunk was not emitted: ${chunkName}`);
  }
}

const entryFiles = new Set(entries.map((entry) => entry.file));
for (const [source, item] of Object.entries(manifest)) {
  if (!item || !item.file || entryFiles.has(item.file)) continue;
  if (/MarkdownExportPage|Mermaid|CommandManager|NexAISecurityDashboard|fingerprint/.test(source)) {
    if (item.isEntry) failures.push(`${source} unexpectedly became an entry chunk`);
  }
}

measured
  .sort((a, b) => b.gzipBytes - a.gzipBytes)
  .slice(0, 15)
  .forEach((item) => console.log(`${item.relative}: ${(item.gzipBytes / 1024).toFixed(1)} KiB gzip`));
console.log(`Total JS/CSS: ${(totalGzipBytes / 1024).toFixed(1)} KiB gzip`);

if (failures.length > 0) {
  console.error(`Frontend bundle budget failed (${failures.length} violation(s)):`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log("Frontend bundle budget passed.");
