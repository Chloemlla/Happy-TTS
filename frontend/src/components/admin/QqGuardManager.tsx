import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaPaperPlane,
  FaRedo,
  FaShieldAlt,
  FaStopCircle,
  FaTerminal,
  FaUserCheck,
  FaListUl,
} from 'react-icons/fa';
import { qqGuardApi } from '../../api/qqGuard';
import type { QqGuardPendingTask, QqGuardStats, QqGuardHealth } from '../../api/qqGuard';
import { SimpleLoadingSpinner } from '../LoadingSpinner';
import {
  InfoMetricCard,
  InfoSectionTitle,
  logSharePanelClass,
} from '../LogShareStyleScaffold';
import { AuditLogPanel } from './qq-guard/AuditLogPanel';
import { WhitelistPanel } from './qq-guard/WhitelistPanel';
import { CommandPanel } from './qq-guard/CommandPanel';
import { TimelineDrawer } from './qq-guard/TimelineDrawer';
import { cx, formatDateTime, shortText } from './qq-guard/ui';

type TabKey = 'overview' | 'audit' | 'whitelist' | 'commands';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: '总览 · 待复审', icon: <FaShieldAlt className="text-xs" /> },
  { key: 'audit', label: '审计日志', icon: <FaListUl className="text-xs" /> },
  { key: 'whitelist', label: '白名单', icon: <FaUserCheck className="text-xs" /> },
  { key: 'commands', label: '命令中心', icon: <FaTerminal className="text-xs" /> },
];

const tinyBtn =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

const HEALTH_REASON: Record<string, string> = {
  'ws-down': '与 NapCat 的 WebSocket 断开',
  'account-stuck': '账号卡死（NapCat 离线僵态，请求超时）',
  reconnected: '通道已恢复',
};

const healthBar = (h: QqGuardHealth | null) => {
  if (!h || h.online === null || h.online === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaShieldAlt className="text-slate-400" />
        <span>尚未收到机器人健康上报（bot 需开启 config.health.enabled）</span>
      </div>
    );
  }
  if (h.online) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <FaCheckCircle className="text-emerald-500" />
        <span className="font-semibold">机器人在线</span>
        {h.latestAt ? (
          <span className="text-emerald-600/80">· 最近上报 {formatDateTime(h.latestAt)}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <FaExclamationTriangle className="text-rose-500" />
      <span className="font-semibold">机器人当前离线（QQ 通道异常）</span>
      {h.latestReason ? <span>· {HEALTH_REASON[h.latestReason] ?? h.latestReason}</span> : null}
      {h.latestAt ? <span>· 离线于 {formatDateTime(h.latestAt)}</span> : null}
      <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
        期间入群申请无法自动处理
      </span>
    </div>
  );
};

/**
 * QQ 群纪律（qq-realname-guard 远端）管理面板。
 * 待复审任务每行可：立即复审 / 豁免成员 / 手动撤回 / 打开时间线。
 * 动作经命令 outbox → bot 执行并回执，回执状态在「命令中心」可见。
 */
export const QqGuardManager: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('overview');
  const [stats, setStats] = useState<QqGuardStats | null>(null);
  const [pending, setPending] = useState<QqGuardPendingTask[]>([]);
  const [health, setHealth] = useState<QqGuardHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyTrace, setBusyTrace] = useState<string | null>(null);
  const [openTrace, setOpenTrace] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, h] = await Promise.all([qqGuardApi.stats(), qqGuardApi.pending(), qqGuardApi.health()]);
      setStats(s);
      setPending(p);
      setHealth(h);
    } catch (err) {
      setError('总览加载失败，请稍后重试');
      console.error('加载 QQ 群纪律总览失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const byEvent = useMemo(() => stats?.byEvent ?? {}, [stats]);
  const c = (key: string) => Number(byEvent[key]) || 0;

  const cards = [
    { label: '总审计条数', value: stats?.total ?? 0, icon: FaListUl, tone: 'slate' as const },
    { label: '判违规', value: c('moderate:violated'), icon: FaExclamationTriangle, tone: 'rose' as const },
    { label: '已撤回', value: c('recalled'), icon: FaStopCircle, tone: 'rose' as const },
    { label: '已私信', value: c('dm_sent'), icon: FaPaperPlane, tone: 'sky' as const },
    { label: '限频免私信', value: c('dm_suppressed'), icon: FaCheckCircle, tone: 'amber' as const },
    { label: '复审任务', value: pending.length, icon: FaRedo, tone: 'violet' as const },
  ];

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 5000);
  };

  const dispatchAction = async (action: 'retry' | 'recall' | 'exempt', task: QqGuardPendingTask) => {
    const label = action === 'retry' ? '立即复审' : action === 'recall' ? '手动撤回' : '豁免';
    setBusyTrace(task.traceId);
    setError(null);
    try {
      let payload: Record<string, unknown> = { traceId: task.traceId };
      if (action === 'retry') {
        payload = { traceId: task.traceId, userId: task.userId, groupId: task.groupId };
      } else if (action === 'recall') {
        payload = {
          traceId: task.traceId,
          userId: task.userId,
          groupId: task.groupId,
          messageId: task.messageId,
          reason: '管理员手动撤回',
        };
      } else {
        payload = { userId: task.userId, traceId: task.traceId, reason: '管理员豁免（可在白名单页管理）' };
      }
      const { commandId } = await qqGuardApi.createCommand(action, payload);
      flash(`已下发「${label}」，命令 ${commandId}，机器人约 20 秒内执行`);
      await loadOverview();
    } catch (err) {
      setError(`「${label}」下发失败：请确认 bot 数据接口可用（Mongo 就绪）`);
      console.error('下发面板命令失败:', err);
    } finally {
      setBusyTrace(null);
    }
  };

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="QQ 群纪律管理"
        description="远端 QQ 群合规审查：AI 裁决、撤回/私信、30 分钟递进复审与命令下发均由 bot 执行，本面板只读审计并下发指令。"
        icon={FaShieldAlt}
        tone="violet"
      />

      {/* tab */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition',
              tab === t.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
          >
            {t.icon}
            {t.label}
            {t.key === 'overview' && pending.length > 0 ? (
              <span
                className={cx(
                  'ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold',
                  tab === 'overview' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-600',
                )}
              >
                {pending.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-5">
          {healthBar(health)}
          <div className={cx(logSharePanelClass, 'p-5')}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              {cards.map((card) => (
                <InfoMetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <FaExclamationTriangle className="text-rose-500" />
              {error}
            </div>
          )}
          {msg && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>
          )}

          <div className={cx(logSharePanelClass, 'overflow-hidden')}>
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="text-sm font-semibold text-slate-800">
                待复审任务
                {pending.length > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    AI 暂不可达，30 分钟自动重试
                  </span>
                )}
              </div>
              <button
                onClick={() => void loadOverview()}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                <FaRedo className="text-xs" />
                刷新
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">挂起时间</th>
                    <th className="px-4 py-3">成员 / 群</th>
                    <th className="px-4 py-3">消息内容摘要</th>
                    <th className="px-4 py-3">尝试</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        当前没有待复审任务 — 每条消息都已完成判定或 AI 可达。
                      </td>
                    </tr>
                  ) : (
                    pending.map((task) => (
                      <tr key={task.traceId} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {formatDateTime(task.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-slate-700">{task.userId ?? '-'}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {task.groupId ?? '-'}
                            {task.messageId ? ` · ${task.messageId}` : ''}
                          </div>
                        </td>
                        <td className="max-w-[300px] px-4 py-3">
                          <div className="truncate text-xs leading-5 text-slate-600">{shortText(task.content, 90)}</div>
                          {task.reason ? (
                            <div className="mt-0.5 text-[10px] text-amber-600">{shortText(task.reason, 60)}</div>
                          ) : null}
                          <button
                            onClick={() => setOpenTrace(task.traceId)}
                            className="mt-1 font-mono text-[10px] text-indigo-600 hover:underline"
                          >
                            {task.traceId}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                            #{task.attempt}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => void dispatchAction('retry', task)}
                              disabled={busyTrace !== null}
                              className={cx(tinyBtn, 'bg-indigo-600 text-white hover:bg-indigo-700')}
                            >
                              <FaRedo className="text-[10px]" />
                              立即复审
                            </button>
                            <button
                              onClick={() => void dispatchAction('exempt', task)}
                              disabled={busyTrace !== null}
                              className={cx(tinyBtn, 'bg-violet-600 text-white hover:bg-violet-700')}
                            >
                              <FaUserCheck className="text-[10px]" />
                              豁免
                            </button>
                            <button
                              onClick={() => void dispatchAction('recall', task)}
                              disabled={busyTrace !== null || !task.messageId}
                              title={task.messageId ? '按 messageId 追溯撤回' : '缺少 messageId，无法追溯撤回'}
                              className={cx(tinyBtn, 'bg-rose-600 text-white hover:bg-rose-700')}
                            >
                              <FaStopCircle className="text-[10px]" />
                              撤回
                            </button>
                            <button
                              onClick={() => setOpenTrace(task.traceId)}
                              className={cx(tinyBtn, 'border border-slate-200 text-slate-500 hover:bg-slate-100')}
                            >
                              时间线
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {loading && (
              <div className="flex justify-center py-4">
                <SimpleLoadingSpinner size={0.9} />
              </div>
            )}
          </div>

          <div className="text-xs leading-6 text-slate-400">
            误判申诉：把消息的 traceId 发给成员 → 成员向群主申诉 → 群主在本面板「时间线」核对 → 误判可
            「豁免」该成员，或按需「撤回」。每次 AI 判定的原因与私信内容均可在审计日志核对。
          </div>
        </div>
      ) : null}

      {tab === 'audit' ? <AuditLogPanel onOpenTrace={setOpenTrace} /> : null}
      {tab === 'whitelist' ? <WhitelistPanel /> : null}
      {tab === 'commands' ? <CommandPanel /> : null}

      {openTrace ? <TimelineDrawer traceId={openTrace} onClose={() => setOpenTrace(null)} /> : null}
    </div>
  );
};

export default QqGuardManager;
