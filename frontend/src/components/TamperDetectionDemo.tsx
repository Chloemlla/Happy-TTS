import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  Database,
  FileWarning,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  TerminalSquare,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';
import { getApiBaseUrl } from '../api/api';
import { integrityChecker } from '../utils/integrityCheck';
import { signedFetch } from '../utils/requestSigner';
import { getAuthToken } from '../utils/authSession';


interface TamperDetectionDemoProps {
  className?: string;
}

interface SystemStatus {
  initialized: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  debugMode: boolean;
  errorCount: number;
  isExempt: boolean;
}

interface ServerTamperEvent {
  id?: string;
  elementId?: string;
  timestamp: string;
  clientTimestamp?: string;
  url: string;
  ip?: string;
  eventType?: string;
  tamperType?: string;
  detectionMethod?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  signed?: boolean;
}

interface ServerBlockedIP {
  ip: string;
  reason: string;
  timestamp: string;
  expiresAt: string;
}

interface ServerTamperSummary {
  totalEvents: number;
  eventsLastHour: number;
  eventsLast24h: number;
  blockedCount: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  recentEvents: ServerTamperEvent[];
  blockedIPs: ServerBlockedIP[];
}

type IconComponent = React.ComponentType<{ className?: string }>;
type Tone = 'slate' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';

const panelClass =
  'rounded-[28px] border border-white/70 bg-white/88 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-6';
const compactPanelClass =
  'rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.06)] backdrop-blur';

const toneClasses: Record<Tone, { icon: string; button: string; badge: string; text: string }> = {
  slate: {
    icon: 'bg-slate-100 text-slate-700 ring-slate-200',
    button: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500',
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    text: 'text-slate-700',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    button: 'bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    text: 'text-emerald-700',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    button: 'bg-sky-700 text-white hover:bg-sky-800 focus-visible:ring-sky-500',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    text: 'text-sky-700',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    button: 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    text: 'text-amber-700',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-700 ring-rose-100',
    button: 'bg-rose-700 text-white hover:bg-rose-800 focus-visible:ring-rose-500',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    text: 'text-rose-700',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    button: 'bg-violet-700 text-white hover:bg-violet-800 focus-visible:ring-violet-500',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    text: 'text-violet-700',
  },
};

const severityClasses: Record<NonNullable<ServerTamperEvent['severity']>, string> = {
  low: 'border-slate-200 bg-slate-100 text-slate-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
};

const formatDate = (value?: string) => {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const resolveEventType = (event: ServerTamperEvent) => event.tamperType || event.eventType || 'unknown';

const IconBadge: React.FC<{ icon: IconComponent; tone?: Tone; className?: string }> = ({
  icon: Icon,
  tone = 'slate',
  className = '',
}) => (
  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] ring-1 ${toneClasses[tone].icon} ${className}`}>
    <Icon className="h-4 w-4" />
  </div>
);

const SectionTitle: React.FC<{
  title: string;
  description?: string;
  icon: IconComponent;
  tone?: Tone;
  action?: React.ReactNode;
}> = ({ title, description, icon, tone = 'slate', action }) => (
  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex gap-3">
      <IconBadge icon={icon} tone={tone} />
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);

const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconComponent;
  tone?: Tone;
  variant?: 'primary' | 'secondary' | 'danger';
}> = ({ icon: Icon, tone = 'slate', variant = 'primary', className = '', children, ...props }) => {
  const variantClass =
    variant === 'secondary'
      ? 'border border-white/70 bg-white/80 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-500'
      : variant === 'danger'
        ? toneClasses.rose.button
        : toneClasses[tone].button;

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: IconComponent;
  tone?: Tone;
}> = ({ label, value, detail, icon, tone = 'slate' }) => (
  <div className={compactPanelClass}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
      <IconBadge icon={icon} tone={tone} />
    </div>
  </div>
);

const StatusPill: React.FC<{
  active: boolean;
  label: string;
  activeText: string;
  inactiveText: string;
  tone?: Tone;
  inactiveTone?: Tone;
}> = ({
  active,
  label,
  activeText,
  inactiveText,
  tone = 'emerald',
  inactiveTone = 'slate',
}) => {
  const badgeTone = active ? tone : inactiveTone;

  return (
    <div className={`rounded-2xl border px-3 py-2 text-sm ${toneClasses[badgeTone].badge}`}>
      <span className="font-semibold">{label}: </span>
      {active ? activeText : inactiveText}
    </div>
  );
};

export const TamperDetectionDemo: React.FC<TamperDetectionDemoProps> = ({ className }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverSummary, setServerSummary] = useState<ServerTamperSummary | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [manualBlockIP, setManualBlockIP] = useState('');
  const [manualBlockReason, setManualBlockReason] = useState('管理员手动封禁');
  const [manualBlockHours, setManualBlockHours] = useState(24);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadServerSummary = async () => {
    setServerLoading(true);
    setServerError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tamper/admin/summary?limit=20`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '获取后端防篡改状态失败');
      }
      setServerSummary(data.data);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerLoading(false);
    }
  };

  const handleUnblockIP = async (ip: string) => {
    try {
      const response = await signedFetch(`${getApiBaseUrl()}/api/tamper/admin/blocked/${encodeURIComponent(ip)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '解除封禁失败');
      }
      await loadServerSummary();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleManualBlock = async () => {
    const ip = manualBlockIP.trim();
    if (!ip) {
      alert('请输入要封禁的 IP');
      return;
    }

    try {
      const body = JSON.stringify({
        ip,
        reason: manualBlockReason.trim() || '管理员手动封禁',
        durationHours: manualBlockHours,
      });
      const response = await signedFetch(`${getApiBaseUrl()}/api/tamper/admin/blocked`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '封禁 IP 失败');
      }
      setManualBlockIP('');
      await loadServerSummary();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const updateStatus = () => {
    try {
      const debugInfo = integrityChecker.getDebugInfo();
      const errorStatus = integrityChecker.getErrorStatus();
      const exemptStatus = integrityChecker.checkExemptStatus();

      setStatus({
        initialized: debugInfo.isInitialized,
        disabled: integrityChecker.isDisabled(),
        recoveryMode: debugInfo.isInRecoveryMode,
        debugMode: false,
        errorCount: errorStatus.errorCount,
        isExempt: exemptStatus.isExempt,
      });
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  const handleCheck = async (checkType: 'all' | 'dom' | 'text' | 'network' | 'baseline' = 'all') => {
    setIsLoading(true);
    try {
      const result = await integrityChecker.manualCheck({
        checkType,
        forceCheck: false,
      });
      setCheckResult(result);
    } catch (error) {
      console.error('检查失败:', error);
      setCheckResult({ success: false, errors: [String(error)] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportTampering = async () => {
    try {
      const result = await integrityChecker.manualReportTampering({
        eventType: 'manual_test',
        elementId: 'demo-element',
        originalContent: 'Original Content',
        tamperContent: 'Tampered Content',
        tamperType: 'dom',
        detectionMethod: 'manual-demo',
      });
      alert(result.success ? '报告成功!' : `报告失败: ${result.message}`);
      if (result.success) {
        await loadServerSummary();
      }
    } catch (error) {
      alert(`报告失败: ${error}`);
    }
  };

  const handleRecovery = (type: 'emergency' | 'soft' | 'baseline' = 'soft') => {
    try {
      const result = integrityChecker.manualRecovery({
        recoveryType: type,
        showWarning: true,
      });
      alert(result.success ? '恢复成功!' : `恢复失败: ${result.message}`);
      updateStatus();
    } catch (error) {
      alert(`恢复失败: ${error}`);
    }
  };

  const handleSimulate = (type: 'dom' | 'network' | 'proxy' | 'injection') => {
    try {
      const result = integrityChecker.simulateTampering({
        tamperType: type,
        elementId: 'demo-simulation',
        testContent: `Simulated ${type} tampering`,
      });
      alert(result.success ? '模拟成功!' : `模拟失败: ${result.message}`);
      if (result.success) {
        window.setTimeout(() => void loadServerSummary(), 800);
      }
    } catch (error) {
      alert(`模拟失败: ${error}`);
    }
  };

  const handleControl = (action: 'pause' | 'resume' | 'disable' | 'reinit') => {
    try {
      switch (action) {
        case 'pause':
          integrityChecker.pause();
          break;
        case 'resume':
          integrityChecker.resume();
          break;
        case 'disable':
          integrityChecker.disable();
          break;
        case 'reinit':
          integrityChecker.reinitialize();
          break;
      }
      updateStatus();
      alert(`操作 ${action} 执行成功!`);
    } catch (error) {
      alert(`操作失败: ${error}`);
    }
  };

  useEffect(() => {
    updateStatus();
    void loadServerSummary();
    const interval = window.setInterval(updateStatus, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = useMemo(
    () => [
      {
        label: 'Total Events',
        value: serverSummary?.totalEvents ?? 0,
        detail: '后端累计记录的篡改事件',
        icon: Database,
        tone: 'slate' as Tone,
      },
      {
        label: 'Last Hour',
        value: serverSummary?.eventsLastHour ?? 0,
        detail: '最近 1 小时触发事件',
        icon: Activity,
        tone: 'sky' as Tone,
      },
      {
        label: 'Last 24H',
        value: serverSummary?.eventsLast24h ?? 0,
        detail: '最近 24 小时触发事件',
        icon: Clock,
        tone: 'amber' as Tone,
      },
      {
        label: 'Blocked IP',
        value: serverSummary?.blockedCount ?? 0,
        detail: '当前仍在封禁期的 IP',
        icon: Ban,
        tone: (serverSummary?.blockedCount ?? 0) > 0 ? ('rose' as Tone) : ('emerald' as Tone),
      },
    ],
    [serverSummary],
  );

  if (!status) {
    return (
      <div className={`relative min-h-[46vh] overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_55%,#f8fafc_100%)] ${className ?? ''}`}>
        <div className="relative mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10">
          <div className="w-full rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin" />
            </div>
            <div className="mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400">Synapse Security</div>
            <p className="mt-3 text-sm leading-7 text-slate-600">正在加载防篡改控制面板...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_55%,#f8fafc_100%)] text-slate-900 ${className ?? ''}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.3)_0%,transparent_52%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/70 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-7">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-slate-900" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl gap-4">
              <IconBadge icon={ShieldAlert} tone="slate" className="h-12 w-12 rounded-[22px]" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Synapse Integrity</div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">防篡改检测与处置</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  前端检测、签名上报、后端留痕与 IP 封禁联动管理。
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.disabled ? toneClasses.rose.badge : toneClasses.emerald.badge}`}>
                    {status.disabled ? '前端检测已禁用' : '前端检测运行中'}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${serverError ? toneClasses.rose.badge : toneClasses.sky.badge}`}>
                    {serverError ? '后端状态异常' : '后端联动已接入'}
                  </span>
                </div>
              </div>
            </div>
            <ActionButton icon={RefreshCw} variant="secondary" onClick={() => void loadServerSummary()} disabled={serverLoading}>
              {serverLoading ? '刷新中...' : '刷新后端状态'}
            </ActionButton>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        {serverError && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {serverError}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <section className={panelClass}>
              <SectionTitle
                title="本地检测状态"
                description="浏览器端完整性检测器的实时状态。"
                icon={ShieldCheck}
                tone={status.disabled ? 'rose' : 'emerald'}
                action={
                  <ActionButton icon={RefreshCw} variant="secondary" onClick={updateStatus}>
                    刷新状态
                  </ActionButton>
                }
              />
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <StatusPill active={status.initialized} label="初始化" activeText="已完成" inactiveText="未完成" tone="emerald" />
                <StatusPill active={status.disabled} label="检测状态" activeText="已禁用" inactiveText="正常" tone="rose" inactiveTone="emerald" />
                <StatusPill active={status.recoveryMode} label="恢复模式" activeText="启用" inactiveText="关闭" tone="amber" />
                <StatusPill active={status.isExempt} label="页面豁免" activeText="已豁免" inactiveText="正常检查" tone="sky" />
                <div className={`rounded-2xl border px-3 py-2 text-sm ${status.errorCount > 0 ? toneClasses.amber.badge : toneClasses.slate.badge}`}>
                  <span className="font-semibold">错误计数: </span>
                  {status.errorCount}
                </div>
                <div className={`rounded-2xl border px-3 py-2 text-sm ${toneClasses.slate.badge}`}>
                  <span className="font-semibold">调试模式: </span>
                  {status.debugMode ? '开启' : '关闭'}
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <SectionTitle title="最近篡改事件" description="后端记录的最新事件，包含签名状态、严重级别和来源 IP。" icon={FileWarning} tone="amber" />
              <div className="overflow-hidden rounded-2xl border border-slate-200/70">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <span>事件</span>
                  <span>来源</span>
                  <span>时间</span>
                  <span>签名</span>
                </div>
                <div className="divide-y divide-slate-200/70 bg-white/70">
                  {(serverSummary?.recentEvents ?? []).length > 0 ? (
                    serverSummary!.recentEvents.map((event) => (
                      <div key={event.id || `${event.timestamp}-${event.ip}-${event.elementId}`} className="grid gap-3 px-4 py-3 text-sm text-slate-700 md:grid-cols-[1.2fr_1fr_1fr_0.8fr]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">{resolveEventType(event)}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${severityClasses[event.severity || 'low']}`}>
                              {event.severity || 'low'}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">{event.detectionMethod || event.elementId || event.url}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{event.ip || 'unknown'}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{event.url}</div>
                        </div>
                        <div className="text-xs leading-5 text-slate-500">{formatDate(event.timestamp)}</div>
                        <div>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${event.signed ? toneClasses.emerald.badge : toneClasses.rose.badge}`}>
                            {event.signed ? '已签名' : '未签名'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">暂无后端篡改事件。</div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className={panelClass}>
              <SectionTitle title="手动封禁 IP" description="对确认异常来源执行临时封禁，写入后端封禁列表。" icon={Ban} tone="rose" />
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">IP Address</span>
                  <input
                    value={manualBlockIP}
                    onChange={(event) => setManualBlockIP(event.target.value)}
                    placeholder="例如 203.0.113.10"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reason</span>
                  <input
                    value={manualBlockReason}
                    onChange={(event) => setManualBlockReason(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Duration Hours</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={manualBlockHours}
                    onChange={(event) => setManualBlockHours(Math.max(1, Math.min(720, Number(event.target.value) || 24)))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <ActionButton icon={Ban} variant="danger" className="w-full" onClick={() => void handleManualBlock()}>
                  封禁 IP
                </ActionButton>
              </div>
            </section>

            <section className={panelClass}>
              <SectionTitle title="当前封禁列表" description="仍在有效期内的防篡改封禁记录。" icon={ShieldOff} tone="rose" />
              <div className="space-y-3">
                {(serverSummary?.blockedIPs ?? []).length > 0 ? (
                  serverSummary!.blockedIPs.map((item) => (
                    <div key={item.ip} className="rounded-2xl border border-slate-200/70 bg-white/75 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-950">{item.ip}</div>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{item.reason}</p>
                          <p className="mt-2 text-xs text-slate-400">到期：{formatDate(item.expiresAt)}</p>
                        </div>
                        <ActionButton icon={Unlock} variant="secondary" className="px-3" onClick={() => void handleUnblockIP(item.ip)}>
                          解封
                        </ActionButton>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                    暂无有效封禁 IP。
                  </div>
                )}
              </div>
            </section>

            <section className={panelClass}>
              <SectionTitle title="分布概览" description="事件类型、严重级别与高频来源。" icon={Activity} tone="sky" />
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">By Type</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(serverSummary?.byType ?? {}).length > 0 ? (
                      Object.entries(serverSummary!.byType).map(([type, count]) => (
                        <span key={type} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses.sky.badge}`}>
                          {type} · {count}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">暂无数据</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">By Severity</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(serverSummary?.bySeverity ?? {}).length > 0 ? (
                      Object.entries(serverSummary!.bySeverity).map(([severity, count]) => (
                        <span key={severity} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClasses[(severity as ServerTamperEvent['severity']) || 'low'] ?? severityClasses.low}`}>
                          {severity} · {count}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">暂无数据</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Top IP</div>
                  <div className="space-y-2">
                    {(serverSummary?.topIPs ?? []).length > 0 ? (
                      serverSummary!.topIPs.map((item) => (
                        <div key={item.ip} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm">
                          <span className="truncate font-medium text-slate-700">{item.ip}</span>
                          <span className="text-slate-500">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">暂无数据</span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className={panelClass}>
            <SectionTitle title="完整性检查" description="触发本地完整性检查并查看结果。" icon={Shield} tone="slate" />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={CheckCircle} tone="sky" onClick={() => void handleCheck('all')} disabled={isLoading}>
                {isLoading ? '检查中...' : '全面检查'}
              </ActionButton>
              <ActionButton icon={ShieldCheck} tone="emerald" onClick={() => void handleCheck('dom')} disabled={isLoading}>
                DOM 检查
              </ActionButton>
              <ActionButton icon={FileWarning} tone="amber" onClick={() => void handleCheck('text')} disabled={isLoading}>
                文本检查
              </ActionButton>
              <ActionButton icon={Activity} tone="violet" onClick={() => void handleCheck('network')} disabled={isLoading}>
                网络检查
              </ActionButton>
            </div>
            <ActionButton icon={Database} variant="secondary" className="mt-2 w-full" onClick={() => void handleCheck('baseline')} disabled={isLoading}>
              基准检查
            </ActionButton>
            {checkResult && (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${checkResult.success ? toneClasses.emerald.badge : toneClasses.rose.badge}`}>
                <div className="font-semibold">检查结果：{checkResult.success ? '通过' : '失败'}</div>
                {checkResult.results?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc">
                    {checkResult.results.map((result: any, index: number) => (
                      <li key={index}>{result.type}: {result.message || JSON.stringify(result)}</li>
                    ))}
                  </ul>
                )}
                {checkResult.errors?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc">
                    {checkResult.errors.map((error: string, index: number) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <SectionTitle title="检测器控制" description="暂停、恢复、禁用或重新初始化前端检测器。" icon={TerminalSquare} tone="slate" />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={Pause} tone="amber" onClick={() => handleControl('pause')}>
                暂停
              </ActionButton>
              <ActionButton icon={Play} tone="emerald" onClick={() => handleControl('resume')}>
                恢复
              </ActionButton>
              <ActionButton icon={XCircle} variant="danger" onClick={() => handleControl('disable')}>
                禁用
              </ActionButton>
              <ActionButton icon={RotateCcw} tone="sky" onClick={() => handleControl('reinit')}>
                重初始化
              </ActionButton>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <ActionButton icon={RotateCcw} tone="sky" onClick={() => handleRecovery('soft')}>
                软恢复
              </ActionButton>
              <ActionButton icon={AlertTriangle} variant="danger" onClick={() => handleRecovery('emergency')}>
                紧急恢复
              </ActionButton>
              <ActionButton icon={Database} tone="emerald" onClick={() => handleRecovery('baseline')}>
                重捕获基准
              </ActionButton>
            </div>
          </section>

          <section className={panelClass}>
            <SectionTitle title="测试上报" description="模拟不同篡改类型，验证签名上报与后端处置链路。" icon={Zap} tone="amber" />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={ShieldAlert} tone="amber" onClick={() => handleSimulate('dom')}>
                DOM 篡改
              </ActionButton>
              <ActionButton icon={Activity} tone="violet" onClick={() => handleSimulate('network')}>
                网络篡改
              </ActionButton>
              <ActionButton icon={ShieldOff} tone="rose" onClick={() => handleSimulate('proxy')}>
                代理篡改
              </ActionButton>
              <ActionButton icon={AlertTriangle} variant="danger" onClick={() => handleSimulate('injection')}>
                脚本注入
              </ActionButton>
            </div>
            <ActionButton icon={FileWarning} variant="secondary" className="mt-2 w-full" onClick={() => void handleReportTampering()}>
              手动报告篡改
            </ActionButton>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TamperDetectionDemo;
