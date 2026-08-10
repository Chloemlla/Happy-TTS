import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaArrowLeft,
  FaBug,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaClock,
  FaSync,
} from 'react-icons/fa';
import { useNotification } from '@/components/Notification';
import { getBackendErrorMessage } from '@/utils/backendError';
import {
  crashReportsApi,
  type CrashGroup,
  type FullCrashReport,
} from '@/api/crashReports';
import {
  InfoBadge,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
} from '@/components/LogShareStyleScaffold';

const PAGE_SIZE = 25;

const RISK_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  high: { label: '高危', dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: '中危', dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { label: '低危', dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const CrashReportManager: React.FC = () => {
  const { setNotification } = useNotification();

  // List view state
  const [groups, setGroups] = useState<CrashGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  // Detail view state
  const [detailGroupKey, setDetailGroupKey] = useState<string | null>(null);
  const [reports, setReports] = useState<FullCrashReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const fetchGroups = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const response = await crashReportsApi.listGroups({ limit: PAGE_SIZE, offset: currentOffset });
      setGroups(response.groups);
      setTotal(response.total);
    } catch (error) {
      setNotification({
        message: getBackendErrorMessage(error, '获取崩溃报告列表失败'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const fetchGroupReports = useCallback(async (groupKey: string) => {
    setLoadingReports(true);
    try {
      const response = await crashReportsApi.getGroupReports(groupKey);
      setReports(response.reports);
    } catch (error) {
      setNotification({
        message: getBackendErrorMessage(error, '获取崩溃报告详情失败'),
        type: 'error',
      });
    } finally {
      setLoadingReports(false);
    }
  }, [setNotification]);

  useEffect(() => {
    void fetchGroups(offset);
  }, [fetchGroups, offset]);

  const refresh = () => {
    if (detailGroupKey) {
      void fetchGroupReports(detailGroupKey);
    } else {
      void fetchGroups(offset);
    }
  };

  const goToDetail = (groupKey: string) => {
    setDetailGroupKey(groupKey);
    setExpandedReportId(null);
    void fetchGroupReports(groupKey);
  };

  const goBackToList = () => {
    setDetailGroupKey(null);
    setReports([]);
    setExpandedReportId(null);
  };

  // ── Detail view ──
  if (detailGroupKey) {
    return (
      <InfoQueryShell>
        <div className="mb-6">
          <button
            type="button"
            onClick={goBackToList}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            <FaArrowLeft /> 返回崩溃组列表
          </button>
        </div>

        <InfoQueryHero
          eyebrow="崩溃报告详情"
          title={`崩溃组: ${detailGroupKey.slice(0, 32)}...`}
          description={`共 ${reports.length} 条崩溃报告`}
          icon={FaBug}
          actions={
            <InfoPrimaryButton onClick={refresh}>
              <FaSync className={loadingReports ? 'animate-spin' : ''} /> 刷新
            </InfoPrimaryButton>
          }
        />

        <div className="mt-8 space-y-4">
          {loadingReports ? (
            <InfoPanel>
              <div className="p-8 text-center text-slate-400">加载中...</div>
            </InfoPanel>
          ) : reports.length === 0 ? (
            <InfoPanel>
              <div className="p-8 text-center text-slate-400">暂无崩溃报告</div>
            </InfoPanel>
          ) : (
            reports.map((report) => {
              const expanded = expandedReportId === report.reportId;
              return (
                <InfoPanel key={report.reportId} compact>
                  <button
                    type="button"
                    onClick={() => setExpandedReportId(expanded ? null : report.reportId)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            {report.exceptionType || 'Unknown'}
                          </span>
                          {report.kind ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {report.kind}
                            </span>
                          ) : null}
                          <span className="text-xs text-slate-400">
                            <FaClock className="mr-1 inline" />
                            {report.crashedAtText || formatTime(new Date(report.crashedAtMillis).toISOString())}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-800">
                          {report.rootCause || '未知原因'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        {expanded ? <FaChevronUp /> : <FaChevronDown />}
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-xs"
                    >
                      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                        <DetailField label="报告 ID" value={report.reportId} />
                        <DetailField label="异常类型" value={report.exceptionType} />
                        <DetailField label="种类" value={report.kind} />
                        <DetailField label="线程" value={report.threadName} />
                        <DetailField label="进程" value={report.processName} />
                        <DetailField label="包名" value={report.packageName} />
                        <DetailField label="版本号" value={String(report.versionCode)} />
                        <DetailField label="设备 ID" value={report.deviceInstallationId} />
                        <DetailField label="作者" value={report.authorName} />
                        <DetailField label="作者指纹" value={report.authorFingerprint} />
                        <DetailField label="耗时" value={report.durationMillis ? `${report.durationMillis}ms` : '-'} />
                        <DetailField label="崩溃时间" value={report.crashedAtText} />
                      </div>

                      {report.rootCause ? (
                        <div>
                          <span className="text-slate-500">根因：</span>
                          <span className="text-slate-700">{report.rootCause}</span>
                        </div>
                      ) : null}

                      {report.stackTrace ? (
                        <CollapsibleBlock label="堆栈跟踪" value={report.stackTrace} />
                      ) : null}

                      {report.systemInfo ? (
                        <CollapsibleBlock label="系统信息" value={report.systemInfo} />
                      ) : null}

                      {report.recentEvents && report.recentEvents.length > 0 ? (
                        <div>
                          <span className="text-slate-500">最近事件：</span>
                          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
                            {report.recentEvents.map((event, i) => (
                              <li key={i} className="break-all">{event}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}
                </InfoPanel>
              );
            })
          )}
        </div>
      </InfoQueryShell>
    );
  }

  // ── List view ──
  return (
    <InfoQueryShell>
      <InfoQueryHero
        eyebrow="崩溃报告"
        title="Lumen 崩溃报告"
        description="查看来自 Lumen 应用的崩溃报告聚合数据，点击分组查看详细报告。"
        icon={FaBug}
        actions={
          <InfoPrimaryButton onClick={refresh}>
            <FaSync className={loading ? 'animate-spin' : ''} /> 刷新
          </InfoPrimaryButton>
        }
      />

      <div className="mt-8 space-y-4">
        {loading ? (
          <InfoPanel>
            <div className="p-8 text-center text-slate-400">加载中...</div>
          </InfoPanel>
        ) : groups.length === 0 ? (
          <InfoPanel>
            <div className="p-8 text-center text-slate-400">暂无崩溃报告</div>
          </InfoPanel>
        ) : (
          groups.map((group) => {
            const riskConfig = RISK_CONFIG[group.risk] || RISK_CONFIG.low;
            const expanded = expandedGroupKey === group.groupKey;

            return (
              <InfoPanel key={group.groupKey} compact>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${riskConfig.badgeClass}`}>
                        <span className={`h-2 w-2 rounded-full ${riskConfig.dotClass}`} />
                        {riskConfig.label}
                      </span>
                      <InfoBadge>{group.count} 次</InfoBadge>
                      <InfoBadge>{group.affectedUsers} 用户</InfoBadge>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        v{group.versionCode}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      <FaClock className="mr-1 inline" />
                      {formatTime(group.lastSeenAt)}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goToDetail(group.groupKey)}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      查看详情
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedGroupKey(expanded ? null : group.groupKey)}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-500 transition hover:border-slate-300"
                    >
                      {expanded ? <FaChevronUp /> : <FaChevronDown />}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 border-t border-slate-100 pt-4"
                  >
                    {group.cleanStack && group.cleanStack.length > 0 ? (
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          堆栈摘要
                        </span>
                        <pre className="mt-2 max-h-48 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-white/80 p-3 text-xs backdrop-blur-xl">
                          {group.cleanStack.join('\n')}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">无堆栈摘要</div>
                    )}
                  </motion.div>
                ) : null}
              </InfoPanel>
            );
          })
        )}
      </div>

      {total > PAGE_SIZE ? (
        <div className="mt-6 flex flex-col items-center justify-between gap-2 text-xs text-slate-500 sm:flex-row sm:text-sm">
          <span>
            共 {total.toLocaleString()} 个崩溃组，第 {currentPage}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={offset <= 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              className="rounded-2xl border border-slate-200 bg-white/80 px-2 py-1 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <FaChevronLeft />
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              className="rounded-2xl border border-slate-200 bg-white/80 px-2 py-1 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      ) : null}
    </InfoQueryShell>
  );
};

const DetailField: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="min-w-0">
      <span className="text-slate-500">{label}：</span>
      <span className="break-all text-slate-700">{value}</span>
    </div>
  );
};

const CollapsibleBlock: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-700"
      >
        {open ? <FaChevronUp /> : <FaChevronDown />}
        {label}
      </button>
      {open ? (
        <pre className="mt-1 max-h-64 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-white/80 p-3 text-xs backdrop-blur-xl">
          {value}
        </pre>
      ) : null}
    </div>
  );
};

export default CrashReportManager;