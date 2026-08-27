import type { CrashGroup, FullCrashReport } from '@/api/crashReports';

const toMillis = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const formatTime = (value: string | number | null | undefined): string => {
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

export const formatRelativeTime = (value: string | number | null | undefined): string => {
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

export const formatDuration = (millis?: number): string => {
  if (!millis || !Number.isFinite(millis)) return '-';
  if (millis < 1000) return `${millis}ms`;
  if (millis < 60_000) return `${(millis / 1000).toFixed(1)}s`;
  return `${Math.floor(millis / 60_000)}m ${Math.round((millis % 60_000) / 1000)}s`;
};

export const shortKey = (key: string, length = 16): string =>
  key.length <= length ? key : `${key.slice(0, length)}…`;

export const isAnonymousSdkReport = (userId?: string): boolean => !!userId && userId.startsWith('sdk:');

export const sourceLabel = (userId?: string): string => {
  if (isAnonymousSdkReport(userId)) return '匿名 SDK';
  return userId ? 'Lumen 应用' : '未知来源';
};

export const topFrame = (cleanStack?: string[]): string => {
  const frame = cleanStack?.find((line) => line.trim().length > 0);
  return frame ? frame.trim() : '';
};

/** Frames belonging to the crashing app itself are the ones worth reading first. */
export const isAppFrame = (line: string, packageName?: string): boolean => {
  if (!packageName) return false;
  const root = packageName.split('.').slice(0, 3).join('.');
  return root.length > 0 && line.includes(root);
};

const section = (title: string, body: string | undefined | null): string =>
  body && body.trim().length > 0 ? `\n## ${title}\n${body.trim()}\n` : '';

/** Markdown-ish text so a report can be pasted straight into an issue tracker. */
export const buildReportText = (report: FullCrashReport): string => {
  const head = [
    `# 崩溃报告 ${report.reportId}`,
    `- 崩溃组：${report.groupKey}`,
    `- 异常类型：${report.exceptionType || '-'}`,
    `- 根因：${report.rootCause || '-'}`,
    `- 种类：${report.kind || '-'}`,
    `- 崩溃时间：${report.crashedAtText || formatTime(report.crashedAtMillis)}（${formatRelativeTime(report.crashedAtMillis)}）`,
    `- 包名：${report.packageName || '-'}  版本号：${report.versionCode}`,
    `- 线程：${report.threadName || '-'}  进程：${report.processName || '-'}`,
    `- 运行时长：${formatDuration(report.durationMillis)}`,
    `- 设备安装 ID：${report.deviceInstallationId || '-'}`,
    `- 来源：${sourceLabel(report.userId)}（${report.userId || '-'}）`,
    `- 作者：${report.authorName || '-'}${report.authorUrl ? ` <${report.authorUrl}>` : ''}`,
    `- 作者指纹：${report.authorFingerprint || '-'}`,
    `- 入库时间：${formatTime(report.receivedAt)}`,
  ].join('\n');

  return [
    head,
    section('精简堆栈', report.cleanStack?.join('\n')),
    section('堆栈跟踪', report.stackTrace),
    section('系统信息', report.systemInfo),
    section('最近事件', report.recentEvents?.map((event) => `- ${event}`).join('\n')),
  ].join('');
};

export const buildGroupReportsText = (groupKey: string, reports: FullCrashReport[]): string =>
  [
    `# 崩溃组 ${groupKey}`,
    `- 报告数：${reports.length}`,
    `- 时间范围：${describeTimeRange(reports)}`,
    '',
    reports.map(buildReportText).join('\n---\n\n'),
  ].join('\n');

export const buildGroupSummaryText = (group: CrashGroup): string =>
  [
    `# 崩溃组 ${group.groupKey}`,
    `- 风险：${group.risk}`,
    `- 崩溃次数：${group.count}`,
    `- 影响用户：${group.affectedUsers}`,
    `- 版本号：${group.versionCode}`,
    `- 最近发生：${formatTime(group.lastSeenAt)}（${formatRelativeTime(group.lastSeenAt)}）`,
    '',
    '## 堆栈摘要',
    group.cleanStack?.join('\n') || '（无）',
  ].join('\n');

export const stringifyJson = (value: unknown): string => JSON.stringify(value, null, 2);

export const describeTimeRange = (reports: FullCrashReport[]): string => {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const report of reports) {
    const millis = report.crashedAtMillis;
    if (!Number.isFinite(millis) || millis <= 0) continue;
    if (millis < earliest) earliest = millis;
    if (millis > latest) latest = millis;
  }
  if (!Number.isFinite(earliest)) return '-';
  if (earliest === latest) return formatTime(latest);
  return `${formatTime(earliest)} ~ ${formatTime(latest)}`;
};

export interface ReportsSummary {
  devices: number;
  versions: number[];
  sdkCount: number;
  appCount: number;
  latestMillis: number | null;
}

/** Single pass so a group with thousands of reports still renders cheaply. */
export const summarizeReports = (reports: FullCrashReport[]): ReportsSummary => {
  const devices = new Set<string>();
  const versions = new Set<number>();
  let sdkCount = 0;
  let appCount = 0;
  let latestMillis: number | null = null;

  for (const report of reports) {
    if (report.deviceInstallationId) devices.add(report.deviceInstallationId);
    if (Number.isFinite(report.versionCode)) versions.add(report.versionCode);
    if (isAnonymousSdkReport(report.userId)) sdkCount += 1;
    else if (report.userId) appCount += 1;
    const millis = report.crashedAtMillis;
    if (Number.isFinite(millis) && (latestMillis === null || millis > latestMillis)) {
      latestMillis = millis;
    }
  }

  return {
    devices: devices.size,
    versions: [...versions].sort((a, b) => b - a),
    sdkCount,
    appCount,
    latestMillis,
  };
};
