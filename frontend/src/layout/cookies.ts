/**
 * Cookie helpers for sidebar open/collapsed state persistence.
 * Mirrors new-api `getCookie('sidebar_state')` usage.
 */

const SIDEBAR_COOKIE_NAME = 'sidebar_state';

export function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}

/**
 * Read the remembered sidebar open state. Defaults to `true` (expanded)
 * when no cookie is set or when the cookie is anything other than `"false"`.
 */
export function getSidebarDefaultOpen(): boolean {
  return getCookie(SIDEBAR_COOKIE_NAME) !== 'false';
}

export { SIDEBAR_COOKIE_NAME };
