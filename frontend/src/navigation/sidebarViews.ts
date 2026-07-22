import { getAdminNavGroups } from './navConfig';
import type { SidebarView } from '@/layout/types';

/**
 * Registered nested sidebar views.
 *
 * Each entry describes a contextual sidebar that replaces the root
 * navigation when the user enters that workspace (Vercel-style
 * "drill-in" pattern). Add new entries here to register a new view.
 *
 * Match priority is array order; the first matching `pathPattern` wins.
 */
/** Admin-workspace paths outside `/admin/*` that still use the drill-in shell. */
const ADMIN_WORKSPACE_EXTRAS =
  'email-sender|nexai-security|tamper-detection-demo';

export const ADMIN_VIEW: SidebarView = {
  id: 'admin',
  // Match /admin, /admin/*, and a few dedicated admin routes outside /admin.
  pathPattern: new RegExp(
    `^/(?:admin(?:/|$)|(?:${ADMIN_WORKSPACE_EXTRAS})$)`,
  ),
  parent: {
    to: '/',
    label: '返回主导航',
  },
  getNavGroups: () => getAdminNavGroups(),
};

const SIDEBAR_VIEWS: readonly SidebarView[] = [ADMIN_VIEW];

/**
 * Resolve the active nested view for the given path.
 *
 * @returns Matching {@link SidebarView}, or `null` when the root
 *          navigation should be displayed.
 */
export function resolveSidebarView(pathname: string): SidebarView | null {
  return SIDEBAR_VIEWS.find((view) => view.pathPattern.test(pathname)) ?? null;
}
