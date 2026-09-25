import { Analytics } from '@vercel/analytics/react';

/**
 * Vercel Web Analytics（访客数 / 页面浏览量统计），无可见 UI。
 *
 * 为什么默认不开启：SDK 在生产模式下注入的是**同源**脚本 `/_vercel/insights/script.js`，
 * 这个路径只有部署在 Vercel 边缘网络上才存在。自建部署（Docker + Express 直接托管 `dist/`）
 * 上它只会得到一个 404 请求，所以按「构建目标」而不是「运行环境」来判定：
 *
 * 1. `pnpm run build:vercel`（即 `vite build --mode vercel`，两个 vercel.json 的 buildCommand）→ 自动开启；
 * 2. `VITE_VERCEL_ANALYTICS=true` → 在任意构建里强制开启（例如自建但把上报端点指回 Vercel）。
 *
 * CSP 侧无需改动：同源脚本落在 `script-src 'self'` 里；只有 `mode: 'development'`（或开发期
 * 强制开启）才会去拉 `https://va.vercel-scripts.com/v1/script.debug.js` 那把调试脚本，
 * 需要时再把该域名加进 `src/security/contentSecurityPolicy.ts` 的白名单。
 */
const ANALYTICS_ENABLED =
  import.meta.env.MODE === 'vercel' || import.meta.env.VITE_VERCEL_ANALYTICS === 'true';

export function VercelAnalytics() {
  if (!ANALYTICS_ENABLED) return null;
  // 不传 route/path：SDK 自己 patch history.pushState，配合 React Router 的客户端跳转即可；
  // mode 用默认 auto，判定不了环境时按 production 处理（本入口把 process 指向 process/browser）。
  return <Analytics />;
}

export default VercelAnalytics;
