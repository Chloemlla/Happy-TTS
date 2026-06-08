import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaNetworkWired,
  FaPlay,
  FaPlug,
  FaServer,
  FaStop,
  FaTachometerAlt,
} from 'react-icons/fa';
import { useWebSocket, type WsServerMessage } from '../hooks/useWebSocket';
import {
  getRustBenchmarkStatus,
  getRustBenchmarkTargets,
  startRustBenchmark,
  stopRustBenchmark,
  type RustBenchmarkOperation,
  type RustBenchmarkSnapshot,
  type RustBenchmarkStartPayload,
  type RustBenchmarkTarget,
  type RustBenchmarkTargetInfo,
} from '../api/rustBenchmark';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

const OPERATION_LABELS: Record<RustBenchmarkOperation, string> = {
  health: 'Health 通道',
  'network-dns': 'Network DNS',
  'network-http-timing': 'Network HTTP Timing',
  'file-hash': 'File Hash',
  'file-inspect': 'File Inspect',
  'audio-passthrough': 'Audio Passthrough',
  'data-hash': 'Data Hash',
  'data-json-inspect': 'Data JSON Inspect',
  'security-risk-score': 'Security Risk Score',
  'security-content-scan': 'Security Content Scan',
};

const TARGET_LABELS: Record<RustBenchmarkTarget, string> = {
  'network-tools': 'Network Tools',
  'audio-worker': 'Audio Worker',
  'file-worker': 'File Worker',
  'data-tools': 'Data Tools',
  'security-worker': 'Security Worker',
};

const EMPTY_SNAPSHOT: RustBenchmarkSnapshot = {
  runId: null,
  status: 'idle',
  target: null,
  operation: null,
  elapsedMs: 0,
  requested: null,
  counters: {
    total: 0,
    success: 0,
    failed: 0,
    inFlight: 0,
  },
  rates: {
    requestsPerSecond: 0,
    successRate: 0,
  },
  latency: {
    lastMs: null,
    minMs: null,
    maxMs: null,
    avgMs: null,
    p50Ms: null,
    p90Ms: null,
    p95Ms: null,
    p99Ms: null,
  },
  errors: [],
  samples: [],
};

const DEFAULT_FORM: RustBenchmarkStartPayload = {
  target: 'network-tools',
  operation: 'network-dns',
  durationMs: 30_000,
  concurrency: 8,
  payloadBytes: 4096,
  timeoutMs: 5000,
  targetValue: 'example.com',
  baseUrl: '',
  internalToken: '',
};

const RustBenchmarkDashboard: React.FC = () => {
  const [targets, setTargets] = useState<RustBenchmarkTargetInfo[]>([]);
  const [snapshot, setSnapshot] = useState<RustBenchmarkSnapshot>(EMPTY_SNAPSHOT);
  const [form, setForm] = useState<RustBenchmarkStartPayload>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'rust-benchmark:update' && msg.data) {
      setSnapshot(msg.data as RustBenchmarkSnapshot);
    }
  }, []);

  const { connected, subscribe, unsubscribe } = useWebSocket({ onMessage });

  useEffect(() => {
    if (!connected) return;
    subscribe('rust-benchmark');
    return () => unsubscribe('rust-benchmark');
  }, [connected, subscribe, unsubscribe]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const [targetList, currentStatus] = await Promise.all([
          getRustBenchmarkTargets(),
          getRustBenchmarkStatus(),
        ]);
        if (!alive) return;
        setTargets(targetList);
        setSnapshot(currentStatus);
        const firstTarget = targetList.find((target) => target.id === DEFAULT_FORM.target) || targetList[0];
        if (firstTarget) {
          setForm((current) => ({
            ...current,
            target: firstTarget.id,
            operation: firstTarget.defaultOperation,
            targetValue: defaultTargetValue(firstTarget.defaultOperation),
          }));
        }
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof Error ? loadError.message : '加载 Rust 压测状态失败');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (connected) return;
    const timer = setInterval(async () => {
      try {
        setSnapshot(await getRustBenchmarkStatus());
      } catch {
        // WebSocket 断开时的兜底查询失败不打断页面操作。
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [connected]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === form.target),
    [targets, form.target],
  );

  const isRunning = snapshot.status === 'running' || snapshot.status === 'stopping';

  const updateNumber = (key: keyof Pick<RustBenchmarkStartPayload, 'durationMs' | 'concurrency' | 'payloadBytes' | 'timeoutMs'>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setForm((current) => ({
        ...current,
        [key]: Number.isFinite(value) ? value : current[key],
      }));
    };

  const handleTargetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTarget = event.target.value as RustBenchmarkTarget;
    const target = targets.find((item) => item.id === nextTarget);
    const nextOperation = target?.defaultOperation || 'health';
    setForm((current) => ({
      ...current,
      target: nextTarget,
      operation: nextOperation,
      targetValue: defaultTargetValue(nextOperation),
      baseUrl: '',
    }));
  };

  const handleOperationChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextOperation = event.target.value as RustBenchmarkOperation;
    setForm((current) => ({
      ...current,
      operation: nextOperation,
      targetValue: defaultTargetValue(nextOperation),
    }));
  };

  const handleStart = async () => {
    try {
      setStarting(true);
      setError(null);
      const payload: RustBenchmarkStartPayload = {
        target: form.target,
        operation: form.operation,
        durationMs: form.durationMs,
        concurrency: form.concurrency,
        payloadBytes: form.payloadBytes,
        timeoutMs: form.timeoutMs,
        targetValue: optionalText(form.targetValue),
        baseUrl: optionalText(form.baseUrl),
        internalToken: optionalText(form.internalToken),
      };
      setSnapshot(await startRustBenchmark(payload));
    } catch (startError: any) {
      setError(startError?.response?.data?.error || startError?.message || '启动压测失败');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      setStopping(true);
      setError(null);
      setSnapshot(await stopRustBenchmark());
    } catch (stopError: any) {
      setError(stopError?.response?.data?.error || stopError?.message || '停止压测失败');
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return (
      <InfoPanel>
        <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
          正在加载 Rust 压测看板...
        </div>
      </InfoPanel>
    );
  }

  return (
    <div className="space-y-6">
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Rust Workers"
          title="Rust 压测看板"
          description="由 Node 后端在进程内并发调用 Rust worker，实时指标通过 WebSocket 推送到当前页面。"
          icon={FaServer}
          action={
            <InfoBadge tone={connected ? 'emerald' : 'rose'}>
              WS {connected ? '已连接' : '未连接'}
            </InfoBadge>
          }
        />

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Rust 目标</span>
            <select value={form.target} onChange={handleTargetChange} disabled={isRunning} className={logShareInputClass}>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}{target.configured ? '' : ' (未启用)'}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>压测操作</span>
            <select value={form.operation} onChange={handleOperationChange} disabled={isRunning} className={logShareInputClass}>
              {(selectedTarget?.operations || ['health']).map((operation) => (
                <option key={operation} value={operation}>
                  {OPERATION_LABELS[operation]}
                </option>
              ))}
            </select>
          </label>

          <NumberField label="时长 ms" value={form.durationMs} min={1000} max={300000} disabled={isRunning} onChange={updateNumber('durationMs')} />
          <NumberField label="并发数" value={form.concurrency} min={1} max={128} disabled={isRunning} onChange={updateNumber('concurrency')} />
          <NumberField label="Payload bytes" value={form.payloadBytes} min={16} max={1048576} disabled={isRunning} onChange={updateNumber('payloadBytes')} />
          <NumberField label="超时 ms" value={form.timeoutMs} min={100} max={60000} disabled={isRunning} onChange={updateNumber('timeoutMs')} />

          <label className="space-y-2 text-sm font-semibold text-slate-700 lg:col-span-2">
            <span>操作目标</span>
            <input
              value={form.targetValue || ''}
              onChange={(event) => setForm((current) => ({ ...current, targetValue: event.target.value }))}
              disabled={isRunning || form.operation === 'health'}
              placeholder={defaultTargetValue(form.operation) || '此操作不需要目标值'}
              className={logShareInputClass}
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-slate-700 lg:col-span-2">
            <span>自定义 Rust URL</span>
            <input
              value={form.baseUrl || ''}
              onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              disabled={isRunning}
              placeholder={selectedTarget?.defaultBaseUrl || 'http://127.0.0.1:4010'}
              className={logShareInputClass}
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-slate-700 lg:col-span-2">
            <span>临时 Internal Token</span>
            <input
              value={form.internalToken || ''}
              onChange={(event) => setForm((current) => ({ ...current, internalToken: event.target.value }))}
              disabled={isRunning}
              type="password"
              placeholder="留空则使用后端配置"
              className={logShareInputClass}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <InfoPrimaryButton onClick={handleStart} disabled={isRunning || starting}>
            <FaPlay className="text-xs" />
            {starting ? '启动中' : '开始压测'}
          </InfoPrimaryButton>
          <button type="button" onClick={handleStop} disabled={!isRunning || stopping} className={logShareDangerButtonClass}>
            <FaStop className="text-xs" />
            {stopping ? '停止中' : '停止'}
          </button>
          <button
            type="button"
            onClick={() => void getRustBenchmarkStatus().then(setSnapshot).catch(() => undefined)}
            className={logShareSecondaryButtonClass}
          >
            <FaPlug className="text-xs" />
            刷新状态
          </button>
        </div>
      </InfoPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoMetricCard label="状态" value={statusLabel(snapshot.status)} detail={runDetail(snapshot)} icon={FaServer} />
        <InfoMetricCard label="RPS" value={formatNumber(snapshot.rates.requestsPerSecond)} detail={`${snapshot.counters.inFlight} in flight`} icon={FaTachometerAlt} />
        <InfoMetricCard label="成功率" value={`${formatNumber(snapshot.rates.successRate)}%`} detail={`${snapshot.counters.success}/${snapshot.counters.total}`} icon={FaCheckCircle} />
        <InfoMetricCard label="P95 延迟" value={formatMs(snapshot.latency.p95Ms)} detail={`avg ${formatMs(snapshot.latency.avgMs)}`} icon={FaClock} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoPanel className="xl:col-span-2">
          <InfoSectionTitle eyebrow="Latency" title="延迟分布" icon={FaChartLine} />
          <div className="grid gap-3 sm:grid-cols-4">
            <LatencyTile label="P50" value={snapshot.latency.p50Ms} />
            <LatencyTile label="P90" value={snapshot.latency.p90Ms} />
            <LatencyTile label="P99" value={snapshot.latency.p99Ms} />
            <LatencyTile label="Max" value={snapshot.latency.maxMs} />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${progressPercent(snapshot)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{formatDuration(snapshot.elapsedMs)}</span>
            <span>{snapshot.requested ? formatDuration(snapshot.requested.durationMs) : '0s'}</span>
          </div>
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle eyebrow="Target" title="当前目标" icon={FaNetworkWired} />
          <div className="space-y-3 text-sm text-slate-600">
            <KeyValue label="目标" value={snapshot.target ? TARGET_LABELS[snapshot.target] : '-'} />
            <KeyValue label="操作" value={snapshot.operation ? OPERATION_LABELS[snapshot.operation] : '-'} />
            <KeyValue label="Transport" value={transportLabel(snapshot.transport || selectedTarget?.defaultTransport)} />
            <KeyValue label="Rust URL" value={snapshot.baseUrl || selectedTarget?.defaultBaseUrl || '-'} />
            <KeyValue label="IPC 文件" value={snapshot.ipcPath || selectedTarget?.defaultIpcPath || '-'} />
            <KeyValue label="Target value" value={snapshot.requested?.targetValue || '-'} />
          </div>
        </InfoPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InfoPanel>
          <InfoSectionTitle eyebrow="Samples" title="最近样本" icon={FaClock} />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">结果</th>
                  <th className="px-3 py-2">延迟</th>
                  <th className="px-3 py-2">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.samples.slice(0, 12).map((sample, index) => (
                  <tr key={`${sample.at}-${index}`} className="text-slate-600">
                    <td className="px-3 py-2 whitespace-nowrap">{formatTime(sample.at)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${sample.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {sample.ok ? 'OK' : 'ERR'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatMs(sample.latencyMs)}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{sample.statusCode || sample.error || '-'}</td>
                  </tr>
                ))}
                {snapshot.samples.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-400" colSpan={4}>
                      暂无样本
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </InfoPanel>

        <InfoPanel>
          <InfoSectionTitle eyebrow="Errors" title="错误摘要" icon={FaExclamationTriangle} />
          <div className="space-y-3">
            {snapshot.errors.map((item) => (
              <div key={item.message} className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-rose-700">{item.message}</div>
                    <div className="mt-1 text-xs text-rose-500">Last {formatTime(item.lastAt)}</div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
                    {item.count}
                  </span>
                </div>
              </div>
            ))}
            {snapshot.errors.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                暂无错误
              </div>
            )}
          </div>
        </InfoPanel>
      </div>
    </div>
  );
};

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, value, min, max, disabled, onChange }) => (
  <label className="space-y-2 text-sm font-semibold text-slate-700">
    <span>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={onChange}
      disabled={disabled}
      className={logShareInputClass}
    />
  </label>
);

const LatencyTile: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className="mt-2 text-xl font-semibold text-slate-900">{formatMs(value)}</div>
  </div>
);

const KeyValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
    <span className="shrink-0 text-slate-400">{label}</span>
    <span className="min-w-0 break-all text-right font-medium text-slate-700">{value}</span>
  </div>
);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultTargetValue(operation: RustBenchmarkOperation): string {
  if (operation === 'network-dns') return 'example.com';
  if (operation === 'network-http-timing') return 'https://example.com';
  return '';
}

function statusLabel(status: RustBenchmarkSnapshot['status']): string {
  if (status === 'running') return '运行中';
  if (status === 'stopping') return '停止中';
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return '空闲';
}

function transportLabel(transport: RustBenchmarkSnapshot['transport']): string {
  if (transport === 'shared-memory-ipc') return 'mmap IPC';
  if (transport === 'http') return 'HTTP';
  return '-';
}

function runDetail(snapshot: RustBenchmarkSnapshot): string {
  if (!snapshot.target || !snapshot.operation) return '尚未启动';
  return `${TARGET_LABELS[snapshot.target]} / ${OPERATION_LABELS[snapshot.operation]}`;
}

function formatMs(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return `${formatNumber(value)} ms`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString();
}

function progressPercent(snapshot: RustBenchmarkSnapshot): number {
  const duration = snapshot.requested?.durationMs || 0;
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(100, (snapshot.elapsedMs / duration) * 100));
}

export default RustBenchmarkDashboard;
