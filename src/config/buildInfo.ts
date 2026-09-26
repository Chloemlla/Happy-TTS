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
 * 1. 镜像/运行时注入的环境变量（Docker 构建参数 GIT_SHA → APP_GIT_SHA）——
 *    生产镜像里没有 .git（.dockerignore 排除），只能靠它；
 * 2. 仓库根确实存在 .git 时用 `git rev-parse` 兜底（本机 dev / 直接跑源码的场景）。
 */
export interface BackendBuildInfo {
  version: string;
  shortSha: string;
}

const UNKNOWN = "unknown";

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
  return injected ? injected.trim().slice(0, 7) : undefined;
}

function resolveShortSha(): string {
  const injected = readInjectedShortSha();
  if (injected) return injected;

  // 没有环境变量时只在真有 .git 的目录里尝试（生产镜像不满足，省掉一次必然失败的进程开销）。
  const repositoryRoot = path.resolve(__dirname, "../..");
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
