import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import type { NavGroup, ResolvedSidebarView } from '@/layout/types';
import { useAuth } from '@/hooks/useAuth';

import { getRootNavGroups } from './navConfig';
import { resolveSidebarView } from './sidebarViews';

/** Sentinel key used for the root navigation in animation `key=` props. */
const ROOT_VIEW_KEY = '__root';

/**
 * Resolve the active sidebar view for the current location.
 *
 * - Returns the matching nested {@link SidebarView} (with its nav groups)
 *   when the URL belongs to a registered drill-in workspace.
 * - Otherwise returns the root navigation, narrowed by role.
 */
export function useSidebarView(): ResolvedSidebarView {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const canUseTranslation = user?.isTranslationEnabled !== false;

  const rootNavGroups = useMemo<NavGroup[]>(
    () =>
      getRootNavGroups({
        isAdmin,
        canUseTranslation,
      }),
    [isAdmin, canUseTranslation],
  );

  const view = resolveSidebarView(pathname);

  // Nested admin view is only available to admins. Non-admins fall back to root.
  if (view && isAdmin) {
    return {
      key: view.id,
      view,
      navGroups: view.getNavGroups(),
    };
  }

  return {
    key: ROOT_VIEW_KEY,
    view: null,
    navGroups: rootNavGroups,
  };
}
