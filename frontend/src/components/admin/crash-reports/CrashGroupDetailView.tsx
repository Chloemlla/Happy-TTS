import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaArrowLeft,
  FaBug,
  FaChevronDown,
  FaChevronUp,
  FaClock,
  FaLayerGroup,
  FaMobileAlt,
  FaSync,
  FaTimes,
  FaUsers,
} from 'react-icons/fa';
import type { FullCrashReport } from '@/api/crashReports';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  logShareInputClass,
} from '@/components/LogShareStyleScaffold';
import { REPORT_SORTS, type ReportSortKey } from './constants';
import {
  buildGroupReportsText,
  buildReportText,
  describeTimeRange,
  formatDuration,
  formatRelativeTime,
  formatTime,
  isAnonymousSdkReport,
  shortKey,
  sourceLabel,
  stringifyJson,
  summarizeReports,
} from './format';
import { buildReportsCsv, downloadCsvFile, downloadJsonFile, downloadTextFile, fileStamp } from './exporters';
import { CollapsibleBlock, CopyButton, DetailField, DownloadButton, ToolbarSelect } from './ui';

interface Props {
  groupKey: string;
  reports: FullCrashReport[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  lastUpdatedAt: number | null;
  deviceFilter: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onRefresh: () => void;
  onFilterDevice: (deviceInstallationId: string) => void;
  onLoadMore: () => void;
}

const matchesTerm = (report: FullCrashReport, term: string): boolean =>
  [
    report.reportId,
    report.exceptionType,
    report.rootCause,
    report.kind,
    report.threadName,
    report.processName,
    report.packageName,
    report.deviceInstallationId,
    report.userId,
    report.stackTrace,
  ].some((field) => (field || '').toLowerCase().includes(term));

const sortReports = (reports: FullCrashReport[], key: ReportSortKey): FullCrashReport[] => {
  if (key === 'recent') return reports;
  const copy = [...reports];
  if (key === 'oldest') return copy.reverse();
  return copy.sort((a, b) => (a.exceptionType || '').localeCompare(b.exceptionType || ''));
};

const CrashGroupDetailView: React.FC<Props> = ({
  groupKey,
  reports,
  total,
  loading,
  loadingMore,
  lastUpdatedAt,
  deviceFilter,
  searchInputRef,
  onBack,
  onRefresh,
  onFilterDevice,
  onLoadMore,
}) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ReportSortKey>('recent');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSearch('');
    setExpandedIds(new Set());
  }, [groupKey]);

  const summary = useMemo(() => summarizeReports(reports), [reports]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term ? reports.filter((report) => matchesTerm(report, term)) : reports;
    return sortReports(filtered, sort);
  }, [reports, search, sort]);

  const allExpanded = visible.length > 0 && visible.every((report) => expandedIds.has(report.reportId));

  const toggleExpanded = (reportId: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });

  return (
    <InfoQueryShell>
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
        >
          <FaArrowLeft /> 返回崩溃组列表（Esc）
        </button>
      </div>

      <InfoQueryHero
        eyebrow="崩溃报告详情"
        title={`崩溃组 ${shortKey(groupKey, 20)}`}
        description={`已加载 ${reports.length} / 共 ${total} 条报告。时间范围：${describeTimeRange(reports)}`}
        icon={FaBug}
        meta={
          <>
            <InfoBadge>{lastUpdatedAt ? `更新于 ${formatRelativeTime(lastUpdatedAt)}` : '尚未加载'}</InfoBadge>
            {deviceFilter ? <InfoBadge>仅设备 {shortKey(deviceFilter, 16)}</InfoBadge> : null}
            <InfoBadge>匿名 SDK {summary.sdkCount} 条</InfoBadge>
            <InfoBadge>Lumen 应用 {summary.appCount} 条</InfoBadge>
          </>
        }
        actions={
          <>
            <CopyButton
              getValue={() => groupKey}
              label="复制 groupKey"
              message="已复制 groupKey"
              className="px-4 py-2.5 text-sm"
            />
            <InfoPrimaryButton onClick={onRefresh} disabled={loading}>
              <FaSync className={loading ? 'animate-spin' : ''} /> 刷新
            </InfoPrimaryButton>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoMetricCard label="报告总数" value={total.toLocaleString()} detail={`已加载 ${reports.length} 条`} icon={FaLayerGroup} />
        <InfoMetricCard label="涉及设备" value={summary.devices.toLocaleString()} icon={FaMobileAlt} />
        <InfoMetricCard
          label="涉及版本"
          value={summary.versions.length}
          detail={summary.versions.length > 0 ? `v${summary.versions.join(' / v')}` : undefined}
          icon={FaUsers}
        />
        <InfoMetricCard
          label="最近一次"
          value={formatRelativeTime(summary.latestMillis)}
          detail={summary.latestMillis ? formatTime(summary.latestMillis) : undefined}
          icon={FaClock}
        />
      </div>

      <InfoPanel className="mt-6" compact>
        <div className="relative">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearch('');
            }}
            placeholder="在已加载报告中搜索异常类型 / 根因 / 设备 / 线程 / 堆栈"
            className={logShareInputClass}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="清空搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <FaTimes />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ToolbarSelect
            title="报告排序"
            value={sort}
            options={REPORT_SORTS.map((item) => ({ value: item.key, label: `排序：${item.label}` }))}
            onChange={(value) => setSort(value as ReportSortKey)}
          />
          <button
            type="button"
            onClick={() =>
              setExpandedIds(allExpanded ? new Set() : new Set(visible.map((report) => report.reportId)))
            }
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
          >
            {allExpanded ? <FaChevronUp /> : <FaChevronDown />}
            {allExpanded ? '折叠全部' : '展开全部'}
          </button>
          <CopyButton
            getValue={() => buildGroupReportsText(groupKey, visible)}
            label="复制全部报告"
            message={`已复制 ${visible.length} 条完整崩溃报告`}
          />
          <CopyButton
            getValue={() => stringifyJson(visible)}
            label="复制 JSON"
            message="已复制报告 JSON"
          />
          <DownloadButton
            label="导出 CSV"
            onDownload={() => downloadCsvFile(`crash-reports-${fileStamp()}.csv`, buildReportsCsv(visible))}
          />
          <DownloadButton
            label="导出 JSON"
            onDownload={() => downloadJsonFile(`crash-reports-${fileStamp()}.json`, visible)}
          />
          <span className="text-xs text-slate-400">
            显示 {visible.length} / 已加载 {reports.length} 条
          </span>
        </div>
      </InfoPanel>

      <div className="mt-6 space-y-4">
        {loading && reports.length === 0 ? (
          <InfoPanel>
            <div className="p-8 text-center text-slate-400">加载中...</div>
          </InfoPanel>
        ) : visible.length === 0 ? (
          <InfoPanel>
            <div className="p-8 text-center text-slate-400">
              {search ? '没有匹配的崩溃报告' : deviceFilter ? '该设备在此崩溃组下没有报告' : '暂无崩溃报告'}
            </div>
          </InfoPanel>
        ) : (
          visible.map((report) => (
            <ReportCard
              key={report.reportId}
              report={report}
              expanded={expandedIds.has(report.reportId)}
              onToggle={() => toggleExpanded(report.reportId)}
              onFilterDevice={onFilterDevice}
            />
          ))
        )}
      </div>

      {reports.length < total ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-50"
          >
            <FaSync className={loadingMore ? 'animate-spin' : ''} />
            加载更多（剩余 {total - reports.length} 条）
          </button>
        </div>
      ) : null}
    </InfoQueryShell>
  );
};

const ReportCard: React.FC<{
  report: FullCrashReport;
  expanded: boolean;
  onToggle: () => void;
  onFilterDevice: (deviceInstallationId: string) => void;
}> = ({ report, expanded, onToggle, onFilterDevice }) => {
  const crashedAt = report.crashedAtText || formatTime(report.crashedAtMillis);
  const recentEvents = report.recentEvents ?? [];

  return (
    <InfoPanel compact>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              {report.exceptionType || 'Unknown'}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                isAnonymousSdkReport(report.userId)
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-sky-50 text-sky-700'
              }`}
            >
              {sourceLabel(report.userId)}
            </span>
            {report.kind ? (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{report.kind}</span>
            ) : null}
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">v{report.versionCode}</span>
            <span className="text-xs text-slate-400" title={crashedAt}>
              <FaClock className="mr-1 inline" />
              {formatRelativeTime(report.crashedAtMillis)}
            </span>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800">{report.rootCause || '未知原因'}</div>
        </button>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <CopyButton
            getValue={() => buildReportText(report)}
            label="一键复制完整报告"
            message="已复制完整崩溃报告"
            className="!border-slate-900 !bg-slate-900 !text-white hover:!border-slate-800 hover:!text-white"
          />
          <CopyButton getValue={() => stringifyJson(report)} label="复制 JSON" message="已复制报告 JSON" />
          <DownloadButton
            label="下载 TXT"
            onDownload={() => downloadTextFile(`crash-${report.reportId}.txt`, buildReportText(report))}
          />
          <button
            type="button"
            title={expanded ? '折叠详情' : '展开详情'}
            onClick={onToggle}
            className="rounded-2xl border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-500 transition hover:border-slate-300"
          >
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
      </div>

      {expanded ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-xs"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
            <DetailField label="报告 ID" value={report.reportId} copyValue={report.reportId} />
            <DetailField label="来源用户 ID" value={report.userId} copyValue={report.userId} />
            <DetailField label="异常类型" value={report.exceptionType} copyValue={report.exceptionType} />
            <DetailField label="种类" value={report.kind} />
            <DetailField label="线程" value={report.threadName} />
            <DetailField label="进程" value={report.processName} />
            <DetailField label="包名" value={report.packageName} copyValue={report.packageName} />
            <DetailField label="版本号" value={String(report.versionCode)} />
            <DetailField
              label="设备 ID"
              value={
                report.deviceInstallationId ? (
                  <>
                    {report.deviceInstallationId}
                    <button
                      type="button"
                      onClick={() => onFilterDevice(report.deviceInstallationId)}
                      title="按此设备筛选全部崩溃组"
                      className="ml-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <FaMobileAlt className="h-2.5 w-2.5" />
                      只看此设备
                    </button>
                  </>
                ) : (
                  ''
                )
              }
              copyValue={report.deviceInstallationId}
            />
            <DetailField label="作者" value={report.authorName} />
            <DetailField label="作者指纹" value={report.authorFingerprint} copyValue={report.authorFingerprint} />
            <DetailField label="运行时长" value={formatDuration(report.durationMillis)} />
            <DetailField
              label="崩溃时间"
              value={crashedAt}
              hint={formatRelativeTime(report.crashedAtMillis)}
            />
            <DetailField label="入库时间" value={formatTime(report.receivedAt)} />
            <DetailField label="崩溃组" value={shortKey(report.groupKey, 16)} copyValue={report.groupKey} />
          </div>

          {report.rootCause ? (
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <span className="text-slate-500">根因：</span>
                <span className="break-all text-slate-700">{report.rootCause}</span>
              </div>
              <CopyButton getValue={() => report.rootCause} label="复制根因" message="已复制根因" />
            </div>
          ) : null}

          {report.stackTrace ? (
            <CollapsibleBlock
              label="堆栈跟踪"
              value={report.stackTrace}
              packageName={report.packageName}
              defaultOpen
              onDownload={() =>
                downloadTextFile(`crash-${report.reportId}-stacktrace.txt`, report.stackTrace)
              }
            />
          ) : null}

          {report.cleanStack && report.cleanStack.length > 0 ? (
            <CollapsibleBlock
              label="精简堆栈"
              value={report.cleanStack.join('\n')}
              packageName={report.packageName}
            />
          ) : null}

          {report.systemInfo ? <CollapsibleBlock label="系统信息" value={report.systemInfo} /> : null}

          {recentEvents.length > 0 ? (
            <CollapsibleBlock label="最近事件" value={recentEvents.join('\n')} />
          ) : null}
        </motion.div>
      ) : null}
    </InfoPanel>
  );
};

export default CrashGroupDetailView;
