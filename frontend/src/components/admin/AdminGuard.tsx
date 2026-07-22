import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { getApiBaseUrl } from '@/api/api';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/utils/authSession';
import { SimpleLoadingSpinner } from '@/components/LoadingSpinner';
import {
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryShell,
} from '@/components/LogShareStyleScaffold';
import { useNotification } from '@/components/Notification';
import { FaShieldAlt } from 'react-icons/fa';

type AdminGuardProps = {
  children: React.ReactNode;
};

/** Soft-cache last successful verify so admin module switches don't flash full re-auth. */
const VERIFY_TTL_MS = 5 * 60 * 1000;
let lastVerifyUserId: string | null = null;
let lastVerifyAt = 0;

function hasFreshVerify(userId?: string | null): boolean {
  return Boolean(
    userId &&
      lastVerifyUserId === userId &&
      Date.now() - lastVerifyAt < VERIFY_TTL_MS,
  );
}

function rememberVerify(userId: string) {
  lastVerifyUserId = userId;
  lastVerifyAt = Date.now();
}

/**
 * Shared admin access gate for every `/admin/*` route.
 *
 * Extracts the multi-layer verification previously embedded in
 * `AdminDashboard.tsx` (role check + `/api/admin/verify-access` + 5-min poll)
 * so the hub and every module page reuse one guard.
 */
export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { setNotification } = useNotification();
  const navigate = useNavigate();
  const cachedOk = hasFreshVerify(user?.id);
  const [isAuthorized, setIsAuthorized] = useState(cachedOk);
  const [isLoading, setIsLoading] = useState(!cachedOk);

  useEffect(() => {
    let cancelled = false;

    const verifyAdminAccess = async () => {
      try {
        if (loading) return;

        if (!user) {
          setIsLoading(true);
          setNotification({ message: '请先登录', type: 'warning' });
          navigate('/login');
          return;
        }

        if (user.role !== 'admin') {
          setIsLoading(true);
          setNotification({
            message: '权限不足，仅限管理员访问',
            type: 'error',
          });
          navigate('/');
          return;
        }

        // Skip full-page loader when we verified this admin recently.
        if (hasFreshVerify(user.id)) {
          if (!cancelled) {
            setIsAuthorized(true);
            setIsLoading(false);
          }
          return;
        }

        if (!cancelled) setIsLoading(true);

        const token = getAuthToken();
        if (!token) {
          setNotification({ message: '登录已过期，请重新登录', type: 'error' });
          navigate('/login');
          return;
        }

        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/admin/verify-access`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: user.id,
                username: user.username,
                role: user.role,
              }),
            },
          );

          if (!response.ok) throw new Error('后端权限验证失败');
          const result = await response.json();
          if (!result.success) throw new Error(result.message || '权限验证失败');

          rememberVerify(user.id);
          if (!cancelled) setIsAuthorized(true);
        } catch (error) {
          console.error('[AdminGuard] 后端权限验证失败:', error);
          setNotification({
            message: '权限验证失败，请重新登录',
            type: 'error',
          });
          navigate('/login');
        }
      } catch (error) {
        console.error('[AdminGuard] 权限验证过程中发生错误:', error);
        setNotification({ message: '权限验证失败', type: 'error' });
        navigate('/');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void verifyAdminAccess();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, setNotification]);

  // Re-check every 5 minutes while authorized.
  useEffect(() => {
    if (!isAuthorized) return undefined;

    const interval = window.setInterval(async () => {
      try {
        const token = getAuthToken();
        if (!token) {
          setNotification({
            message: '登录已过期，请重新登录',
            type: 'warning',
          });
          navigate('/login');
          return;
        }

        const response = await fetch(
          `${getApiBaseUrl()}/api/admin/verify-access`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user?.id,
              username: user?.username,
              role: user?.role,
            }),
          },
        );

        if (!response.ok) {
          lastVerifyUserId = null;
          lastVerifyAt = 0;
          setNotification({
            message: '权限已失效，请重新登录',
            type: 'warning',
          });
          navigate('/login');
        } else if (user?.id) {
          rememberVerify(user.id);
        }
      } catch (error) {
        console.error('[AdminGuard] 定期权限检查失败:', error);
      }
    }, VERIFY_TTL_MS);

    return () => window.clearInterval(interval);
  }, [isAuthorized, user, navigate, setNotification]);

  if (loading || isLoading) {
    return (
      <InfoQueryShell className='logshare-admin-surface'>
        <InfoPanel>
          <div className='flex min-h-[360px] items-center justify-center'>
            <div className='text-center'>
              <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500'>
                <SimpleLoadingSpinner size={0.75} />
              </div>
              <div className='mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400'>
                Admin Access
              </div>
              <p className='mt-3 text-sm leading-7 text-slate-600'>
                正在验证管理员权限...
              </p>
            </div>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  if (!isAuthorized) {
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
                访问被拒绝
              </h2>
              <p className='mt-3 text-sm leading-7 text-slate-600'>
                您没有权限访问管理后台。
              </p>
              <InfoPrimaryButton className='mt-6' onClick={() => navigate('/')}>
                返回首页
              </InfoPrimaryButton>
            </div>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  return <>{children}</>;
};

/**
 * Convenience wrapper that redirects non-admins via the shared guard.
 * Prefer nesting routes under `<Route element={<AdminGuard>...</AdminGuard>}>`.
 */
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to='/login' replace />;
  if (user.role !== 'admin') return <Navigate to='/' replace />;
  return <AdminGuard>{children}</AdminGuard>;
};

export default AdminGuard;
