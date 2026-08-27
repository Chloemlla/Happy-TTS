import type { CrashGroup, FullCrashReport } from '@/api/crashReports';
import { formatTime, sourceLabel, topFrame } from './format';

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
};

const csvRows = (header: string[], rows: unknown[][]): string =>
  [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

export const buildGroupsCsv = (groups: CrashGroup[]): string =>
  csvRows(
    ['groupKey', 'risk', 'count', 'affectedUsers', 'versionCode', 'lastSeenAt', 'topFrame'],
    groups.map((group) => [
      group.groupKey,
      group.risk,
      group.count,
      group.affectedUsers,
      group.versionCode,
      formatTime(group.lastSeenAt),
      topFrame(group.cleanStack),
    ]),
  );

export const buildReportsCsv = (reports: FullCrashReport[]): string =>
  csvRows(
    [
      'reportId',
      'crashedAt',
      'exceptionType',
      'rootCause',
      'kind',
      'threadName',
      'processName',
      'packageName',
      'versionCode',
      'deviceInstallationId',
      'source',
      'userId',
      'durationMillis',
    ],
    reports.map((report) => [
      report.reportId,
      report.crashedAtText || formatTime(report.crashedAtMillis),
      report.exceptionType,
      report.rootCause,
      report.kind,
      report.threadName,
      report.processName,
      report.packageName,
      report.versionCode,
      report.deviceInstallationId,
      sourceLabel(report.userId),
      report.userId,
      report.durationMillis,
    ]),
  );

export const downloadTextFile = (
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Excel only detects UTF-8 CSV when a BOM is present. */
export const downloadCsvFile = (filename: string, csv: string): void =>
  downloadTextFile(filename, '\ufeff' + csv, 'text/csv;charset=utf-8');

export const downloadJsonFile = (filename: string, value: unknown): void =>
  downloadTextFile(filename, JSON.stringify(value, null, 2), 'application/json;charset=utf-8');

export const fileStamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
