import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * 后端构建元数据：版本号（仓库根 package.json）与本次构建的短 SHA。
 *
 * 用途：前端页脚在每次刷新后向后端查询一次，展示的必须是**当前实际运行的后端**，
 * 而不是前端构建时顺手烤进去的那一份。
 *
 * 短 SHA 的来源优先级：
 * 1. 构建期写入镜像/仓库根目录的 `.build-sha` 文件（Dockerfile 末尾 GIT_SHA 构建参数）——
 *    部署脚本会从旧容器 inspect 全量继承环境变量成显式 `-e`，只有文件不会被 `-e` 覆盖；
 * 2. 镜像/运行时注入的环境变量（Docker 构建参数 GIT_SHA → APP_GIT_SHA）——
 *    生产镜像里没有 .git（.dockerignore 排除），只能靠它；
 * 3. 仓库根确实存在 .git 时用 `git rev-parse` 兜底（本机 dev / 直接跑源码的场景）。
 */
export interface BackendBuildInfo {
  version: string;
  shortSha: string;
}

const UNKNOWN = "unknown";
const BUILD_SHA_FILE_NAME = ".build-sha";

/** 仓库/镜像根目录（src/config 与 dist/config 都在其二级目录下）。 */
function resolveRepositoryRoot(): string {
  return path.resolve(__dirname, "../..");
}

function normalizeShortSha(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  // Dockerfile 的 ARG 默认值是 unknown，视同没注入（否则会盖掉 dev 下的 git 兜底）。
  if (!trimmed || trimmed.toLowerCase() === UNKNOWN) return undefined;
  return trimmed.slice(0, 7);
}

function readShortShaFile(): string | undefined {
  try {
    return normalizeShortSha(
      fs.readFileSync(path.join(resolveRepositoryRoot(), BUILD_SHA_FILE_NAME), "utf-8"),
    );
  } catch {
    return undefined;
  }
}

function readVersionFromPackageJson(): string {
  try {
    // src/config 与 dist/config 都位于仓库/镜像的二级目录，向上两级即 package.json。
    const packageJsonPath = path.resolve(__dirname, "../../package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
    return version || UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

function readInjectedShortSha(): string | undefined {
  const injected = [
    process.env.APP_GIT_SHA,
    process.env.GIT_SHA,
    process.env.GITHUB_SHA,
    process.env.SOURCE_VERSION,
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  return normalizeShortSha(injected);
}

function resolveShortSha(): string {
  const fromFile = readShortShaFile();
  if (fromFile) return fromFile;

  const injected = readInjectedShortSha();
  if (injected) return injected;

  // 没有构建期元数据时只在真有 .git 的目录里尝试（生产镜像不满足，省掉一次必然失败的进程开销）。
  const repositoryRoot = resolveRepositoryRoot();
  if (!fs.existsSync(path.join(repositoryRoot, ".git"))) return UNKNOWN;

  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: repositoryRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return UNKNOWN;
  }
}

export const backendBuildInfo: BackendBuildInfo = {
  version: readVersionFromPackageJson(),
  shortSha: resolveShortSha(),
};
