/**
 * AdminGuard 的模块级软缓存（G11-17）。
 *
 * 5 分钟内同一 userId 免重复调用 /api/admin/verify-access，避免管理模块切换时
 * 闪全屏重认证。登出流程必须调用 resetAdminVerifyCache() 清空，否则同一账号
 * 降权后重新登录、会话内仍会吃到旧缓存放行。
 *
 * 抽到独立模块是为了避免 useAuth -> AdminGuard -> useAuth 的循环依赖。
 */
const VERIFY_TTL_MS = 5 * 60 * 1000;

let lastVerifyUserId: string | null = null;
let lastVerifyAt = 0;

export function hasFreshVerify(userId?: string | null): boolean {
  return Boolean(
    userId &&
      lastVerifyUserId === userId &&
      Date.now() - lastVerifyAt < VERIFY_TTL_MS,
  );
}

export function rememberVerify(userId: string) {
  lastVerifyUserId = userId;
  lastVerifyAt = Date.now();
}

export function resetAdminVerifyCache() {
  lastVerifyUserId = null;
  lastVerifyAt = 0;
}

export { VERIFY_TTL_MS };
