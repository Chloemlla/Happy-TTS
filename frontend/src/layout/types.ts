import type { ElementType } from 'react';
import type { IconType } from 'react-icons';

/**
 * Base navigation item shared fields.
 */
type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: IconType | ElementType;
  /** Extra path prefixes that should mark this item active. */
  activeUrls?: string[];
  /**
   * When true, any child path under `url` (or activeUrls) also activates.
   * Equivalent to MobileNav's `matchChildren`.
   */
  matchChildren?: boolean;
  /**
   * Minimum role required to see this item. Synapse roles are string
   * enums (`'admin' | 'user'`); use `'admin'` to hide from non-admins.
   */
  requiredRole?: 'admin' | 'user';
};

/**
 * Single navigation link.
 */
export type NavLink = BaseNavItem & {
  url: string;
  items?: never;
};

/**
 * Collapsible group with nested links (kept for future use; root nav is flat).
 */
export type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: string })[];
  url?: never;
};

export type NavItem = NavCollapsible | NavLink;

/**
 * A labeled section of the sidebar.
 */
export type NavGroup = {
  id?: string;
  title: string;
  items: NavItem[];
};

/**
 * Root sidebar data payload.
 */
export type SidebarData = {
  navGroups: NavGroup[];
};

/**
 * Back-navigation descriptor for a nested (drill-in) sidebar view.
 */
export type SidebarViewParent = {
  to: string;
  /** Already-localized label, e.g. "返回主导航". */
  label: string;
};

/**
 * Nested sidebar view configuration (Vercel / Cloudflare drill-in pattern).
 */
export type SidebarView = {
  id: string;
  pathPattern: RegExp;
  parent: SidebarViewParent;
  getNavGroups: () => NavGroup[];
};

/**
 * Resolved sidebar view returned by `useSidebarView()`.
 *
 * - `view === null`: root navigation
 * - `view !== null`: nested workspace view (renders back header)
 */
export type ResolvedSidebarView = {
  key: string;
  view: SidebarView | null;
  navGroups: NavGroup[];
};
