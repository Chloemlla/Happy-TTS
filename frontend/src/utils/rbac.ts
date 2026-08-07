/**
 * RBAC helpers for the frontend UI tiering.
 *
 * `superadmin` is a superset of `admin`: everything admin can see,
 * superadmin can see too. The backend is the source of truth for
 * authorization; these helpers only drive UI visibility.
 */

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === 'superadmin';
}
