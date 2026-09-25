import { getRootNavGroups, type NavVisibilityContext } from '../navigation/navConfig';
import { isNavLink } from '../layout/url-utils';
import type { NavLink } from '../layout/types';

/**
 * 「继续上次」记忆：记录用户最近一次进入的用户侧功能页，供首页给出一键回跳。
 * 只持久化 url + 时间戳，标题与图标每次读时从 navConfig 现取，
 * 这样改名/换图标/收权限都不需要迁移存量记录。
 */
const STORAGE_KEY = 'synapse:last-feature';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** 首页可直达的功能白名单用「普通用户」上下文求，与登录者权限无关。 */
const FEATURE_WHITELIST_CTX: NavVisibilityContext = {
  isAdmin: false,
  isSuperAdmin: false,
  canUseTranslation: true,
};

function collectFeatureLinks(ctx: NavVisibilityContext): NavLink[] {
  const links: NavLink[] = [];
  for (const group of getRootNavGroups(ctx)) {
    // admin-entry 属于管理后台，不算用户功能。
    if (group.id === 'admin-entry') continue;
    for (const item of group.items) {
      if (isNavLink(item) && item.url !== '/') links.push(item);
    }
  }
  return links;
}

function clearStored(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage 不可用（隐私模式/禁用）时静默跳过
  }
}

/** 读出持久化的功能 url；结构非法或已过期一律返回 null 并清掉记录。 */
function readStoredUrl(): string | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: { url?: unknown; visitedAt?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw) as { url?: unknown; visitedAt?: unknown } | null;
  } catch {
    clearStored();
    return null;
  }
  if (!parsed || typeof parsed.url !== 'string' || typeof parsed.visitedAt !== 'number') {
    clearStored();
    return null;
  }

  const visitedAt = parsed.visitedAt;
  if (!Number.isFinite(visitedAt) || Date.now() - visitedAt > MAX_AGE_MS) {
    clearStored();
    return null;
  }

  return parsed.url;
}

export function recordRecentFeature(pathname: string): void {
  if (typeof window === 'undefined') return;
  const match = collectFeatureLinks(FEATURE_WHITELIST_CTX).find(
    (item) => item.url === pathname,
  );
  if (!match) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: match.url, visitedAt: Date.now() }),
    );
  } catch {
    // localStorage 不可用（隐私模式/禁用）时静默跳过
  }
}

/**
 * 按当前权限上下文解析最近功能；解析不到（功能已下线、翻译权限被收回、
 * 记录过期）一律返回 null，避免首页给出打不开的入口。
 */
export function readRecentFeature(ctx: NavVisibilityContext): NavLink | null {
  if (typeof window === 'undefined') return null;
  const storedUrl = readStoredUrl();
  if (!storedUrl) return null;
  return collectFeatureLinks(ctx).find((item) => item.url === storedUrl) ?? null;
}
