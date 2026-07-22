import type { NavCollapsible, NavItem, NavLink } from './types';

/**
 * Decide whether a nav item is active for the current pathname.
 *
 * Mirrors new-api `checkIsActive` but uses react-router's pathname string
 * instead of a full href. Root (`/`) only matches exactly.
 */
export function checkIsActive(
  pathname: string,
  item: Pick<NavItem, 'activeUrls' | 'matchChildren'> & { url?: string },
): boolean {
  const candidates: string[] = [];
  if (item.url) candidates.push(item.url);
  if (item.activeUrls) candidates.push(...item.activeUrls);

  // Collapsible: active if any child is active.
  if ('items' in item && Array.isArray((item as NavCollapsible).items)) {
    return (item as NavCollapsible).items.some((sub) =>
      checkIsActive(pathname, sub),
    );
  }

  for (const candidate of candidates) {
    if (candidate === '/') {
      if (pathname === '/') return true;
      continue;
    }
    if (pathname === candidate) return true;
    if (
      item.matchChildren &&
      pathname.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`)
    ) {
      return true;
    }
  }

  return false;
}

/** Type guard: is this a flat link? */
export function isNavLink(item: NavItem): item is NavLink {
  return 'url' in item && typeof item.url === 'string';
}
