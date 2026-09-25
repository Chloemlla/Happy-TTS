import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaAngleDoubleDown, FaAngleDoubleUp, FaClock, FaDatabase, FaTimes } from 'react-icons/fa';
import { ipRiskLogsApi, type RiskCacheEntry, type RiskCacheState } from '@/api/ipRiskLogs';
import { InfoPanel, InfoSectionTitle, studioFieldClassName } from '@/components/studioTheme';
import { getBackendErrorMessage } from '@/utils/backendError';
import {
  ACTION_CONFIG,
  DETECTION_FLAGS,
  DETECTION_LABELS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  RISK_CACHE_STATE_OPTIONS,
  boolLabel,
  detectionBadge,
  formatCoordinate,
  formatCount,
  formatTime,
  formatTtlRemaining,
  riskLevelStyle,
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

const RiskCacheTab: React.FC<Props> = ({ refreshNonce }) => {
  const notice = useErrorNotice();

  const [draftIp, setDraftIp] = useState('');
  const [ip, setIp] = useState('');
  const [state, setState] = useState<RiskCacheState>('active');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [manualNonce, setManualNonce] = useState(0);

  const [rows, setRows] = useState<RiskCacheEntry[]>([]);
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
        const res = await ipRiskLogsApi.riskCache({
          limit: pageSize,
          offset,
          ip: ip || undefined,
          state,
        });
        if (requestId !== requestRef.current) return;
        setRows(res.entries ?? []);
        setTotal(res.total ?? 0);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        const message = getBackendErrorMessage(err, '加载风险缓存失败');
        setError(message);
        notice(message);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
  }, [pageSize, offset, ip, state, refreshNonce, manualNonce, notice]);

  const toggle = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const rowKey = (row: RiskCacheEntry, index: number): string => row._id || `${row.ip}-${index}`;
  const allExpanded = rows.length > 0 && rows.every((row, index) => expanded.has(rowKey(row, index)));

  const activeCount = rows.filter((row) => !row.expired).length;

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="风险缓存（数据库已有内容）"
        description="集合 proxycheck_risk_cache 的全部文档，每个 IP 一行，expiresAt 到期后由 TTL 索引自动回收。这是「这个 IP 上次查到什么」的唯一留存。"
        icon={FaDatabase}
        eyebrow="§2.3 risk-cache"
        action={<RefreshButton onClick={() => setManualNonce((current) => current + 1)} loading={loading} />}
      />

      <SectionNote>
        写入点：<code>src/services/ipRiskService.ts</code> 的 <code>persistRiskCache</code>（上游查询成功后才写）。
        命中本集合的查询<span className="font-semibold">零上游、零配额</span>，但会往 <code>proxycheck_lookup_logs</code> 写一行
        <code>status=cache</code> 的决策——本页看「上次查到什么」，那一页看「当时怎么判」。
        <br />
        <span className="font-semibold text-amber-800">
          本页每行的决策是按当前配置重算的，不是历史记录
        </span>
        ：缓存文档本身不存决策。重算用的是当下的 <code>challengeRiskScore</code> / <code>failOpen</code>，
        caller 固定按 API 口径（所以 action 恒为「仅上报」）。想看在某个时间点真实给出的决策（包括当时是不是走缓存），请看「判定决策日志」页。
      </SectionNote>

      <InfoPanel compact>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <input
              value={draftIp}
              onChange={(event) => setDraftIp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setIp(draftIp.trim());
                  setOffset(0);
                }
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {RISK_CACHE_STATE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={state === option.value}
              label={option.label}
              title={option.value === 'active' ? 'expiresAt > now 的文档' : option.label}
              onClick={() => {
                setState(option.value as RiskCacheState);
                setOffset(0);
              }}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
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
            命中 {formatCount(total)} 条 · 本页生效中 {activeCount} 条{loading ? '（正在刷新…）' : ''}
          </span>
        </div>
      </InfoPanel>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl">
        <TableWrap minWidth="min-w-[1280px]">
          <thead>
            <tr className="border-b border-slate-200">
              <Th>IP</Th>
              <Th>风险</Th>
              <Th>七项检测</Th>
              <Th>网络</Th>
              <Th>地理位置</Th>
              <Th>查询 / 过期 / 剩余 TTL</Th>
              <Th>状态</Th>
              <Th>决策（按当前配置重算）</Th>
              <Th className="text-right">明细</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading && rows.length === 0}
              error={rows.length === 0 ? error : null}
              empty={!loading && rows.length === 0}
              emptyText={
                ip ? '该 IP 前缀没有缓存文档' : state === 'active' ? '当前没有生效中的缓存文档' : '没有缓存文档'
              }
              colSpan={9}
            />
            {rows.map((row, index) => {
              const key = rowKey(row, index);
              const isOpen = expanded.has(key);
              const decision = row.derivedDecision;
              const action = decision ? ACTION_CONFIG[decision.action] : null;
              return (
                <React.Fragment key={key}>
                  <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <Td>
                      <IpCell ip={row.ip} />
                      <div className="mt-1 text-[11px] text-slate-400">source: {row.source}</div>
                    </Td>
                    <Td>
                      <div className="text-slate-700">{row.risk}</div>
                      <div className="mt-1">
                        <Badge style={riskLevelStyle(decision?.level)} title="由文档里存的 risk 分数换算的等级" />
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">confidence {row.confidence}</div>
                    </Td>
                    <Td>
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {DETECTION_FLAGS.map((flag) => (
                          <Badge
                            key={flag}
                            style={detectionBadge(DETECTION_LABELS[flag], row[flag] === true)}
                            title={`${flag} = ${boolLabel(row[flag] === true)}`}
                          />
                        ))}
                      </div>
                    </Td>
                    <Td className="text-slate-600">
                      <div title={row.networkType}>{row.networkType || '-'}</div>
                      <div className="text-[11px] text-slate-500">ASN {row.asn || '-'}</div>
                      <div className="text-[11px] text-slate-500" title={row.provider}>
                        {row.provider || '-'}
                      </div>
                      <div className="text-[11px] text-slate-400" title={row.organisation}>
                        {row.organisation || '-'}
                      </div>
                    </Td>
                    <Td className="text-slate-600">
                      <div>
                        {[row.country, row.region, row.city].filter(Boolean).join(' / ') || '-'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.continent || '-'} · {row.isocode || '-'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatCoordinate(row.latitude)}, {formatCoordinate(row.longitude)}
                      </div>
                      <div className="text-[11px] text-slate-400">TZ {row.timezone || '-'}</div>
                    </Td>
                    <Td>
                      <TimeCell value={row.queriedAt} />
                      <div className="mt-1 whitespace-nowrap text-[11px] text-slate-500">
                        过期于 {formatTime(row.expiresAt)}
                      </div>
                      <div
                        className={
                          row.expired
                            ? 'text-[11px] font-semibold text-slate-500'
                            : 'text-[11px] font-semibold text-emerald-700'
                        }
                      >
                        <FaClock className="mr-1 inline" />
                        {formatTtlRemaining(row.expiresAt)}
                      </div>
                    </Td>
                    <Td>
                      {row.expired ? (
                        <span className="font-semibold text-slate-500">已过期</span>
                      ) : (
                        <span className="font-semibold text-emerald-700">生效中</span>
                      )}
                    </Td>
                    <Td>
                      {decision && action ? (
                        <div className="space-y-1">
                          <Badge style={action} title={action.description} />
                          <div className="text-[11px] text-slate-500">
                            caller {decision.caller} · shouldChallenge {boolLabel(decision.shouldChallenge)}（若按闸门判据）
                          </div>
                          <div className="text-[11px] text-slate-400">
                            阈值 {decision.threshold} · failOpen {boolLabel(decision.failOpen)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">未回传决策</span>
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
                      <td colSpan={9} className="px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div className="space-y-3">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                文档全部字段
                              </p>
                              <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs">
                                <div className="break-all">
                                  <span className="text-slate-500">ip：</span>
                                  <span className="font-mono text-slate-700">{row.ip}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">risk / confidence：</span>
                                  <span className="text-slate-700">
                                    {row.risk} / {row.confidence}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">七项检测：</span>
                                  <span className="text-slate-700">
                                    {DETECTION_FLAGS.map(
                                      (flag) => `${DETECTION_LABELS[flag]}=${boolLabel(row[flag] === true)}`,
                                    ).join(' · ')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">networkType / provider / asn：</span>
                                  <span className="text-slate-700">
                                    {row.networkType || '-'} / {row.provider || '-'} / {row.asn || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">range / hostname：</span>
                                  <span className="font-mono text-slate-700">
                                    {row.range || '-'} / {row.hostname || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">organisation：</span>
                                  <span className="text-slate-700">{row.organisation || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">continent / country / isocode / region / city：</span>
                                  <span className="text-slate-700">
                                    {[row.continent, row.country, row.isocode, row.region, row.city]
                                      .filter(Boolean)
                                      .join(' / ') || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">latitude / longitude / timezone：</span>
                                  <span className="text-slate-700">
                                    {formatCoordinate(row.latitude)} / {formatCoordinate(row.longitude)} /{' '}
                                    {row.timezone || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">queriedAt：</span>
                                  <span className="text-slate-700">{formatTime(row.queriedAt)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">expiresAt / 剩余 TTL：</span>
                                  <span className="text-slate-700">
                                    {formatTime(row.expiresAt)} / {formatTtlRemaining(row.expiresAt)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">expired：</span>
                                  <span className={row.expired ? 'text-slate-600' : 'text-emerald-700'}>
                                    {boolLabel(row.expired)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">lastUpdated / source：</span>
                                  <span className="text-slate-700">
                                    {formatTime(row.lastUpdated)} / {row.source || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">_id：</span>
                                  <HashCell hash={row._id} />
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                detectionsRaw（上游原始检测对象）
                              </p>
                              <JsonBlock value={row.detectionsRaw ?? null} className="max-h-56" />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                决策（按当前配置重算）
                              </p>
                              <DecisionBlock
                                decision={row.derivedDecision}
                                derived
                                missingText="后端没有回传 derivedDecision，无法展示重算结果。"
                              />
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                原始 JSON
                              </p>
                              <JsonBlock value={row} />
                            </div>
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
          <code>state=active</code> 的服务端条件是 <code>expiresAt &gt; now</code>，所以这里看到的是「现在还能命中」的条目。
          TTL 后台线程最长可能延迟约 60 秒才删除过期文档，因此读取侧始终显式带这个条件，不会把过期文档当命中。
        </p>
      </DataPanel>
    </div>
  );
};

export default RiskCacheTab;
