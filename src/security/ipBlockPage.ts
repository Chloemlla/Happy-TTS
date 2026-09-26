/**
 * 被封禁 IP 的阻断页（自包含 HTML，不依赖 SPA 的 JS/CSS）。
 *
 * 为什么不在 React 里渲染：ipBanCheck 跑在最外层，被封禁的 IP 连 index.html 与静态资源
 * 都会被 403，SPA 根本加载不起来 —— 页面只能由后端直接吐出来。视觉与首访验闸
 * （frontend/src/components/FirstVisitVerification.tsx 的 banState 分支）保持同一套设计语言：
 * 浅灰底 + 网格纹理 + 橙色强调 + 白色卡片。
 *
 * 注意：本文件只做字符串拼接，所有插入值都必须先 escapeHtml，reason 来自数据库（可能含
 * 管理员手填的文本）与风险服务。
 */

export interface IpBlockPageOptions {
  reason?: string;
  /** 封禁到期时间。banCache 里存的是 Date | number（epoch ms），两边都要能吃。 */
  expiresAt?: Date | string | number;
  ip?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 统一成 UTC 可读时间；非法值返回 null（不展示这一行）。 */
function formatExpiry(value?: Date | string | number): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function renderIpBlockPage(options: IpBlockPageOptions = {}): string {
  const reason =
    options.reason?.trim() || "This IP is currently restricted because of repeated abnormal traffic.";
  const expiresAt = formatExpiry(options.expiresAt);
  const ip = options.ip?.trim();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Access temporarily restricted</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 16px;background:#f4f6fa;color:#1d2735;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
body::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.6;background-image:linear-gradient(rgba(15,23,42,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.028) 1px,transparent 1px);background-size:34px 34px}
body::after{content:"";position:fixed;left:0;right:0;top:0;height:160px;pointer-events:none;background:linear-gradient(180deg,rgba(244,129,32,.09),transparent)}
.card{position:relative;width:100%;max-width:576px;overflow:hidden;border:1px solid #e3e9f2;border-radius:24px;background:#fff;box-shadow:0 30px 70px -30px rgba(15,23,42,.25)}
.head{display:flex;align-items:center;gap:12px;padding:24px;border-bottom:1px solid #eef2f7;background:#fff8f4}
.badge{display:flex;height:48px;width:48px;flex:0 0 auto;align-items:center;justify-content:center;border:1px solid #ffd6c2;border-radius:16px;background:#fff;color:#e0562b;font-size:18px}
.eyebrow{margin:0;font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#e0562b}
h1{margin:2px 0 0;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.02em}
.body{padding:24px;font-size:14px;line-height:1.7;color:#526071}
.body p{margin:0}
.meta{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px 16px;border:1px solid #e7ecf3;border-radius:16px;background:#f8fafc;color:#2c3948}
.label{margin:16px 0 4px;font-size:12px;color:#8b97a6}
code{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#334155;word-break:break-all}
.foot{margin-top:20px;font-size:12px;color:#8b97a6}
</style>
</head>
<body>
<main class="card">
  <div class="head">
    <span class="badge" aria-hidden="true">&#9940;</span>
    <div>
      <p class="eyebrow">Security check</p>
      <h1>Access temporarily restricted</h1>
    </div>
  </div>
  <div class="body">
    <p>${escapeHtml(reason)}</p>
    ${expiresAt ? `<div class="meta"><span aria-hidden="true">&#128339;</span><span>Retry after ${escapeHtml(expiresAt)}</span></div>` : ""}
    ${ip ? `<p class="label">IP address</p><code>${escapeHtml(ip)}</code>` : ""}
    <p class="foot">如果这是误判，请把上面的 IP 与时间一并告知站点管理员申请解封。</p>
  </div>
</main>
</body>
</html>`;
}
