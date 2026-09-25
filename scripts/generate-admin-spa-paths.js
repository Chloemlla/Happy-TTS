#!/usr/bin/env node

// 后端 legacy API 重定向需要知道哪些 /admin/<module> 是管理面板页面：整页导航命中这些
// 路径时必须放行给 SPA，否则会被 /admin → /api/admin 前缀映射 308 到 API 上，刷新页面
// 或直接打开深链就只能看到 JSON。这份清单的唯一数据源是
// frontend/src/components/admin/adminModules.tsx 的 ADMIN_MODULE_LOADERS —— 页面存在
// 与否本来就由它决定，所以新增页面只需要登记 loader，路径清单自动补齐。
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "frontend", "src", "components", "admin", "adminModules.tsx");
const outputPath = path.join(root, "src", "generated", "adminSpaModulePaths.ts");

// 解析失败时必须炸掉而不是输出半份清单：清单少了页面，线上表现是「深链 308 到 API」，
// 很难从现象反推到生成脚本。
const MINIMUM_EXPECTED_KEYS = 20;
const MODULE_KEY_PATTERN = /^ {2}(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/;
const MODULE_KEY_CHARSET = /^[a-z0-9-]+$/;

function readSource() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`找不到管理模块注册表：${path.relative(root, sourcePath)}`);
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

function renderModuleFile(keys) {
  const entries = keys.map((key) => `  "/admin/${key}",`).join("\n");
  return `/**
 * 本文件由 \`pnpm run generate:admin-spa-paths\` 生成，请勿手工编辑。
 *
 * 数据源：frontend/src/components/admin/adminModules.tsx 的 ADMIN_MODULE_LOADERS。
 * 用途：src/routes/legacyApiRedirect.ts 判断哪些 /admin/<module> 是前端面板页面，
 * 整页导航时放行给 SPA，而不是 308 到对应的 API 路径。
 */
export const ADMIN_SPA_MODULE_PATHS = [
${entries}
] as const;
`;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const keys = validateModuleKeys(extractModuleKeys(readSource()));
  const expected = renderModuleFile(keys);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;

  if (current === expected) {
    console.log(`管理面板页面路径清单已同步（${keys.length} 个模块）。`);
    return;
  }

  if (checkOnly) {
    console.error(
      [
        `${path.relative(root, outputPath).replace(/\\/g, "/")} 与 ADMIN_MODULE_LOADERS 不一致。`,
        "请在本地运行：pnpm run generate:admin-spa-paths",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected, "utf8");
  console.log(
    `${current === null ? "已生成" : "已更新"} ${path.relative(root, outputPath).replace(/\\/g, "/")}（${keys.length} 个模块）。`,
  );
}

main();
