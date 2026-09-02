#!/usr/bin/env node

// swagger-jsdoc 静默丢弃 YAML 解析失败的注释块：端点从 openapi.json 消失，构建照样成功，
// /api-docs 于是与真实路由表悄悄分叉。这里把源码注释声明的路径与生成的 spec 逐条对账。
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const specPath = process.env.OPENAPI_JSON_PATH || path.join(root, "openapi.json");
const routesDir = path.join(root, "src", "routes");

const ANNOTATION = /@(?:swagger|openapi)\b/;
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//g;
const COMMENT_PREFIX = /^\s*\*\s?/;
const PATH_KEY = /^ {0,4}(\/[A-Za-z0-9_\-{}/.:~]*):\s*$/;

function listRouteSources(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteSources(file);
    return entry.isFile() && entry.name.endsWith(".ts") ? [file] : [];
  });
}

const sources = listRouteSources(routesDir);
if (sources.length === 0) {
  console.error(`No route sources found under ${path.relative(root, routesDir)}.`);
  process.exit(1);
}

/** documented path -> source files that declare it */
const documented = new Map();

for (const file of sources) {
  const relative = path.relative(root, file).replace(/\\/g, "/");
  for (const block of fs.readFileSync(file, "utf8").match(JSDOC_BLOCK) || []) {
    if (!ANNOTATION.test(block)) continue;
    for (const rawLine of block.split(/\r?\n/)) {
      const match = PATH_KEY.exec(rawLine.replace(COMMENT_PREFIX, ""));
      if (!match) continue;
      const declared = documented.get(match[1]) || new Set();
      declared.add(relative);
      documented.set(match[1], declared);
    }
  }
}

if (!fs.existsSync(specPath)) {
  console.error(`Missing OpenAPI spec: ${path.relative(root, specPath)}`);
  console.error("Run `pnpm run generate:openapi` before checking for drift.");
  process.exit(1);
}

const failures = [];
let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
} catch (error) {
  console.error(`OpenAPI spec is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!spec.openapi) failures.push("spec has no `openapi` version field");
if (!spec.info || !spec.info.title) failures.push("spec has no `info.title`");

const specPaths = spec.paths && typeof spec.paths === "object" ? spec.paths : {};
const specPathKeys = Object.keys(specPaths);
if (specPathKeys.length === 0) failures.push("spec declares zero paths");

// 提取器自身失效（正则/目录结构变化）比漂移更危险：零命中直接判失败，不要静默放行。
if (documented.size === 0) {
  failures.push("no @swagger/@openapi path annotations were found — this drift gate is broken");
}

for (const [declaredPath, files] of [...documented].sort(([a], [b]) => a.localeCompare(b))) {
  if (!Object.hasOwn(specPaths, declaredPath)) {
    failures.push(`${declaredPath} is documented in ${[...files].join(", ")} but missing from the spec`);
  }
}

const emptyPaths = specPathKeys.filter((key) => {
  const item = specPaths[key];
  return !item || typeof item !== "object" || Object.keys(item).length === 0;
});

console.log(`Documented paths: ${documented.size} | spec paths: ${specPathKeys.length}`);
if (emptyPaths.length > 0) {
  console.warn(`Warning: ${emptyPaths.length} spec path(s) declare no operations: ${emptyPaths.join(", ")}`);
}

if (failures.length > 0) {
  console.error(`OpenAPI drift check failed (${failures.length} problem(s)):`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  console.error("A dropped path almost always means the YAML in that @swagger block no longer parses.");
  process.exit(1);
}

console.log("OpenAPI drift check passed.");
