import React, { useEffect, useRef, useState } from 'react';
import { FaCalendarAlt, FaKey } from 'react-icons/fa';
import { ipRiskLogsApi, type ProxycheckQuotaRow } from '@/api/ipRiskLogs';
import { InfoBadge, InfoMetricCard, InfoPanel, InfoSectionTitle } from '@/components/studioTheme';
import { cn } from '@/lib/utils';
import { getBackendErrorMessage } from '@/utils/backendError';
import { DAYS_OPTIONS, boolLabel, formatCount, formatTime } from './format';
import {
  DataPanel,
  FilterSelect,
  HashCell,
  JsonBlock,
  RefreshButton,
  SectionNote,
  TableState,
  TableWrap,
  Td,
  Th,
  useErrorNotice,
} from './ui';

interface Props {
  refreshNonce: number;
  /** 当前配置的每日额度；响应里的 limit 也来自它。 */
  configuredDailyQuota: number | null;
}

const QuotasTab: React.FC<Props> = ({ refreshNonce, configuredDailyQuota }) => {
  const notice = useErrorNotice();

  const [days, setDays] = useState(30);
  const [manualNonce, setManualNonce] = useState(0);

  const [rows, setRows] = useState<ProxycheckQuotaRow[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    void (async () => {
      try {
        const res = await ipRiskLogsApi.quotas(days);
        if (requestId !== requestRef.current) return;
        setRows(res.quotas ?? []);
        setLimit(typeof res.limit === 'number' ? res.limit : null);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        const message = getBackendErrorMessage(err, '加载每日配额失败');
        setError(message);
        notice(message);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
  }, [days, refreshNonce, manualNonce, notice]);

  const effectiveLimit = limit ?? configuredDailyQuota ?? null;
  const totalCount = rows.reduce((sum, row) => sum + (Number.isFinite(row.count) ? row.count : 0), 0);
  const exhaustedDays = rows.filter((row) => row.exhausted).length;

  const rowKey = (row: ProxycheckQuotaRow, index: number): string =>
    `${row.dayKey}-${row.apiKeySlot ?? 0}-${index}`;

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="每日配额"
        description="集合 proxycheck_daily_quotas 的内容，按 {dayKey, apiKeySlot} 唯一。每次真正打到上游才 +1，命中缓存不消耗配额。"
        icon={FaKey}
        eyebrow="§2.4 quotas"
        action={<RefreshButton onClick={() => setManualNonce((current) => current + 1)} loading={loading} />}
      />

      <SectionNote>
        写入点：<code>src/services/ipRiskService.ts</code> 的配额结算（<code>isQuotaExhausted</code> 判闸、<code>incrementQuota</code> 计数）。
        <code>limit</code> 不是历史快照，而是<span className="font-semibold">当前配置</span>的 <code>dailyQuotaPerKey</code> ——
        文档里只记 count 与 exhaustedAt，不记当时的额度上限，所以「使用率」列只能按今天的额度估算。
        <br />
        配额用尽后后端不再外呼，对应日志行的 status 是 <code>quota_exhausted</code>，决策会是
        fail_open / fail_closed（取决于 failOpen）。
      </SectionNote>

      {error ? (
        <InfoPanel compact>
          <div className="text-sm text-rose-600">{error}</div>
        </InfoPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoMetricCard label="查询天数" value={days} detail={`最近 ${days} 天（上限 90）`} icon={FaCalendarAlt} />
        <InfoMetricCard
          label="区间内上游调用"
          value={formatCount(totalCount)}
          detail="所有 key 槽位合计的 count"
          icon={FaKey}
          tone="sky"
        />
        <InfoMetricCard
          label="用尽天数"
          value={formatCount(exhaustedDays)}
          detail={exhaustedDays > 0 ? '这些天当天额度被用完' : '区间内没有用尽过'}
          icon={FaKey}
          tone={exhaustedDays > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <InfoPanel compact>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            title="查询天数"
            value={days}
            options={DAYS_OPTIONS}
            onChange={(value) => setDays(Number(value))}
          />
          <InfoBadge>
            当前每日额度 limit：{effectiveLimit === null ? '未知' : formatCount(effectiveLimit)}
          </InfoBadge>
          <span className="text-xs text-slate-500">
            共 {rows.length} 行{loading ? '（正在刷新…）' : ''}
          </span>
        </div>
      </InfoPanel>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl">
        <TableWrap minWidth="min-w-[1180px]">
          <thead>
            <tr className="border-b border-slate-200">
              <Th>dayKey</Th>
              <Th>apiKeySlot</Th>
              <Th>apiKeyHash</Th>
              <Th>count</Th>
              <Th>使用率（按当前额度）</Th>
              <Th>exhausted</Th>
              <Th>exhaustedAt</Th>
              <Th>lastUsedAt</Th>
              <Th>createdAt / updatedAt</Th>
              <Th className="text-right">明细</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading && rows.length === 0}
              error={rows.length === 0 ? error : null}
              empty={!loading && rows.length === 0}
              emptyText={`最近 ${days} 天没有任何配额记录（一次都没真正打到上游）`}
              colSpan={10}
            />
            {rows.map((row, index) => {
              const key = rowKey(row, index);
              const isOpen = expanded === key;
              const ratio =
                effectiveLimit && effectiveLimit > 0 ? Math.min(1, row.count / effectiveLimit) : null;
              return (
                <React.Fragment key={key}>
                  <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <Td className="font-mono text-slate-700">{row.dayKey}</Td>
                    <Td className="text-slate-600">{row.apiKeySlot}</Td>
                    <Td>
                      <HashCell hash={row.apiKeyHash} />
                    </Td>
                    <Td className="text-slate-700">{formatCount(row.count)}</Td>
                    <Td>
                      {ratio === null ? (
                        <span className="text-slate-400">额度未知</span>
                      ) : (
                        <div className="w-36">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn('h-full rounded-full', row.exhausted ? 'bg-rose-500' : 'bg-emerald-500')}
                              style={{ width: `${Math.round(ratio * 100)}%` }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {formatCount(row.count)} / {formatCount(effectiveLimit)}（{Math.round(ratio * 100)}%）
                          </div>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {row.exhausted ? (
                        <span className="font-semibold text-rose-600">已用尽</span>
                      ) : (
                        <span className="text-slate-500">未用尽</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatTime(row.exhaustedAt)}</Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatTime(row.lastUsedAt)}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      <div>{formatTime(row.createdAt)}</div>
                      <div className="text-slate-400">{formatTime(row.updatedAt)}</div>
                    </Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="rounded-xl border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                      >
                        {isOpen ? '收起' : '展开'}
                      </button>
                    </Td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={10} className="px-4 py-4">
                        <div className="space-y-2" >
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                            <span>
                              dayKey：<span className="font-mono">{row.dayKey}</span>
                            </span>
                            <span>apiKeySlot：{row.apiKeySlot}</span>
                            <span>count：{formatCount(row.count)}</span>
                            <span>exhausted：{boolLabel(row.exhausted)}</span>
                            <span>exhaustedAt：{formatTime(row.exhaustedAt)}</span>
                            <span>lastUsedAt：{formatTime(row.lastUsedAt)}</span>
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">原始 JSON</p>
                          <JsonBlock value={row} className="max-h-64" />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </TableWrap>
      </div>

      <DataPanel className="border-slate-200 bg-white/60">
        <p className="text-xs leading-6 text-slate-500">
          本端点没有分页参数，回传的是最近 <code>days</code> 天内的全部配额文档（上限 90 天）。
          表里排序按服务端返回顺序（dayKey 倒序）。
        </p>
      </DataPanel>
    </div>
  );
};

export default QuotasTab;
