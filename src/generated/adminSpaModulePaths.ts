/**
 * 本文件由 `pnpm run generate:admin-spa-paths` 生成，请勿手工编辑。
 *
 * 数据源：frontend/src/components/admin/adminModules.tsx 的 ADMIN_MODULE_LOADERS。
 * 用途：src/routes/legacyApiRedirect.ts 判断哪些 /admin/<module> 是前端面板页面，
 * 整页导航时放行给 SPA，而不是 308 到对应的 API 路径。
 */
export const ADMIN_SPA_MODULE_PATHS = [
  "/admin/announcement",
  "/admin/apikey-billing",
  "/admin/apikeys",
  "/admin/audit-log",
  "/admin/bilibili-sync",
  "/admin/broadcast",
  "/admin/coin-flip",
  "/admin/command",
  "/admin/crash-reports",
  "/admin/data-collection",
  "/admin/ecoenchants",
  "/admin/ecoenchants-ops",
  "/admin/email-traceability",
  "/admin/env",
  "/admin/fbiwanted",
  "/admin/fingerprint",
  "/admin/github-billing-cache",
  "/admin/humancheck",
  "/admin/ip-ban",
  "/admin/ip-risk-logs",
  "/admin/librechat",
  "/admin/logshare",
  "/admin/lottery",
  "/admin/mail-system",
  "/admin/markdown-articles",
  "/admin/media-tool",
  "/admin/oauth",
  "/admin/outemail",
  "/admin/qq-guard",
  "/admin/registration-invites",
  "/admin/shortlink",
  "/admin/shorturlmigration",
  "/admin/system",
  "/admin/translation-audit",
  "/admin/tts-history",
  "/admin/users",
  "/admin/webhookevents",
] as const;
