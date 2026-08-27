import type { CrashGroupSort } from '@/api/crashReports';

export type SourceFilter = '' | 'sdk' | 'app';

export type RiskFilter = '' | 'high' | 'medium' | 'low';

export type SortOrder = 'asc' | 'desc';

export type ReportSortKey = 'recent' | 'oldest' | 'exception';

export const SOURCE_TABS: ReadonlyArray<{ key: SourceFilter; label: string }> = [
  { key: '', label: '全部来源' },
  { key: 'sdk', label: '匿名 SDK' },
  { key: 'app', label: 'Lumen 应用' },
];

export const RISK_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  high: { label: '高危', dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: '中危', dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { label: '低危', dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export const RISK_FILTERS: ReadonlyArray<{ key: RiskFilter; label: string }> = [
  { key: '', label: '全部风险' },
  { key: 'high', label: '高危' },
  { key: 'medium', label: '中危' },
  { key: 'low', label: '低危' },
];

export const GROUP_SORTS: ReadonlyArray<{ key: CrashGroupSort; label: string }> = [
  { key: 'lastSeenAt', label: '最近发生' },
  { key: 'count', label: '崩溃次数' },
  { key: 'affectedUsers', label: '影响用户' },
  { key: 'risk', label: '风险等级' },
  { key: 'versionCode', label: '版本号' },
];

export const REPORT_SORTS: ReadonlyArray<{ key: ReportSortKey; label: string }> = [
  { key: 'recent', label: '最新在前' },
  { key: 'oldest', label: '最早在前' },
  { key: 'exception', label: '异常类型' },
];

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

export const AUTO_REFRESH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '自动刷新：关' },
  { value: 15_000, label: '自动刷新：15 秒' },
  { value: 30_000, label: '自动刷新：30 秒' },
  { value: 60_000, label: '自动刷新：60 秒' },
];

export const DEFAULT_PAGE_SIZE = 25;

export const REPORT_PAGE_SIZE = 50;

export interface GroupQueryState {
  offset: number;
  pageSize: number;
  source: SourceFilter;
  risk: RiskFilter;
  search: string;
  device: string;
  sort: CrashGroupSort;
  order: SortOrder;
}

export const INITIAL_GROUP_QUERY: GroupQueryState = {
  offset: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  source: '',
  risk: '',
  search: '',
  device: '',
  sort: 'lastSeenAt',
  order: 'desc',
};
