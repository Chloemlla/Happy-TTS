import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaExclamationTriangle,
  FaListUl,
  FaProjectDiagram,
  FaRoute,
  FaShieldAlt,
  FaSync,
} from 'react-icons/fa';
import {
  mobileTokenApi,
  type LineageResponse,
  type OverviewResponse,
  type ReuseResponse,
  type TokenGenerationRow,
} from '@/api/mobileTokenLineage';
import { useNotification } from '@/components/Notification';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
} from '@/components/studioTheme';
import { cn } from '@/lib/utils';
import { getBackendErrorMessage } from '@/utils/backendError';
import {
  AUTO_REFRESH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  type BadgeStyle,
  formatCount,
} from './ip-risk-log/format';
import {
  Badge,
  FilterSelect,
  Pager,
  RefreshButton,
  SectionNote,
  TableState,
  TableWrap,
  Td,
  Th,
  useErrorNotice,
} from './ip-risk-log/ui';

/**
 * 客户端登录令牌（sml_）血缘只读面板：概览计数 + 复用断链看板 + 按血缘/用户查代次。
 * 策略正文见服务端 docs/mobile-token-risk-control.md §3～§5；本页只读，数据全部经服务端掩码。
 */

type TabKey = 'overview' | 'reuse' | 'lineage';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: React.ReactNode; hint: string }> = [
  { key: 'overview', label: '概览', icon: <FaShieldAlt />, hint: '总量 / 生效中 / 复用断链计数' },
  { key: 'reuse', label: '复用断链看板', icon: <FaExclamationTriangle />, hint: 'MOBILE_TOKEN_REUSED 事件' },
  { key: 'lineage', label: '血缘时间线', icon: <FaRoute />, hint: '按 lineageId / userId 查代次' },
];

const CURRENT_BADGE: BadgeStyle = {
  label: '当前在用',
  badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  dotClass: 'bg-emerald-500',
};
const SUPERSEDED_BADGE: BadgeStyle = {
  label: '已顶替',
  badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
  dotClass: 'bg-slate-400',
};
const REVOKED_BADGE: BadgeStyle = {
  label: '已撤销',
  badgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
  dotClass: 'bg-orange-500',
};
const REUSED_BADGE: BadgeStyle = {
  label: '复用断链',
  badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  dotClass: 'bg-rose-500',
};
const EXPIRED_BADGE: BadgeStyle = {
  label: '已过期',
  badgeClass: 'border-slate-200 bg-slate-100 text-slate-500',
  dotClass: 'bg-slate-400',
};

const SIGNAL_LABELS: Record<string, string> = {
  GEO_JUMP: '属地突变',
  VERIFICATION_PENDING: '设备校验未过',
  NEW_DEVICE: '新设备',
};

/** 一代令牌的状态徽标：复用 > 撤销 > 顶替 > 在用 > 过期（先出事者优先）。 */
const generationBadge = (row: TokenGenerationRow): BadgeStyle => {
  if (row.reusedAt) return REUSED_BADGE;
  if (row.revokedAt) return REVOKED_BADGE;
  if (row.current) return CURRENT_BADGE;
  if (row.supersededAt) return SUPERSEDED_BADGE;
  return EXPIRED_BADGE;
};

const formatIso = (value: string | null): string =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';

const Mono: React.FC<{ value: string | null | undefined; title?: string }> = ({ value, title }) => (
  <span className="font-mono text-[11px] text-slate-500" title={title ?? value ?? undefined}>
    {value || '-'}
  </span>
);

const DeviceCell: React.FC<{ row: { deviceId: string | null; deviceName: string | null } }> = ({ row }) => (
  <div className="min-w-0">
    <div className="truncate text-slate-700">{row.deviceName || '（未上报设备名）'}</div>
    <Mono value={row.deviceId} title="设备标识（掩码）" />
  </div>
);

const RiskSignalsCell: React.FC<{ signals: string[] }> = ({ signals }) => {
  if (signals.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <span
          key={signal}
          className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
        >
          {SIGNAL_LABELS[signal] ?? signal}
        </span>
      ))}
    </span>
  );
};

const OverviewTab: React.FC<{
  overview: OverviewResponse | null;
  loading: boolean;
  error: string | null;
}> = ({ overview, loading, error }) => {
  const counts = overview?.counts;
  return (
    <div className="space-y-5">
      <SectionNote>
        {loading && !overview
          ? '正在读取令牌血缘统计……'
          : '这里的「代」= 一次签发或轮换产生的 sml_ 令牌；一张令牌被下一张顶替后进入 5 分钟在途宽限，宽限期后被再次使用即触发整链吊销，并计入下方复用事件。'}
      </SectionNote>
      {error ? (
        <InfoPanel compact>
          <div className="px-4 py-3 text-sm text-rose-600">{error}</div>
        </InfoPanel>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoMetricCard
          label="令牌总量（含历史代）"
          value={counts ? formatCount(counts.totalTokens) : '—'}
          detail={counts ? `血缘 ${formatCount(counts.lineages)} 条` : '等待概览'}
          icon={FaListUl}
          tone="sky"
        />
        <InfoMetricCard
          label="当前生效中"
          value={counts ? formatCount(counts.activeTokens) : '—'}
          detail={counts ? `被顶替 ${formatCount(counts.supersededTokens)} 张` : '等待概览'}
          icon={FaProjectDiagram}
          tone="teal"
        />
        <InfoMetricCard
          label="已撤销"
          value={counts ? formatCount(counts.revokedTokens) : '—'}
          detail="含整链吊销与用户/管理员主动撤销"
          icon={FaShieldAlt}
          tone="violet"
        />
        <InfoMetricCard
          label="复用断链事件"
          value={counts ? formatCount(counts.reuseTotal) : '—'}
          detail={counts ? `24 小时内 ${formatCount(counts.reuse24h)} 起` : '等待概览'}
          icon={FaExclamationTriangle}
          tone={counts && counts.reuse24h > 0 ? 'rose' : 'slate'}
        />
      </div>
      <InfoPanel compact>
        <div className="px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">最近复用事件</div>
        </div>
        <TableWrap minWidth="min-w-[760px]">
          <thead>
            <tr>
              <Th>用户 ID</Th>
              <Th>血缘（掩码）</Th>
              <Th>代次</Th>
              <Th>设备</Th>
              <Th>复用时间</Th>
              <Th>来源 IP（掩码）</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(overview?.recentReuse ?? []).map((event, index) => (
              <tr key={`${event.userId}-${event.lineageId}-${index}`}>
                <Td>
                  <Mono value={event.userId} />
                </Td>
                <Td>
                  <Mono value={event.lineageId} />
                </Td>
                <Td>第 {event.rotationIndex} 代</Td>
                <Td>
                  <DeviceCell row={event} />
                </Td>
                <Td className="whitespace-nowrap text-slate-700">{formatIso(event.reusedAt)}</Td>
                <Td>
                  <Mono value={event.reusedIp} />
                </Td>
              </tr>
            ))}
            {overview && overview.recentReuse.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  尚无复用断链事件 —— 这是好消息。
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      </InfoPanel>
    </div>
  );
};

const ReuseTab: React.FC<{ refreshNonce: number }> = ({ refreshNonce }) => {
  const reportError = useErrorNotice();
  const [userIdDraft, setUserIdDraft] = useState('');
  const [userId, setUserId] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE_OPTIONS[1] ?? 50);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ReuseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const res = await mobileTokenApi.reuse({ userId: userId || undefined, limit, offset });
      if (requestId !== requestRef.current) return;
      setData(res);
      setError(null);
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      const message = getBackendErrorMessage(caught, '加载复用断链事件失败');
      setError(message);
      reportError(message);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [limit, offset, reportError, userId]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  return (
    <div className="space-y-4">
      <SectionNote>
        每一行对应一次「旧代令牌超宽限期后被再次使用」：整条血缘已当场吊销，用户需要重新登录。
        真机轮换后本地整体覆盖旧值，旧值再出现基本只有「被复制」一种解释 —— 数量异常上涨时优先排查泄露渠道（日志、备份、剪贴板）。
      </SectionNote>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={userIdDraft}
          onChange={(event) => setUserIdDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setUserId(userIdDraft.trim());
              setOffset(0);
            }
          }}
          placeholder="按用户 ID 过滤（可选）"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-300 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => {
            setUserId(userIdDraft.trim());
            setOffset(0);
          }}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          查询
        </button>
        {userId ? (
          <button
            type="button"
            onClick={() => {
              setUserId('');
              setUserIdDraft('');
              setOffset(0);
            }}
            className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
          >
            清除过滤
          </button>
        ) : null}
        <FilterSelect
          title="每页条数"
          value={limit}
          options={PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: `每页 ${size} 条` }))}
          onChange={(value) => {
            setLimit(Number(value));
            setOffset(0);
          }}
        />
        <RefreshButton onClick={() => void load()} loading={loading} />
      </div>
      <InfoPanel compact>
        <TableWrap minWidth="min-w-[980px]">
          <thead>
            <tr>
              <Th>复用时间</Th>
              <Th>用户 ID</Th>
              <Th>血缘（掩码）</Th>
              <Th>触发代次</Th>
              <Th>设备</Th>
              <Th>被顶替时间</Th>
              <Th>来源 IP（掩码）</Th>
              <Th>该代风险信号</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <TableState
              loading={loading}
              error={error}
              empty={(data?.events.length ?? 0) === 0}
              emptyText={userId ? '该用户没有复用断链记录。' : '尚无复用断链事件。'}
              colSpan={8}
            />
            {(data?.events ?? []).map((event, index) => (
              <tr key={`${event.userId}-${event.tokenHash ?? event.lineageId}-${index}`}>
                <Td className="whitespace-nowrap text-slate-700">{formatIso(event.reusedAt)}</Td>
                <Td>
                  <Mono value={event.userId} />
                </Td>
                <Td>
                  <Mono value={event.lineageId} />
                </Td>
                <Td>第 {event.rotationIndex} 代</Td>
                <Td>
                  <DeviceCell row={event} />
                </Td>
                <Td className="whitespace-nowrap">{formatIso(event.supersededAt ?? null)}</Td>
                <Td>
                  <Mono value={event.reusedIp} />
                </Td>
                <Td>
                  <RiskSignalsCell signals={event.riskSignals ?? []} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {data && data.total > 0 ? (
          <Pager
            total={data.total}
            limit={data.limit}
            offset={data.offset}
            loading={loading}
            onChange={setOffset}
          />
        ) : null}
      </InfoPanel>
    </div>
  );
};

const LineageTab: React.FC = () => {
  const reportError = useErrorNotice();
  const [lineageDraft, setLineageDraft] = useState('');
  const [userDraft, setUserDraft] = useState('');
  const [query, setQuery] = useState<{ lineageId: string; userId: string } | null>(null);
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const search = useCallback(async () => {
    const lineageId = lineageDraft.trim();
    const userId = userDraft.trim();
    if (!lineageId && !userId) {
      setError('先填一个血缘 ID 或用户 ID。');
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setQuery({ lineageId, userId });
    try {
      const res = await mobileTokenApi.lineage({
        lineageId: lineageId || undefined,
        userId: userId || undefined,
      });
      if (requestId !== requestRef.current) return;
      setData(res);
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      const message = getBackendErrorMessage(caught, '加载血缘时间线失败');
      setError(message);
      reportError(message);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [lineageDraft, reportError, userDraft]);

  return (
    <div className="space-y-4">
      <SectionNote>
        血缘 ID 与令牌 hash 同源，只在服务端以 SHA-256 形态存在；面板里的所有标识均已掩码，无法反推令牌明文。
        按用户 ID 查询时列出该用户全部血缘的代次（按签发时间升序截断到 500 条）。
      </SectionNote>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={lineageDraft}
          onChange={(event) => setLineageDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="血缘 ID（lineageId）"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 font-mono text-xs text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-300 sm:max-w-sm"
        />
        <input
          type="text"
          value={userDraft}
          onChange={(event) => setUserDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="或 用户 ID"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 font-mono text-xs text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-300 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <FaRoute /> {loading ? '查询中…' : '查时间线'}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-700">{error}</div>
      ) : null}

      {query && data ? (
        <InfoPanel compact>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-xs font-semibold text-slate-600">
              共 {formatCount(data.total)} 代
              {data.filters.lineageId ? ` · 血缘 ${data.filters.lineageId}` : ''}
              {data.filters.userId ? ` · 用户 ${data.filters.userId}` : ''}
            </span>
            {data.truncated ? (
              <InfoBadge tone="amber" className="text-[10px]">
                超过 500 代，已截断
              </InfoBadge>
            ) : null}
          </div>
          <TableWrap minWidth="min-w-[1080px]">
            <thead>
              <tr>
                <Th>代次</Th>
                <Th>状态</Th>
                <Th>签发时间</Th>
                <Th>过期时间</Th>
                <Th>最近活动属地</Th>
                <Th>设备</Th>
                <Th>顶替时间</Th>
                <Th>轮换 IP（掩码）</Th>
                <Th>风险信号</Th>
                <Th>令牌 hash（掩码）</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.generations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    这条查询没有返回代次记录。
                  </td>
                </tr>
              ) : null}
              {data.generations.map((row, index) => (
                <tr key={`${row.tokenHash}-${index}`} className={cn(row.current && 'bg-emerald-50/40')}>
                  <Td>第 {row.rotationIndex} 代</Td>
                  <Td>
                    <Badge style={generationBadge(row)} />
                    {row.verificationPending ? (
                      <div className="mt-1">
                        <InfoBadge tone="amber" className="text-[10px]">
                          待重新校验
                        </InfoBadge>
                      </div>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{formatIso(row.createdAt)}</Td>
                  <Td className="whitespace-nowrap">{formatIso(row.expiresAt)}</Td>
                  <Td className="text-slate-600">{row.ipLocation || '-'}</Td>
                  <Td>
                    <DeviceCell row={row} />
                  </Td>
                  <Td className="whitespace-nowrap">{formatIso(row.supersededAt)}</Td>
                  <Td>
                    <Mono value={row.rotatedIp} />
                  </Td>
                  <Td>
                    <RiskSignalsCell signals={row.riskSignals} />
                  </Td>
                  <Td>
                    <Mono value={row.tokenHash} title={`上一代 ${row.rotatedFrom ?? '-'}`} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </InfoPanel>
      ) : (
        <InfoPanel compact>
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            输入血缘 ID 或用户 ID 后，这里会按时间顺序列出每一代令牌的签发、顶替与撤销轨迹。
          </div>
        </InfoPanel>
      )}
    </div>
  );
};

const MobileTokenLineagePanel: React.FC = () => {
  const { setNotification } = useNotification();

  const [tab, setTab] = useState<TabKey>('overview');
  const [autoRefreshMs, setAutoRefreshMs] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const overviewRequestRef = useRef(0);
  const lastNoticeRef = useRef<string | null>(null);

  const loadOverview = useCallback(async () => {
    const requestId = ++overviewRequestRef.current;
    setOverviewLoading(true);
    try {
      const res = await mobileTokenApi.overview();
      if (requestId !== overviewRequestRef.current) return;
      setOverview(res);
      setOverviewError(null);
      setLastUpdatedAt(Date.now());
      lastNoticeRef.current = null;
    } catch (error) {
      if (requestId !== overviewRequestRef.current) return;
      const message = getBackendErrorMessage(error, '加载令牌血缘概览失败');
      setOverviewError(message);
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
    const timer: number = window.setInterval(() => {
      setRefreshNonce((current) => current + 1);
    }, autoRefreshMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshMs]);

  return (
    <InfoQueryShell maxWidthClassName="max-w-7xl">
      <InfoQueryHero
        eyebrow="移动端登录态风控"
        title="客户端登录令牌血缘"
        description={
          'sml_ 令牌的代际轨迹一目了然：一条血缘如何一天天推进、哪些旧代超宽限期被重放触发了整链吊销、每个用户/设备签到了第几代。本页全部只读，标识与 IP 均为服务端掩码值。'
        }
        icon={FaShieldAlt}
        tone="violet"
        meta={
          <>
            <InfoBadge>{lastUpdatedAt ? `概览更新于 ${new Date(lastUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '概览尚未加载'}</InfoBadge>
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
              onClick={() => setRefreshNonce((current) => current + 1)}
              disabled={overviewLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <FaSync className={cn(overviewLoading && 'animate-spin')} /> 刷新全部
            </button>
          </>
        }
      />

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
          <OverviewTab overview={overview} loading={overviewLoading} error={overviewError} />
        ) : null}
        {tab === 'reuse' ? <ReuseTab refreshNonce={refreshNonce} /> : null}
        {tab === 'lineage' ? <LineageTab /> : null}
      </div>
    </InfoQueryShell>
  );
};

export default MobileTokenLineagePanel;
