import { useAuth } from '@/hooks/useAuth';
import { isAdminRole, isSuperAdmin } from '@/utils/rbac';

/**
 * RBAC hooks for the frontend UI tiering.
 *
 * `superadmin` is a superset of `admin`: everything admin can see,
 * superadmin can see too. The backend is the source of truth for
 * authorization; these hooks only drive UI visibility.
 */

/** True when the current user is `admin` or `superadmin`. */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return isAdminRole(user?.role);
}

/** True only when the current user is `superadmin`. */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return isSuperAdmin(user?.role);
}
