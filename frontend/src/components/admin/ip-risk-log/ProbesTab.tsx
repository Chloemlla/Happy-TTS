import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaAngleDoubleDown, FaAngleDoubleUp, FaShieldAlt, FaTimes } from 'react-icons/fa';
import { ipRiskLogsApi, type ProbeReportRow } from '@/api/ipRiskLogs';
import { InfoBadge, InfoPanel, InfoSectionTitle, studioFieldClassName } from '@/components/studioTheme';
import { getBackendErrorMessage } from '@/utils/backendError';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  boolLabel,
  formatCount,
  formatTime,
  probeFlagLabel,
} from './format';
import {
  Badge,
  DataPanel,
  FieldGrid,
  FieldRow,
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

type ProbeAxisKey = 'ipv4vsWs' | 'ipvEvsV6' | 'timezoneVsGeo';

const MISMATCH_LABELS: ReadonlyArray<{ key: ProbeAxisKey; label: string; unavailableHint: string }> = [
  {
    key: 'ipv4vsWs',
    label: 'HTTP/WS 出口',
    unavailableHint:
      '两侧都得是公网出口才判定。HTTP 侧走 Express（req.ip 由 trust proxy 解析），WS 升级请求在 Express 中间件栈之外、拿不到 req.ip，只能回退到 socket 地址；站点经反向代理 / 容器部署时 WS 侧看到的是反代或 Docker 网关的内网地址，与 HTTP 侧的客户端地址不在同一层，因此本轴不可判定。',
  },
  {
    key: 'ipvEvsV6',
    label: 'IPv4/IPv6 出口',
    unavailableHint: '两侧都要观测到公网出口才判定：v6 侧为链路本地（fe80::/10）或唯一本地（fc00::/7）地址时不算出口。',
  },
  {
    key: 'timezoneVsGeo',
    label: '时区/地理',
    unavailableHint: '该 IP 在 proxycheck 风险缓存里没有时区（没查询过或缓存已过期）时不可判定。',
  },
];

/**
 * 老文档没有 comparability（写它的时候还没有「判定前提」这个概念），一律显示「不可判定」：
 * 旧规则的 mismatch 对经反向代理部署的站点是恒真误报，不能当成不一致来展示。
 */
function axisState(row: ProbeReportRow, key: ProbeAxisKey): 'mismatch' | 'match' | 'unknown' {
  if (!row.comparability) return 'unknown';
  if (row.mismatch?.[key]) return 'mismatch';
  return row.comparability[key] ? 'match' : 'unknown';
}

const LEGACY_ROW_HINT =
  '这一行写在判定改版之前，没有 comparability 字段：当时的 mismatch 不含「判定前提」这一步，对经反向代理部署的站点该轴一律误报。请以两侧原始地址为准，不要拿这一行的判决当结论。';

const AXIS_STYLE: Record<'mismatch' | 'match' | 'unknown', { className: string; label: string }> = {
  mismatch: { className: 'border-rose-200 bg-rose-50 font-semibold text-rose-700', label: '不一致' },
  match: { className: 'border-emerald-200 bg-emerald-50 text-emerald-700', label: '一致' },
  unknown: { className: 'border-slate-200 bg-slate-50 text-slate-400', label: '不可判定' },
};

const ProbesTab: React.FC<Props> = ({ refreshNonce }) => {
  const notice = useErrorNotice();

  const [draftIp, setDraftIp] = useState('');
  const [ip, setIp] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [manualNonce, setManualNonce] = useState(0);

  const [rows, setRows] = useState<ProbeReportRow[]>([]);
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
        const res = await ipRiskLogsApi.probeReports({ limit: pageSize, offset, ip: ip || undefined });
        if (requestId !== requestRef.current) return;
        setRows(res.reports ?? []);
        setTotal(res.total ?? 0);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        const message = getBackendErrorMessage(err, '加载客户端探测上报失败');
        setError(message);
        notice(message);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
  }, [pageSize, offset, ip, refreshNonce, manualNonce, notice]);

  const toggle = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const rowKey = (row: ProbeReportRow, index: number): string => row._id || `${row.createdAt}-${index}`;
  const allExpanded = rows.length > 0 && rows.every((row, index) => expanded.has(rowKey(row, index)));
  const flaggedCount = rows.filter((row) => (row.flags ?? []).length > 0).length;

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="客户端探测上报"
        description="集合 proxycheck_probe_reports 的内容：浏览器把出口 IP、时区、硬件与自动化特征上报上来，服务端自己判定不一致并留痕。"
        icon={FaShieldAlt}
        eyebrow="§2.5 probe-reports"
        action={<RefreshButton onClick={() => setManualNonce((current) => current + 1)} loading={loading} />}
      />

      <SectionNote>
        写入点：<code>POST /api/ip-risk/report</code>（<code>src/controllers/ipRiskController.ts</code>）。
        每行展示的 <code>flags</code> / <code>mismatch</code> / <code>comparability</code>
        就是那次上报<span className="font-semibold">回给浏览器的 data</span>（<code>{'{stored, flags, mismatch, comparability}'}</code>），
        也就是「给前端的判决」本身。
        <br />
        口径：每一项都分「能不能判」（<code>comparability</code>）与「判成什么」（<code>mismatch</code>）两步。
        <code>comparability</code> 为 false 时该轴没有判定前提（缺一侧，或该侧不是公网出口 —— 例如客户端在
        NAT / 内网环境下只能观测到私网地址），显示为<span className="font-semibold">不可判定</span>，不等于「一致」。
        <br />
        <span className="font-semibold">改版前的历史行</span>（<code>comparability</code> 显示为 -）没有这一步：
        它们的 <code>ipv4_vs_ws_mismatch</code> 是按「两边都有值且不等」直接判的，凡站点经反向代理部署就恒真，
        不能当结论用。所以这类行的三个轴一律显示<span className="font-semibold">不可判定</span>，
        行内原始的 <code>flags</code> 仍然是当时的留痕（标签已注明命中条件），不回填、不改写历史文档。
        <br />
        另外：<code>httpExitIp</code> 与 <code>wsExitIp</code> 都是服务端按 trust proxy 解析出来的客户端地址
        （两侧同口径，WS 升级路径同样做代理链解析），<code>ipv6Exit</code> 是双栈出口观测值；
        <code>webrtc_leak_reported</code> 与 <code>webdriver_reported</code>
        只是「客户端自称」的记号，服务端不采信它们做拦截判断。
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
              placeholder="按上报方 IP 前缀筛选（最长 45 字符，回车立即查询）"
              aria-label="按上报方 IP 前缀筛选"
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
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <InfoBadge>命中 {formatCount(total)} 条</InfoBadge>
          <InfoBadge tone={flaggedCount > 0 ? 'amber' : 'slate'}>本页有服务端标记 {flaggedCount} 条</InfoBadge>
          {loading ? <span>正在刷新…</span> : null}
        </div>
      </InfoPanel>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl">
        <TableWrap minWidth="min-w-[1180px]">
          <thead>
            <tr className="border-b border-slate-200">
              <Th>时间</Th>
              <Th>上报方 IP（服务端解析）</Th>
              <Th>各轴观测到的出口地址</Th>
              <Th>服务端判定 flags / mismatch / comparability</Th>
              <Th>客户端自报摘要</Th>
              <Th className="text-right">明细</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              loading={loading && rows.length === 0}
              error={rows.length === 0 ? error : null}
              empty={!loading && rows.length === 0}
              emptyText={ip ? '该 IP 前缀没有探测上报' : '还没有任何客户端探测上报'}
              colSpan={6}
            />
            {rows.map((row, index) => {
              const key = rowKey(row, index);
              const isOpen = expanded.has(key);
              const flags = row.flags ?? [];
              return (
                <React.Fragment key={key}>
                  <tr className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <Td>
                      <TimeCell value={row.createdAt} />
                    </Td>
                    <Td>
                      <IpCell ip={row.ip} />
                    </Td>
                    <Td className="space-y-0.5">
                      <div className="font-mono text-[11px] text-slate-600">HTTP {row.httpExitIp || '-'}</div>
                      <div className="font-mono text-[11px] text-slate-500">WS {row.wsExitIp || '-'}</div>
                      <div className="font-mono text-[11px] text-slate-500">IPv6 {row.ipv6Exit || '-'}</div>
                      <div className="text-[11px] text-slate-500">WebRTC 泄漏 {boolLabel(row.webrtcLeak)}</div>
                    </Td>
                    <Td>
                      {flags.length === 0 ? (
                        <span className="text-slate-400">无标记</span>
                      ) : (
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {flags.map((flag) => (
                            <Badge
                              key={flag}
                              style={{
                                label: probeFlagLabel(flag),
                                badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
                                dotClass: 'bg-amber-500',
                              }}
                              title={flag}
                            />
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {MISMATCH_LABELS.map((item) => {
                          const state = axisState(row, item.key);
                          const style = AXIS_STYLE[state];
                          return (
                            <span
                              key={item.key}
                              title={
                                state !== 'unknown'
                                  ? undefined
                                  : row.comparability
                                    ? item.unavailableHint
                                    : LEGACY_ROW_HINT
                              }
                              className={`rounded-lg border px-2 py-0.5 text-[11px] ${style.className}`}
                            >
                              {item.label} {style.label}
                            </span>
                          );
                        })}
                      </div>
                    </Td>
                    <Td className="text-slate-600">
                      <div>
                        TZ {row.timezone || '-'}
                        {typeof row.timezoneOffsetMin === 'number' ? `（偏移 ${row.timezoneOffsetMin} 分）` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        语言 {(row.languages ?? []).join(', ') || '-'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        平台 {row.uaPlatform || '-'} · CPU {row.hardwareConcurrency ?? '-'} 核 · 内存{' '}
                        {row.deviceMemory ?? '-'} GB
                      </div>
                      <div className="text-[11px] text-slate-500">
                        分辨率 {row.screenRes || '-'} · webdriver {boolLabel(row.webdriver)}
                      </div>
                      <div className="text-[11px] text-slate-400">采集于 {row.collectedAt || '-'}</div>
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
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              本次上报的字段（全部）
                            </p>
                            <FieldGrid className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5">
                              <FieldRow label="ip（服务端解析，可信）" value={row.ip} mono always />
                              <FieldRow label="httpExitIp（HTTP 侧 echo 回显）" value={row.httpExitIp} mono always />
                              <FieldRow label="wsExitIp（WS 侧回显）" value={row.wsExitIp} mono always />
                              <FieldRow label="ipv6Exit（echo 回显的双栈出口）" value={row.ipv6Exit} mono always />
                              <FieldRow label="webrtcLeak" value={boolLabel(row.webrtcLeak)} always />
                              <FieldRow label="timezone" value={row.timezone} always />
                              <FieldRow label="timezoneOffsetMin" value={row.timezoneOffsetMin} always />
                              <FieldRow label="languages" value={(row.languages ?? []).join(', ') || '-'} always />
                              <FieldRow label="uaPlatform" value={row.uaPlatform} always />
                              <FieldRow label="hardwareConcurrency" value={row.hardwareConcurrency} always />
                              <FieldRow label="deviceMemory" value={row.deviceMemory} always />
                              <FieldRow label="screenRes" value={row.screenRes} always />
                              <FieldRow label="webdriver" value={boolLabel(row.webdriver)} always />
                              <FieldRow label="collectedAt" value={row.collectedAt} mono always />
                              <FieldRow label="createdAt" value={formatTime(row.createdAt)} always />
                              <FieldRow
                                label="_id"
                                value={<HashCell hash={row._id} />}
                                copyValue={typeof row._id === 'string' ? row._id : undefined}
                                always
                              />
                            </FieldGrid>
                            <div className="mt-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5">
                              <div className="text-xs text-slate-500">userAgent</div>
                              <div className="mt-1 break-all font-mono text-[11px] leading-5 text-slate-700">
                                {row.userAgent || '-'}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                服务端判决（= 回给浏览器的 data）
                              </p>
                              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs">
                                <div>
                                  <span className="text-slate-500">flags：</span>
                                  {flags.length > 0 ? (
                                    <span className="text-slate-700">
                                      {flags.map((flag) => `${flag}（${probeFlagLabel(flag)}）`).join('；')}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">（空数组，没有命中任何标记）</span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-slate-500">mismatch：</span>
                                  <span className="font-mono text-slate-700">
                                    ipv4vsWs={boolLabel(row.mismatch?.ipv4vsWs)} · ipvEvsV6=
                                    {boolLabel(row.mismatch?.ipvEvsV6)} · timezoneVsGeo=
                                    {boolLabel(row.mismatch?.timezoneVsGeo)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">comparability：</span>
                                  <span className="font-mono text-slate-700">
                                    ipv4vsWs={boolLabel(row.comparability?.ipv4vsWs)} · ipvEvsV6=
                                    {boolLabel(row.comparability?.ipvEvsV6)} · timezoneVsGeo=
                                    {boolLabel(row.comparability?.timezoneVsGeo)}
                                  </span>
                                </div>
                                <div className="text-[11px] leading-5 text-slate-400">
                                  stored 字段（上报是否落库成功）不会存进文档，所以这里只看得到 flags / mismatch /
                                  comparability。comparability 为否时对应的 mismatch 恒为否，那是「没有判定前提」而不是
                                  「一致」；老文档没有 comparability 字段（显示为 -），它上方的琥珀色标记是改版前的历史
                                  留痕：那种行请以两侧原始地址为准，别拿旧判决当结论。
                                </div>
                              </div>
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
          这个集合原先刻意保持无二级索引（纯写放大）；本面板上线时为按时间倒序翻页补了一条
          <code>{' { createdAt: -1 } '}</code>索引，但 <code>ip</code> 字段上仍然没有索引，
          所以 IP 前缀筛选是集合扫描：数据量大时请优先用 IP 前缀收窄。
        </p>
      </DataPanel>
    </div>
  );
};

export default ProbesTab;
