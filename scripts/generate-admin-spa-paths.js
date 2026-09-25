#!/usr/bin/env node

// 后端 legacy API 重定向需要知道「哪些路径是前端页面」：整页导航命中这些路径时必须放行给 SPA，
// 否则会被前缀映射（/admin → /api/admin、/tts → /api/tts 等）308 到 API 上，刷新页面或直接
// 打开深链就只能看到 JSON。判定清单的数据源就是「页面是否存在」本身，所以新增页面只要登记
// 路由，路径清单自动补齐，不必再手改 src/routes/legacyApiRedirect.ts：
//   1. frontend/src/components/admin/adminModules.tsx 的 ADMIN_MODULE_LOADERS → /admin/<module>
//   2. frontend/src/App.tsx 的 <Route path="..."> → 全部前端路由
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const moduleSourcePath = path.join(root, "frontend", "src", "components", "admin", "adminModules.tsx");
const appSourcePath = path.join(root, "frontend", "src", "App.tsx");
const outputPath = path.join(root, "src", "generated", "adminSpaModulePaths.ts");

// 解析失败时必须炸掉而不是输出半份清单：清单少了页面，线上表现是「深链 308 到 API」，
// 很难从现象反推到生成脚本。数量下限是用来兜住「解析规则整体与源码脱节」的健全性守卫。
const MINIMUM_EXPECTED_KEYS = 20;
const MINIMUM_EXPECTED_FRONTEND_ROUTES = 40;
const MINIMUM_EXPECTED_FRONTEND_PREFIXES = 1;
const MODULE_KEY_PATTERN = /^ {2}(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/;
const MODULE_KEY_CHARSET = /^[a-z0-9-]+$/;
// 前端路由只可能是小写字母、数字、连字符组成的段（不含参数与通配，二者在解析阶段就被剔除）。
const ROUTE_PATH_CHARSET = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
// 只认字符串字面量的 path（两种引号都认）。写成 path={...} 表达式的路由无法静态枚举，
// 属于「解析不到」，见 validateFrontendRoutePaths 里的一致处理。
const ROUTE_PATH_PATTERN = /<Route\s+path=(?:"([^"]*)"|'([^']*)')/g;
const ROUTE_PATH_EXPRESSION_PATTERN = /<Route\s+path=\{/g;

function readSource(sourcePath, label) {
  if (!fs.existsSync(sourcePath)) {
    console.error(`找不到${label}：${path.relative(root, sourcePath)}`);
    process.exit(1);
  }
  return fs.readFileSync(sourcePath, "utf8");
}

function extractModuleKeys(source) {
  const start = source.match(/ADMIN_MODULE_LOADERS\s*=\s*\{/);
  if (!start) {
    console.error("adminModules.tsx 里找不到 ADMIN_MODULE_LOADERS 定义。");
    process.exit(1);
  }

  const bodyStart = start.index + start[0].length;
  const bodyEnd = source.indexOf("} as const;", bodyStart);
  if (bodyEnd === -1) {
    console.error("adminModules.tsx 里找不到 ADMIN_MODULE_LOADERS 的结尾 `} as const;`。");
    process.exit(1);
  }

  const keys = [];
  for (const line of source.slice(bodyStart, bodyEnd).split(/\r?\n/)) {
    // 只认顶层两空格缩进的键：loader 内部也有 `default:` 之类的对象键，缩进更深。
    const match = MODULE_KEY_PATTERN.exec(line);
    if (!match) continue;
    keys.push(match[1] || match[2] || match[3]);
  }
  return keys;
}

function validateModuleKeys(keys) {
  const unique = [...new Set(keys)];
  if (keys.length !== unique.length) {
    console.error(`ADMIN_MODULE_LOADERS 里出现重复模块键：${keys.join(", ")}`);
    process.exit(1);
  }
  if (unique.length < MINIMUM_EXPECTED_KEYS) {
    console.error(`只解析到 ${unique.length} 个模块键（至少应有 ${MINIMUM_EXPECTED_KEYS} 个），解析规则可能已与源码脱节。`);
    process.exit(1);
  }
  const invalid = unique.filter((key) => !MODULE_KEY_CHARSET.test(key));
  if (invalid.length > 0) {
    console.error(`模块键必须是 kebab-case 段（只含小写字母、数字、连字符）：${invalid.join(", ")}`);
    process.exit(1);
  }
  return unique.sort();
}

// 参数路由的静态前缀：取第一个含 ":" 的参数段之前的全部静态段。
// /store/resources/:id → /store/resources；/:slug → null（没有静态段可用）。
function staticPrefixOf(routePath) {
  const staticSegments = [];
  for (const segment of routePath.split("/").filter(Boolean)) {
    if (segment.includes(":")) break;
    staticSegments.push(segment);
  }
  return staticSegments.length > 0 ? `/${staticSegments.join("/")}` : null;
}

// 只取静态路径段（只认字符串字面量的 path，`path={...}` 表达式在下方校验里直接报错）：
// - `path="*"` 是兜底路由（NotFoundPage），不对应任何真实路径，丢弃；
// - 含 ":" 的参数路由（/artifacts/:shortId）本身不是可枚举的静态路径，后端唯一能判定的是
//   它前面的静态前缀（/artifacts），所以取其静态前缀；前缀为空则丢弃；
// - 根路由 "/" 也丢弃：它不是任何前缀，登记进去只会让清单里多一条永远匹配不上的空壳。
function extractFrontendRoutePaths(source) {
  const exact = [];
  const prefixes = [];

  for (const match of source.matchAll(ROUTE_PATH_PATTERN)) {
    const routePath = (match[1] ?? match[2] ?? "").trim();
    if (!routePath || routePath === "/" || routePath.includes("*")) {
      continue;
    }
    if (routePath.includes(":")) {
      const prefix = staticPrefixOf(routePath);
      if (prefix) prefixes.push(prefix);
      continue;
    }
    exact.push(routePath);
  }

  const exactPaths = [...new Set(exact)].sort();
  const exactSet = new Set(exactPaths);
  // 参数路由的静态前缀若本身已是字面路由（/admin/:module → /admin、/articles/:slug → /articles），
  // 就不能登记成前缀：前缀匹配会连带放行该前缀下的**所有**子路径，而 /admin 下的真实页面已由
  // ADMIN_SPA_MODULE_PATHS 逐条覆盖，/admin/audit-events 这类不存在的模块深链必须继续 308。
  // 剩下没有字面路由的前缀（/artifacts、/store/resources）才说明参数页面确实挂在该前缀之下。
  const prefixPaths = [...new Set(prefixes)].filter((prefix) => !exactSet.has(prefix)).sort();

  return {
    exactPaths,
    prefixPaths,
    unparseablePathCount: (source.match(ROUTE_PATH_EXPRESSION_PATTERN) || []).length,
  };
}

function validateFrontendRoutePaths({ exactPaths, prefixPaths, unparseablePathCount }) {
  if (unparseablePathCount > 0) {
    console.error(
      `App.tsx 里有 ${unparseablePathCount} 个 <Route> 的 path 写成表达式，无法静态枚举；` +
        "这种路由会被静默漏出清单（线上表现是深链 308 到 API），请改成字符串字面量。",
    );
    process.exit(1);
  }
  if (exactPaths.length < MINIMUM_EXPECTED_FRONTEND_ROUTES) {
    console.error(
      `只解析到 ${exactPaths.length} 条前端字面路由（至少应有 ${MINIMUM_EXPECTED_FRONTEND_ROUTES} 条），解析规则可能已与 App.tsx 脱节。`,
    );
    process.exit(1);
  }
  if (prefixPaths.length < MINIMUM_EXPECTED_FRONTEND_PREFIXES) {
    console.error(
      `只解析到 ${prefixPaths.length} 条参数路由静态前缀（至少应有 ${MINIMUM_EXPECTED_FRONTEND_PREFIXES} 条），解析规则可能已与 App.tsx 脱节。`,
    );
    process.exit(1);
  }
  const invalid = [...exactPaths, ...prefixPaths].filter((routePath) => !ROUTE_PATH_CHARSET.test(routePath));
  if (invalid.length > 0) {
    console.error(`前端路由必须是 "/" 开头的小写静态段（只含小写字母、数字、连字符）：${invalid.join(", ")}`);
    process.exit(1);
  }
  return { exactPaths, prefixPaths };
}

function renderGeneratedFile({ moduleKeys, exactPaths, prefixPaths }) {
  const renderEntries = (paths) => paths.map((entry) => `  ${JSON.stringify(entry)},`).join("\n");
  // ADMIN_SPA_MODULE_PATHS 的语义必须保持 /admin/<module>（既有代码与测试都按此前缀匹配）。
  const moduleEntries = renderEntries(moduleKeys.map((key) => `/admin/${key}`));
  return `/**
 * 本文件由 \`pnpm run generate:admin-spa-paths\` 生成，请勿手工编辑。
 *
 * 数据源：
 * - frontend/src/components/admin/adminModules.tsx 的 ADMIN_MODULE_LOADERS（管理面板模块页）
 * - frontend/src/App.tsx 的 <Route path="..."> 静态路径（全部前端路由）
 * 用途：src/routes/legacyApiRedirect.ts 判断哪些路径是前端页面，整页导航时放行给 SPA，
 * 而不是 308 到对应的 API 路径。
 */

/** 管理面板模块页（/admin/<module>）。前缀匹配：同一模块下的子路径仍属于该页面。 */
export const ADMIN_SPA_MODULE_PATHS = [
${moduleEntries}
] as const;

/** 全部前端字面路由。精确匹配：前缀匹配会把 /tts/generate 这类旧 API 调用也误放行。 */
export const FRONTEND_SPA_ROUTE_PATHS = [
${renderEntries(exactPaths)}
] as const;

/** 参数路由的静态前缀（/artifacts/:shortId → /artifacts）。这类前缀下的子路径才是页面，按前缀放行。 */
export const FRONTEND_SPA_ROUTE_PREFIX_PATHS = [
${renderEntries(prefixPaths)}
] as const;
`;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const moduleKeys = validateModuleKeys(
    extractModuleKeys(readSource(moduleSourcePath, "管理模块注册表")),
  );
  const frontendRoutes = validateFrontendRoutePaths(
    extractFrontendRoutePaths(readSource(appSourcePath, "前端路由表")),
  );
  const counts = `${moduleKeys.length} 个管理模块，${frontendRoutes.exactPaths.length} 条前端路由，${frontendRoutes.prefixPaths.length} 条参数路由前缀`;

  const expected = renderGeneratedFile({ moduleKeys, ...frontendRoutes });
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;

  if (current === expected) {
    console.log(`SPA 路径清单已同步（${counts}）。`);
    return;
  }

  if (checkOnly) {
    console.error(
      [
        `${path.relative(root, outputPath).replace(/\\/g, "/")} 与 ADMIN_MODULE_LOADERS / App.tsx 不一致。`,
        "请在本地运行：pnpm run generate:admin-spa-paths",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected, "utf8");
  console.log(
    `${current === null ? "已生成" : "已更新"} ${path.relative(root, outputPath).replace(/\\/g, "/")}（${counts}）。`,
  );
}

main();
