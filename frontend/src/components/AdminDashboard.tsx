import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { ADMIN_TAB_TO_PATH } from '@/navigation/navConfig';

import { AdminHub } from './admin/AdminHub';

/**
 * Compatibility entry for the legacy `/admin` + `?tab=` deep links.
 *
 * - `/admin?tab=users` → redirect to `/admin/users`
 * - `/admin` (no tab) → render the new AdminHub overview
 *
 * The previous tab-switcher UI is retired; navigation now lives in the
 * desktop drill-in sidebar (and MobileNav on small screens).
 */
const AdminDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  if (tab && ADMIN_TAB_TO_PATH[tab]) {
    return <Navigate to={ADMIN_TAB_TO_PATH[tab]} replace />;
  }

  return <AdminHub />;
};

export default AdminDashboard;
