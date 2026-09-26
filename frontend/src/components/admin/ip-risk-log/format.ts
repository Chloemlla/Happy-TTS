import type {
  IpRiskCaller,
  IpRiskDecisionAction,
  IpRiskDecisionSource,
  IpRiskLevel,
} from '@/api/ipRiskLogs';

const toMillis = (value: string | number | Date | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const formatTime = (value: string | number | Date | null | undefined): string => {
  const millis = toMillis(value);
  if (millis === null) return '-';
  return new Date(millis).toLocaleString('zh-CN', { hour12: false });
};

const RELATIVE_UNITS: ReadonlyArray<[number, string]> = [
  [365 * 86_400_000, '年'],
  [30 * 86_400_000, '个月'],
  [86_400_000, '天'],
  [3_600_000, '小时'],
  [60_000, '分钟'],
];

export const formatRelativeTime = (value: string | number | Date | null | undefined): string => {
  const millis = toMillis(value);
  if (millis === null) return '-';
  const diff = Date.now() - millis;
  const abs = Math.abs(diff);
  if (abs < 60_000) return '刚刚';
  const suffix = diff >= 0 ? '前' : '后';
  for (const [size, label] of RELATIVE_UNITS) {
    if (abs >= size) return `${Math.floor(abs / size)} ${label}${suffix}`;
  }
  return '刚刚';
};

/** 上游单次调用的耗时。0 / 非法值按「未计时」处理（配额与未配置分支不发起上游请求）。 */
export const formatDurationMs = (millis?: number | null): string => {
  if (millis === null || millis === undefined || !Number.isFinite(millis)) return '-';
  if (millis <= 0) return '0ms';
  if (millis < 1000) return `${Math.round(millis)}ms`;
  return `${(millis / 1000).toFixed(2)}s`;
};

/** 缓存文档剩余 TTL；已过期返回「已过期」。 */
export const formatTtlRemaining = (expiresAt: string | null | undefined): string => {
  const millis = toMillis(expiresAt);
  if (millis === null) return '-';
  const remaining = millis - Date.now();
  if (remaining <= 0) return '已过期';
  const totalMinutes = Math.floor(remaining / 60_000);
  if (totalMinutes < 1) return `剩余 ${Math.max(1, Math.round(remaining / 1000))} 秒`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `剩余 ${minutes} 分钟`;
  if (hours < 48) return `剩余 ${hours} 小时 ${minutes} 分`;
  return `剩余 ${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
};

export const formatCount = (value?: number | null): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '-';

export const boolLabel = (value: boolean | null | undefined): string => {
  if (value === true) return '是';
  if (value === false) return '否';
  return '-';
};

export const shortText = (value: string | null | undefined, max = 24): string => {
  if (!value) return '-';
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

export const stringifyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '（无法序列化：含循环引用或不可序列化值）';
  }
};

/** 地理位置数值；null / NaN 都显示为「-」，不要显示 0 假装有值。 */
export const formatCoordinate = (value?: number | null): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '-';

export interface BadgeStyle {
  label: string;
  badgeClass: string;
  dotClass: string;
}

const SLATE: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
  dotClass: 'bg-slate-400',
};
const EMERALD: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  dotClass: 'bg-emerald-500',
};
const AMBER: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  dotClass: 'bg-amber-500',
};
const ORANGE: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
  dotClass: 'bg-orange-500',
};
const ROSE: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  dotClass: 'bg-rose-500',
};
const SKY: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
  dotClass: 'bg-sky-500',
};
const VIOLET: Omit<BadgeStyle, 'label'> = {
  badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
  dotClass: 'bg-violet-500',
};

/** risk 分数区间：<33 low / 33-65 medium / 66-84 high / >=85 critical（levelFromRisk）。 */
export const RISK_LEVEL_CONFIG: Record<IpRiskLevel, BadgeStyle> = {
  low: { label: '低风险', ...EMERALD },
  medium: { label: '中风险', ...AMBER },
  high: { label: '高风险', ...ORANGE },
  critical: { label: '极高风险', ...ROSE },
};

export const riskLevelStyle = (level?: IpRiskLevel | null): BadgeStyle =>
  (level && RISK_LEVEL_CONFIG[level]) || { label: level || '未知', ...SLATE };

/** 总开关徽标：未启用时后端任何分支都不外呼。 */
export const switchBadge = (enabled: boolean): BadgeStyle =>
  enabled ? { label: '已启用', ...EMERALD } : { label: '未启用（不外呼）', ...ROSE };

/** 检测项徽标：命中用红色，未命中用灰色。 */
export const detectionBadge = (label: string, hit: boolean): BadgeStyle =>
  hit ? { label, ...ROSE } : { label, ...SLATE };

/** `proxycheck_lookup_logs.status` 的全部取值。 */
export const LOOKUP_STATUS_LABELS: Record<string, string> = {
  ok: '上游成功',
  failed: '上游失败',
  deduped: 'in-flight 合并',
  quota_exhausted: '配额用尽',
  not_configured: '未配置密钥',
  cache: '已走缓存',
};

export const lookupStatusStyle = (status: string): BadgeStyle => {
  const label = LOOKUP_STATUS_LABELS[status] ?? (status || '未知');
  if (status === 'ok') return { label, ...EMERALD };
  if (status === 'deduped') return { label, ...SKY };
  if (status === 'quota_exhausted') return { label, ...AMBER };
  if (status === 'not_configured') return { label, ...SLATE };
  if (status === 'cache') return { label, ...VIOLET };
  if (status === 'failed') return { label, ...ROSE };
  return { label, ...SLATE };
};

export const LOOKUP_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'ok', label: '上游成功' },
  { value: 'failed', label: '上游失败' },
  { value: 'deduped', label: 'in-flight 合并' },
  { value: 'quota_exhausted', label: '配额用尽' },
  { value: 'not_configured', label: '未配置密钥' },
  { value: 'cache', label: '已走缓存' },
];

/**
 * `action` 是「实际交给前端的动作」，与 `shouldChallenge`（闸门判据）不是同一件事。
 * `report` 恒出现在 caller=api 的行上：GET /api/ip-risk 只上报结论，本身不拦截。
 */
export const ACTION_CONFIG: Record<IpRiskDecisionAction, BadgeStyle & { description: string }> = {
  report: {
    label: '仅上报',
    description: '调用方是 GET /api/ip-risk：只把风险结论返回给调用方，本次请求不做任何拦截。',
    ...SKY,
  },
  block: {
    label: '直接阻断',
    description: '风险分达到 blockRiskScore：闸门不再给验证机会，直接把该 IP 写进封禁表（前后端请求一起被拦）。',
    ...ROSE,
  },
  challenge: {
    label: '要求挑战',
    description: '首访闸门要求前端完成人机验证后可继续。',
    ...AMBER,
  },
  allow: {
    label: '放行',
    description: '首访闸门判定风险低于阈值且未命中挑战标志，直接放行。',
    ...EMERALD,
  },
  fail_open: {
    label: '失败放行',
    description: '上游不可用且配置为 failOpen=true：按放行处理（不阻塞业务）。',
    ...VIOLET,
  },
  fail_closed: {
    label: '失败拒绝',
    description: '上游不可用且配置为 failOpen=false：按拒绝处理。',
    ...ROSE,
  },
};

export const ACTION_ORDER: ReadonlyArray<IpRiskDecisionAction> = [
  'report',
  'block',
  'challenge',
  'allow',
  'fail_open',
  'fail_closed',
];

export const CALLER_LABELS: Record<IpRiskCaller, string> = {
  api: 'API 调用',
  first_visit_gate: '首访闸门',
  batch: '批量查询',
};

export const CALLER_HINTS: Record<IpRiskCaller, string> = {
  api: 'GET /api/ip-risk（src/controllers/ipRiskController.ts）',
  first_visit_gate: 'ipVerificationService.initializeSession → evaluateIpRisk（会真的拦截）',
  batch: 'getIpRiskBatch 内部调用，一次问多个 IP',
};

export const SOURCE_LABELS: Record<IpRiskDecisionSource, string> = {
  cache: '命中缓存',
  proxycheck: '上游 proxycheck.io',
  unavailable: '上游不可用',
};

export const SOURCE_HINTS: Record<IpRiskDecisionSource, string> = {
  cache: '结果来自 proxycheck_risk_cache，未消耗每日配额；本次判定已写成 status=cache 的日志行。',
  proxycheck: '本次真的向上游发起了查询并已扣减配额。',
  unavailable: '未配置密钥 / 配额用尽 / 上游报错 / 超时，未拿到结论。',
};

export const describeReason = (reason: string | null | undefined): string => {
  if (!reason) return '-';
  if (reason === 'proxycheck_unavailable') return 'proxycheck_unavailable（上游不可用）';
  const match = /^proxycheck_risk_(low|medium|high|critical)$/.exec(reason);
  if (match) return `${reason}（上游给出了 ${riskLevelStyle(match[1] as IpRiskLevel).label}结论）`;
  return reason;
};

export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100, 200];

export const DEFAULT_PAGE_SIZE = 50;

export const AUTO_REFRESH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '自动刷新：关' },
  { value: 15_000, label: '自动刷新：15 秒' },
  { value: 30_000, label: '自动刷新：30 秒' },
  { value: 60_000, label: '自动刷新：60 秒' },
];

export const DAYS_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
];

export const RISK_CACHE_STATE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'active', label: '仅生效中' },
  { value: 'expired', label: '仅已过期' },
  { value: 'all', label: '全部' },
];

export const DETECTION_FLAGS: ReadonlyArray<keyof DetectionBoolFields> = [
  'anonymous',
  'proxy',
  'vpn',
  'tor',
  'hosting',
  'scraper',
  'compromised',
];

interface DetectionBoolFields {
  anonymous: boolean;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  hosting: boolean;
  scraper: boolean;
  compromised: boolean;
}

export const DETECTION_LABELS: Record<keyof DetectionBoolFields, string> = {
  anonymous: '匿名',
  proxy: '代理',
  vpn: 'VPN',
  tor: 'Tor',
  hosting: '机房',
  scraper: '爬虫',
  compromised: '已失陷',
};

/** 只有这三项会触发挑战（CHALLENGE_FLAGS）；hosting 单独命中不挑战。 */
export const CHALLENGE_FLAGS: readonly string[] = ['vpn', 'proxy', 'tor'];

/** 服务端 computeProbeVerdict 实际会写入 flags 的全部取值（src/controllers/ipRiskController.ts）。 */
export const PROBE_FLAG_LABELS: Record<string, string> = {
  ipv4_vs_ws_mismatch: 'HTTP 出口 IP 与 WebSocket 出口 IP 不一致（两侧均为公网出口时才会命中）',
  ipv_vs_v6_mismatch: 'IPv4 出口与 IPv6 出口不一致（两侧均为公网出口时才会命中）',
  timezone_vs_geo_mismatch: '浏览器时区与 IP 地理位置不一致',
  webrtc_leak_reported: '客户端自报 WebRTC 泄漏（未采信，仅记录）',
  webdriver_reported: '客户端自报自动化特征 webdriver（未采信，仅记录）',
};

export const probeFlagLabel = (flag: string): string => PROBE_FLAG_LABELS[flag] ?? flag;
