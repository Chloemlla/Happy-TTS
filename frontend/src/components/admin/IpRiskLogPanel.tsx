import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaDatabase,
  FaExclamationTriangle,
  FaKey,
  FaListUl,
  FaShieldAlt,
  FaSlidersH,
  FaSync,
} from 'react-icons/fa';
import { ipRiskLogsApi, type ProxycheckOverviewResponse } from '@/api/ipRiskLogs';
import { InfoBadge, InfoMetricCard, InfoPanel, InfoQueryHero, InfoQueryShell } from '@/components/studioTheme';
import { useNotification } from '@/components/Notification';
import { cn } from '@/lib/utils';
import { getBackendErrorMessage } from '@/utils/backendError';
import { AUTO_REFRESH_OPTIONS, formatCount, formatRelativeTime, switchBadge } from './ip-risk-log/format';
import { Badge, Collapsible, DecisionLegend, FilterSelect } from './ip-risk-log/ui';
import LookupsTab from './ip-risk-log/LookupsTab';
import OverviewTab from './ip-risk-log/OverviewTab';
import ProbesTab from './ip-risk-log/ProbesTab';
import QuotasTab from './ip-risk-log/QuotasTab';
import RiskCacheTab from './ip-risk-log/RiskCacheTab';

type TabKey = 'overview' | 'lookups' | 'risk-cache' | 'probes' | 'quotas';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: React.ReactNode; hint: string }> = [
  { key: 'overview', label: '概览', icon: <FaSlidersH />, hint: '配置 / 集合 / 配额 / 计数' },
  { key: 'lookups', label: 'API 请求日志', icon: <FaListUl />, hint: 'proxycheck_lookup_logs' },
  { key: 'risk-cache', label: '风险缓存', icon: <FaDatabase />, hint: 'proxycheck_risk_cache' },
  { key: 'probes', label: '探测上报', icon: <FaShieldAlt />, hint: 'proxycheck_probe_reports' },
  { key: 'quotas', label: '每日配额', icon: <FaKey />, hint: 'proxycheck_daily_quotas' },
];

const IpRiskLogPanel: React.FC = () => {
  const { setNotification } = useNotification();

  const [tab, setTab] = useState<TabKey>('overview');
  const [autoRefreshMs, setAutoRefreshMs] = useState(0);
  /** 每次自动/手动刷新自增，tabs 依赖它重新拉取自己的数据。 */
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [overview, setOverview] = useState<ProxycheckOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const overviewRequestRef = useRef(0);
  const lastNoticeRef = useRef<string | null>(null);

  const loadOverview = useCallback(async () => {
    const requestId = ++overviewRequestRef.current;
    setOverviewLoading(true);
    try {
      const res = await ipRiskLogsApi.overview();
      if (requestId !== overviewRequestRef.current) return;
      setOverview(res);
      setOverviewError(null);
      setLastUpdatedAt(Date.now());
      lastNoticeRef.current = null;
    } catch (error) {
      if (requestId !== overviewRequestRef.current) return;
      const message = getBackendErrorMessage(error, '加载 proxycheck 概览失败');
      setOverviewError(message);
      // 自动刷新失败时不重复弹同一个错误，避免通知风暴。
      if (lastNoticeRef.current !== message) {
        lastNoticeRef.current = message;
        setNotification({ message, type: 'error' });
      }
    } finally {
      if (requestId === overviewRequestRef.current) setOverviewLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, refreshNonce]);

  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    // 显式声明为 number：本仓 CI 把 ReturnType<typeof window.setTimeout> 解析成 DOM Timeout。
    const timer: number = window.setInterval(() => {
      setRefreshNonce((current) => current + 1);
    }, autoRefreshMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshMs]);

  const refreshAll = useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  const counts = overview?.counts;
  const config = overview?.setting.config;
  const quota = overview?.quota;

  return (
    <InfoQueryShell maxWidthClassName="max-w-7xl">
      <InfoQueryHero
        eyebrow="IP 风险检测"
        title="proxycheck.io 详细日志"
        description="把 proxycheck.io 集成的一切摊开：上游 API 请求日志、四个集合的已有内容、每一次交给前端的决策。决策字段（caller / action / shouldChallenge / reason / threshold / failOpen / closedOnFailure）都来自后端的同一个 buildIpRiskDecision 函数，与真正回给前端的判据同源。"
        icon={FaShieldAlt}
        tone="violet"
        meta={
          <>
            {config ? <Badge style={switchBadge(config.enabled)} /> : null}
            <InfoBadge>{lastUpdatedAt ? `概览更新于 ${formatRelativeTime(lastUpdatedAt)}` : '概览尚未加载'}</InfoBadge>
            <InfoBadge>本页全部只读</InfoBadge>
            {overviewError ? (
              <InfoBadge tone="rose">
                <FaExclamationTriangle className="mr-1 inline" />
                概览读取失败
              </InfoBadge>
            ) : null}
          </>
        }
        actions={
          <>
            <FilterSelect
              title="自动刷新间隔"
              value={autoRefreshMs}
              options={AUTO_REFRESH_OPTIONS}
              onChange={(value) => setAutoRefreshMs(Number(value))}
            />
            <button
              type="button"
              onClick={refreshAll}
              disabled={overviewLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <FaSync className={cn(overviewLoading && 'animate-spin')} /> 刷新全部
            </button>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoMetricCard
          label="上游请求日志"
          value={counts ? formatCount(counts.lookupLogs) : '—'}
          detail={counts ? `24 小时内 ${formatCount(counts.lookupLogs24h)} 条` : '等待概览'}
          icon={FaListUl}
          tone="sky"
        />
        <InfoMetricCard
          label="风险缓存生效中"
          value={counts ? formatCount(counts.riskCacheActive) : '—'}
          detail={counts ? `缓存合计 ${formatCount(counts.riskCache)} 条` : '等待概览'}
          icon={FaDatabase}
          tone="teal"
        />
        <InfoMetricCard
          label="探测上报"
          value={counts ? formatCount(counts.probeReports) : '—'}
          detail={counts ? `24 小时内 ${formatCount(counts.probeReports24h)} 条` : '等待概览'}
          icon={FaShieldAlt}
          tone="violet"
        />
        <InfoMetricCard
          label="今日配额"
          value={quota ? `${formatCount(quota.count)} / ${formatCount(quota.limit)}` : '—'}
          detail={
            quota
              ? `${quota.dayKey}${quota.exhausted ? ' · 已用尽' : ''}`
              : '等待概览'
          }
          icon={FaKey}
          tone={quota?.exhausted ? 'rose' : 'slate'}
        />
      </div>

      <InfoPanel className="mt-6" compact>
        <Collapsible
          title="决策语义说明（务必先读）"
          subtitle="action 五值含义 · report 只上报不拦截 · 缓存行决策是重算而非历史记录"
          defaultOpen
        >
          <DecisionLegend />
        </Collapsible>
      </InfoPanel>

      <div className="mt-4 flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 p-1.5">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.hint}
            onClick={() => setTab(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition',
              tab === item.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' ? (
          <OverviewTab
            overview={overview}
            loading={overviewLoading}
            error={overviewError}
            onRefresh={loadOverview}
          />
        ) : null}
        {tab === 'lookups' ? <LookupsTab refreshNonce={refreshNonce} /> : null}
        {tab === 'risk-cache' ? <RiskCacheTab refreshNonce={refreshNonce} /> : null}
        {tab === 'probes' ? <ProbesTab refreshNonce={refreshNonce} /> : null}
        {tab === 'quotas' ? (
          <QuotasTab
            refreshNonce={refreshNonce}
            configuredDailyQuota={config ? config.dailyQuotaPerKey : null}
          />
        ) : null}
      </div>
    </InfoQueryShell>
  );
};

export default IpRiskLogPanel;
