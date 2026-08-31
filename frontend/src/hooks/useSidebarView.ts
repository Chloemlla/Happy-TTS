import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import type { NavGroup, ResolvedSidebarView } from '@/layout/types';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole, isSuperAdmin as isSuperAdminRole } from '@/utils/rbac';

import { getRootNavGroups } from '@/navigation/navConfig';
import { resolveSidebarView } from '@/navigation/sidebarViews';

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

  const isAdmin = isAdminRole(user?.role);
  const isSuperAdmin = isSuperAdminRole(user?.role);
  // 契约对齐：匿名用户（user 为 null）不得显示翻译入口；只有已登录且未被禁用翻译时才可用
  const canUseTranslation = Boolean(user) && user?.isTranslationEnabled !== false;

  const rootNavGroups = useMemo<NavGroup[]>(
    () =>
      getRootNavGroups({
        isAdmin,
        isSuperAdmin,
        canUseTranslation,
      }),
    [isAdmin, isSuperAdmin, canUseTranslation],
  );

  const view = resolveSidebarView(pathname);

  // Nested admin view is only available to admins. Non-admins fall back to root.
  if (view && isAdmin) {
    return {
      key: view.id,
      view,
      navGroups: view.getNavGroups({ isAdmin, isSuperAdmin, canUseTranslation }),
    };
  }

  return {
    key: ROOT_VIEW_KEY,
    view: null,
    navGroups: rootNavGroups,
  };
}
