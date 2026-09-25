import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaAngleDoubleDown, FaAngleDoubleUp, FaExclamationTriangle, FaListUl, FaTimes } from 'react-icons/fa';
import {
  ipRiskLogsApi,
  type LookupStatusFilter,
  type ProxycheckLookupLogRow,
  type TriStateFilter,
} from '@/api/ipRiskLogs';
import { InfoPanel, InfoSectionTitle } from '@/components/InfoQueryScaffold';
import { studioFieldClassName } from '@/components/studioTheme';
import { getBackendErrorMessage } from '@/utils/backendError';
import {
  ACTION_CONFIG,
  CALLER_LABELS,
  DEFAULT_PAGE_SIZE,
  LOOKUP_STATUS_OPTIONS,
  PAGE_SIZE_OPTIONS,
  boolLabel,
  formatCount,
  formatDurationMs,
  lookupStatusStyle,
} from './format';
import {
  Badge,
  Chip,
  DataPanel,
  DecisionBlock,
  FilterSelect,
  HashCell,
  IpCell,
  JsonBlock,
  Pager,
  RefreshButton,
  SectionNote,
  TableState,
  TableWrap,
  Td,
  Th,
  TimeCell,
  useErrorNotice,
} from './ui';

interface Props {
  refreshNonce: number;
}

const OK_OPTIONS: ReadonlyArray<{ value: TriStateFilter; label: string }> = [
  { value: '', label: 'ok：全部' },
  { value: 'true', label: 'ok：仅成功' },
  { value: 'false', label: 'ok：仅失败' },
];

const DEDUPED_OPTIONS: ReadonlyArray<{ value: TriStateFilter; label: string }> = [
  { value: '', label: 'deduped：全部' },
  { value: 'true', label: 'deduped：仅合并命中' },
  { value: 'false', label: 'deduped：仅非合并' },
];

const LookupsTab: React.FC<Props> = ({ refreshNonce }) => {
  const notice = useErrorNotice();

  const [draftIp, setDraftIp] = useState('');
  const [ip, setIp] = useState('');
  const [status, setStatus] = useState<LookupStatusFilter>('');
  const [ok, setOk] = useState<TriStateFilter>('');
  const [deduped, setDeduped] = useState<TriStateFilter>('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [manualNonce, setManualNonce] = useState(0);

  const [rows, setRows] = useState<ProxycheckLookupLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    void (async () => {
      try {
        const res = await ipRiskLogsApi.lookups({
          limit: pageSize,
          offset,
          ip: ip || undefined,
          status: status || undefined,
          ok: ok || undefined,
          deduped: deduped || undefined,
        });
        if (requestId !== requestRef.current) return;
        setRows(res.logs ?? []);
        setTotal(res.total ?? 0);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        const message = getBackendErrorMessage(err, '加载上游请求日志失败');
        setError(message);
        notice(message);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
  }, [pageSize, offset, ip, status, ok, deduped, refreshNonce, manualNonce, notice]);

  const toggle = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const rowKey = (row: ProxycheckLookupLogRow, index: number): string => row._id || `${row.createdAt}-${index}`;
  const allExpanded = rows.length > 0 && rows.every((row, index) => expanded.has(rowKey(row, index)));

  const applyIp = () => {
    setIp(draftIp.trim());
    setOffset(0);
  };

  const resetFilters = () => {
    setDraftIp('');
    setIp('');
    setStatus('');
    setOk('');
    setDeduped('');
    setOffset(0);
  };

  const hasFilters = Boolean(ip || status || ok || deduped);

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="上游 API 请求日志"
        description="集合 proxycheck_lookup_logs 的内容，每次真的向上游 proxycheck.io 发起查询（或判定为未配置/配额用尽/上游失败/in-flight 合并）都会留一行。"
        icon={FaListUl}
        eyebrow="§2.2 lookups"
        action={<RefreshButton onClick={() => setManualNonce((current) => current + 1)} loading={loading} />}
      />

      <SectionNote>
        写入点：<code>src/services/ipRiskService.ts</code> 的 <code>logLookup</code>。
        每条记录都带一份 <code>decision</code>：这是当时真实算给前端的决策快照。
        <br />
        注意两条<span className="font-semibold">不会</span>出现在这里的情况：命中 <code>proxycheck_risk_cache</code> 时零上游、零写入（要看命中情况请去「风险缓存」页）；
        本面板上线之前写入的旧行没有 <code>decision</code> 字段，会显式标注为「旧数据」。
      </SectionNote>

      <InfoPanel compact>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <input
              value={draftIp}
              onChange={(event) => setDraftIp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyIp();
                if (event.key === 'Escape') {
                  setDraftIp('');
                  setIp('');
                  setOffset(0);
                }
              }}
              placeholder="按 IP 前缀筛选（最长 45 字符，回车立即查询）"
              aria-label="按 IP 前缀筛选"
              className={studioFieldClassName}
            />
            {draftIp ? (
              <button
                type="button"
                onClick={() => setDraftIp('')}
                title="清空输入"
                aria-label="清空输入"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <FaTimes />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              title="按 status 筛选"
              value={status}
              options={LOOKUP_STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value as LookupStatusFilter);
                setOffset(0);
              }}
            />
            <FilterSelect
              title="按 ok 筛选"
              value={ok}
              options={OK_OPTIONS}
              onChange={(value) => {
                setOk(value as TriStateFilter);
                setOffset(0);
              }}
            />
            <FilterSelect
              title="按 deduped 筛选"
              value={deduped}
              options={DEDUPED_OPTIONS}
              onChange={(value) => {
                setDeduped(value as TriStateFilter);
                setOffset(0);
              }}
            />
            <FilterSelect
              title="每页条数"
              value={pageSize}
              options={PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: `每页 ${size} 条` }))}
              onChange={(value) => {
                setPageSize(Number(value));
                setOffset(0);
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip active={!hasFilters} label="重置筛选" onClick={resetFilters} title="清空全部筛选条件" />
          {ip ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              IP 前缀 <span className="font-mono">{ip}</span>
              <button
                type="button"
                onClick={() => {
                  setDraftIp('');
                  setIp('');
                  setOffset(0);
                }}
                title="清除 IP 筛选"
                aria-label="清除 IP 筛选"
                className="rounded-lg p-0.5 transition hover:bg-indigo-100"
              >
                <FaTimes />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setExpanded(allExpanded ? new Set() : new Set(rows.map((row, index) => rowKey(row, index))))
            }
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
          >
            {allExpanded ? <FaAngleDoubleUp /> : <FaAngleDoubleDown />}
            {allExpanded ? '折叠全部' : '展开全部'}
          </button>
          <span className="text-xs text-slate-500">
            命中 {formatCount(total)} 条{loading ? '（正在刷新…）' : ''}
          </span>
        </div>
      </InfoPanel>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl">
        <TableWrap minWidth="min-w-[1240px]">
          <thead>
            <tr className="border-b border-slate-200">
              <Th>时间</Th>
              <Th>IP</Th>
              <Th>status</Th>
              <Th>ok</Th>
              <Th>risk</Th>
              <Th>deduped</Th>
              <Th>耗时</Th>
              <Th>错误信息</Th>
              <Th>密钥槽 / 哈希</Th>
              <Th>给前端的决策</Th>
              <Th className="text-right">明细</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading && rows.length === 0}
              error={rows.length === 0 ? error : null}
              empty={!loading && rows.length === 0}
              emptyText={hasFilters ? '当前筛选条件下没有上游请求日志' : '还没有任何上游请求日志'}
              colSpan={11}
            />
            {rows.map((row, index) => {
              const key = rowKey(row, index);
              const isOpen = expanded.has(key);
              const statusStyle = lookupStatusStyle(row.status);
              const action = row.decision ? ACTION_CONFIG[row.decision.action] : null;
              return (
                <React.Fragment key={key}>
                  <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <Td>
                      <TimeCell value={row.createdAt} />
                    </Td>
                    <Td>
                      <IpCell ip={row.ip} />
                    </Td>
                    <Td>
                      <Badge style={statusStyle} />
                    </Td>
                    <Td className={row.ok ? 'text-emerald-700' : 'text-rose-600'}>{boolLabel(row.ok)}</Td>
                    <Td className="text-slate-700">{row.risk === null || row.risk === undefined ? '-' : row.risk}</Td>
                    <Td className="text-slate-600">{boolLabel(row.deduped)}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{formatDurationMs(row.durationMs)}</Td>
                    <Td className="max-w-[220px] text-rose-600" >
                      {row.error ? <span className="break-all" title={row.error}>{row.error}</span> : <span className="text-slate-400">-</span>}
                    </Td>
                    <Td>
                      <div className="text-slate-600">slot {row.apiKeySlot}</div>
                      <HashCell hash={row.apiKeyHash} />
                    </Td>
                    <Td>
                      {row.decision ? (
                        <div className="space-y-1">
                          <div className="text-slate-600">{CALLER_LABELS[row.decision.caller] ?? row.decision.caller}</div>
                          {action ? <Badge style={action} title={action.description} /> : null}
                          <div className="text-[11px] text-slate-500">
                            shouldChallenge {boolLabel(row.decision.shouldChallenge)}
                            {row.decision.caller === 'api' ? '（若按闸门判据）' : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">旧数据（无 decision）</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="rounded-xl border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                      >
                        {isOpen ? '收起' : '展开'}
                      </button>
                    </Td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              决策全字段
                            </p>
                            <DecisionBlock
                              decision={row.decision}
                              derived={false}
                              missingText="这条日志写入时还没有 decision 字段（本面板上线前的旧数据），无法还原当时给前端的决策。"
                            />
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              原始 JSON
                            </p>
                            <JsonBlock value={row} />
                            {row.error ? (
                              <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600">
                                <FaExclamationTriangle className="mt-0.5 shrink-0" />
                                <span className="break-all">{row.error}</span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </TableWrap>
        <Pager total={total} limit={pageSize} offset={offset} loading={loading} onChange={setOffset} />
      </div>

      <DataPanel className="border-slate-200 bg-white/60">
        <p className="text-xs leading-6 text-slate-500">
          筛选按服务端执行，作用于整个集合而不只是当前页：<code>ip</code> 是前缀匹配，
          <code>status</code> / <code>ok</code> / <code>deduped</code> 由服务端解析，非法值会被忽略。
          排序固定为 <code>createdAt</code> 倒序。
        </p>
      </DataPanel>
    </div>
  );
};

export default LookupsTab;
