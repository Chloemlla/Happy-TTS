/**
 * 构建期注入的构建信息：前端版本、后端版本与短 SHA（页脚展示）。
 *
 * 三个标识符由 `frontend/vite.config.ts` 的 `define` 在构建时替换成字符串字面量，
 * 类型声明见 `src/types/build-info.d.ts`（.d.ts 不参与打包，避免 `define` 把声明名
 * 也一起替换掉）。非 Vite 环境（vitest / 直接 tsc / 未注入的构建）下标识符不存在，
 * 用 try/catch 兜底成 "unknown"，不让页脚因 ReferenceError 整块挂掉。
 */

const UNKNOWN = "unknown";

function readInjected(read: () => string): string {
  try {
    const value = read();
    return typeof value === "string" && value.trim() ? value.trim() : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

export interface BuildInfo {
  /** 前端自身版本（frontend/package.json） */
  frontendVersion: string;
  /** 后端版本（仓库根 package.json） */
  backendVersion: string;
  /** 本次构建所用提交的短 SHA */
  shortSha: string;
}

export const buildInfo: BuildInfo = {
  frontendVersion: readInjected(() => __FRONTEND_VERSION__),
  backendVersion: readInjected(() => __BACKEND_VERSION__),
  shortSha: readInjected(() => __GIT_SHORT_SHA__),
};