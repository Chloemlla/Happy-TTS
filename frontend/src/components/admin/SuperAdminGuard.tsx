import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';

import { useAuth } from '@/hooks/useAuth';
import { useIsSuperAdmin } from '@/hooks/useRBAC';
import {
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryShell,
} from '@/components/LogShareStyleScaffold';

/**
 * Superadmin-only route gate, meant to nest inside `AdminGuard` for
 * modules whose backend writes require `superadmin`. Plain admins who
 * deep-link into these pages see a permission panel instead of the UI.
 */
export const SuperAdminGuard: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const { loading } = useAuth();
  const isSuperAdminUser = useIsSuperAdmin();
  const navigate = useNavigate();

  if (loading) return null;

  if (!isSuperAdminUser) {
    return (
      <InfoQueryShell className='logshare-admin-surface'>
        <InfoPanel className='border-rose-100'>
          <div className='flex min-h-[360px] items-center justify-center'>
            <div className='max-w-md text-center'>
              <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-rose-50 text-rose-700 ring-1 ring-rose-100'>
                <FaShieldAlt className='h-6 w-6' />
              </div>
              <div className='mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400'>
                Access Denied
              </div>
              <h2 className='mt-3 text-2xl font-semibold text-slate-900'>
                需要超级管理员权限
              </h2>
              <p className='mt-3 text-sm leading-7 text-slate-600'>
                该模块仅限超级管理员访问，请联系超级管理员处理。
              </p>
              <InfoPrimaryButton className='mt-6' onClick={() => navigate('/admin')}>
                返回管理总览
              </InfoPrimaryButton>
            </div>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  return <>{children}</>;
};

export default SuperAdminGuard;
