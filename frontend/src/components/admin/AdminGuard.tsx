import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { getApiBaseUrl } from '@/api/api';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/rbac';
import {
  hasFreshVerify,
  rememberVerify,
  resetAdminVerifyCache,
  VERIFY_TTL_MS,
} from '@/utils/adminVerifyCache';
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

export { resetAdminVerifyCache };

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

        if (!isAdminRole(user.role)) {
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

        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/admin/verify-access`,
            {
              method: 'POST',
              credentials: 'include',
              headers: {
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

  // Re-check periodically while authorized. On a transient network/backend
  // failure, back off exponentially instead of silently retrying at the same
  // cadence (G11-09); on HTTP non-2xx clear the soft-cache and bounce to login.
  useEffect(() => {
    if (!isAuthorized) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout>;
    let consecutiveFailures = 0;
    const MAX_BACKOFF_MS = VERIFY_TTL_MS * 4; // 封顶 20 分钟

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/admin/verify-access`,
            {
              method: 'POST',
              credentials: 'include',
              headers: {
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
            resetAdminVerifyCache();
            setNotification({
              message: '权限已失效，请重新登录',
              type: 'warning',
            });
            navigate('/login');
            return;
          }

          if (user?.id) rememberVerify(user.id);
          consecutiveFailures = 0;
          scheduleNext(VERIFY_TTL_MS);
        } catch (error) {
          console.error('[AdminGuard] 定期权限检查失败:', error);
          consecutiveFailures += 1;
          const backoffMs = Math.min(
            VERIFY_TTL_MS * 2 ** (consecutiveFailures - 1),
            MAX_BACKOFF_MS,
          );
          setNotification({
            message: '权限复查暂时失败，将自动重试',
            type: 'warning',
          });
          scheduleNext(backoffMs);
        }
      }, delayMs);
    };

    scheduleNext(VERIFY_TTL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
  if (!isAdminRole(user.role)) return <Navigate to='/' replace />;
  return <AdminGuard>{children}</AdminGuard>;
};

export default AdminGuard;
