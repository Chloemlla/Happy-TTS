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
  options?: { siblingUrls?: string[] },
): boolean {
  const candidates: string[] = [];
  if (item.url) candidates.push(item.url);
  if (item.activeUrls) candidates.push(...item.activeUrls);

  // Collapsible: active if any child is active.
  if ('items' in item && Array.isArray((item as NavCollapsible).items)) {
    return (item as NavCollapsible).items.some((sub) =>
      checkIsActive(pathname, sub, options),
    );
  }

  let matched = false;
  let matchedLen = -1;

  for (const candidate of candidates) {
    if (candidate === '/') {
      if (pathname === '/') {
        matched = true;
        matchedLen = 1;
      }
      continue;
    }
    if (pathname === candidate) {
      matched = true;
      matchedLen = Math.max(matchedLen, candidate.length);
      continue;
    }
    if (
      item.matchChildren &&
      pathname.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`)
    ) {
      matched = true;
      matchedLen = Math.max(matchedLen, candidate.length);
    }
  }

  if (!matched) return false;

  // Prefer the more specific sibling so parent+child don't both light up.
  const siblings = options?.siblingUrls;
  if (siblings?.length) {
    for (const sibling of siblings) {
      if (!sibling || sibling === item.url || sibling === '/') continue;
      if (pathname === sibling || pathname.startsWith(`${sibling}/`)) {
        if (sibling.length > matchedLen) return false;
      }
    }
  }

  return true;
}

/** Type guard: is this a flat link? */
export function isNavLink(item: NavItem): item is NavLink {
  return 'url' in item && typeof item.url === 'string';
}
