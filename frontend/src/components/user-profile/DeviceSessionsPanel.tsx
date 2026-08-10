import React from 'react';
import {
  FaCheckCircle,
  FaClock,
  FaDesktop,
  FaHistory,
  FaMapMarkerAlt,
  FaMobileAlt,
  FaSignOutAlt,
  FaSyncAlt,
} from 'react-icons/fa';
import {
  canLogoutDeviceSession,
  formatDateTime,
  formatRelativeTime,
  UserDeviceSession,
} from './profileHelpers';
import { cn } from '../../utils/cn';
import {
  studioFieldClassName,
  studioPrimaryButtonClassName,
} from '../studioTheme';

export interface DeviceSessionsPanelProps {
  sessions: UserDeviceSession[];
  loading: boolean;
  error: string | null;
  securitySessionActive: boolean;
  actionLoading: boolean;
  onRefresh: () => void;
  onRequestVerification: () => void;
  onLogoutDevice: (deviceKey: string) => void;
}

const getDeviceIcon = (session: UserDeviceSession) => {
  const identity = `${session.client} ${session.platform}`.toLowerCase();
  return /android|ios|mobile|piliplus/.test(identity) ? FaMobileAlt : FaDesktop;
};

const displayValue = (value?: string | null): string => value || '未记录';

const DeviceSessionsPanel: React.FC<DeviceSessionsPanelProps> = ({
  sessions,
  loading,
  error,
  securitySessionActive,
  actionLoading,
  onRefresh,
  onRequestVerification,
  onLogoutDevice,
}) => {
  const otherSessions = sessions.filter(canLogoutDeviceSession);
  const hasOtherSessions = otherSessions.length > 0;

  return (
    <section
      className="mb-4 rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5"
      aria-labelledby="device-sessions-title"
      aria-busy={loading || actionLoading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <FaHistory />
            <span id="device-sessions-title">设备与会话</span>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-slate-600 sm:text-sm">
            查看网页、PiliPlus、Synapse-Client 等登录设备。退出操作会保留当前 Profile 设备。
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || actionLoading}
          className={cn(
            studioFieldClassName,
            'inline-flex w-auto shrink-0 items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-label="刷新设备会话"
          title="刷新设备会话"
        >
          <FaSyncAlt className={loading ? 'animate-spin' : undefined} />
          刷新
        </button>
      </div>

      {error && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || actionLoading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            <FaSyncAlt />
            重试
          </button>
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-4 text-sm text-slate-500">
          <FaSyncAlt className="animate-spin" />
          正在加载设备会话...
        </div>
      ) : sessions.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-4 text-sm text-slate-500">
          暂无活跃设备会话。
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {sessions.map((session) => {
            const DeviceIcon = getDeviceIcon(session);
            const canLogout = canLogoutDeviceSession(session);

            return (
              <article
                key={session.id}
                className={cn(
                  'min-w-0 rounded-[20px] border px-3.5 py-3.5 sm:px-4',
                  session.isCurrent
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-slate-200 bg-slate-50/70',
                )}
              >
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={cn(
                      'flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl',
                      session.isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500',
                    )}>
                      <DeviceIcon />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-semibold text-slate-900">{session.deviceName}</h3>
                        {session.isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                            <FaCheckCircle />
                            当前 Profile 设备
                          </span>
                        ) : (
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                            其他设备
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-words text-xs font-medium text-slate-600">
                        {displayValue(session.client)} / {displayValue(session.platform)}
                      </div>
                    </div>
                  </div>

                  {canLogout && (
                    <button
                      type="button"
                      onClick={securitySessionActive
                        ? () => onLogoutDevice(session.id)
                        : onRequestVerification}
                      disabled={actionLoading}
                      className={cn(
                        studioPrimaryButtonClassName,
                        'w-full shrink-0 px-3 py-2 text-xs sm:w-auto',
                      )}
                      title="需要安全会话验证"
                    >
                      {actionLoading ? <FaSyncAlt className="animate-spin" /> : <FaSignOutAlt />}
                      {securitySessionActive ? '退出此设备全部会话' : '验证后退出此设备'}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid min-w-0 gap-2 border-t border-slate-200/80 pt-3 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">最近活动</div>
                    <div className="mt-1 flex min-w-0 items-start gap-1.5 break-words">
                      <FaClock className="mt-0.5 shrink-0 text-slate-400" />
                      <span>
                        {formatRelativeTime(session.lastActiveAt)}
                        {session.lastActiveAt ? ` · ${formatDateTime(session.lastActiveAt)}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">IP 地址</div>
                    <div className="mt-1 break-words font-medium">{displayValue(session.ip)}</div>
                  </div>
                  <div className="min-w-0 sm:col-span-2 xl:col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">IP 属地</div>
                    <div className="mt-1 flex min-w-0 items-start gap-1.5 break-words font-medium">
                      <FaMapMarkerAlt className="mt-0.5 shrink-0 text-slate-400" />
                      <span>{displayValue(session.ipLocation)}</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasOtherSessions && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3.5 py-3 text-[12px] leading-5 text-amber-700">
          <FaSignOutAlt className="mt-0.5 shrink-0" />
          <span>每个设备的退出操作会撤销该设备或客户端的全部关联会话；当前 Profile 设备不会提供退出按钮。</span>
        </div>
      )}
    </section>
  );
};

export default DeviceSessionsPanel;
