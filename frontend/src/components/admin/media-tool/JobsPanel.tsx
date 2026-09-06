import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaChevronDown,
  FaChevronRight,
  FaDownload,
  FaExclamationTriangle,
  FaEye,
  FaFileAlt,
  FaHistory,
  FaRedo,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import { mediaToolApi } from '../../../api/mediaTool';
import type { MediaJobRecord, MediaTarget } from '../../../api/mediaTool';
import { InfoSectionTitle, logSharePanelClass } from '../../LogShareStyleScaffold';
import { SimpleLoadingSpinner } from '../../LoadingSpinner';
import {
  EmptyHint,
  ErrLine,
  OkLine,
  ProgressBar,
  StatusBadge,
  btnTiny,
  baseName,
  cx,
  fmtTime,
  stageLabel,
} from './ui';

const TEXT_EXTS = new Set(['.txt', '.srt', '.json', '.vtt']);
const isTextRel = (rel: string) => TEXT_EXTS.has(rel.slice(rel.lastIndexOf('.')).toLowerCase());

const KIND_LABEL: Record<string, string> = {
  'bili-download': 'B站下载',
  transcribe: '转写',
};

/**
 * 任务历史:~2.5s 轮询列表,运行中自动刷新详情与实时日志。
 * 支持取消 / 重试 / 删除(超级管理员),产物可预览文本或直接下载。
 */
export const JobsPanel: React.FC<{ target: MediaTarget }> = ({ target }) => {
  const [jobs, setJobs] = useState<MediaJobRecord[]>([]);
  const [detail, setDetail] = useState<Record<string, MediaJobRecord>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const polling = useRef(false);

  const refreshList = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const list = await mediaToolApi.listJobs(target, 40);
      setJobs(list);
      setError(null);
    } catch (err) {
      setError('加载任务失败:请确认目标后端已启动且连接配置正确。');
      console.error('加载媒体工具任务列表失败:', err);
    } finally {
      polling.current = false;
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void refreshList();
    const timer = window.setInterval(() => {
      void refreshList();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refreshList]);

  // 展开的运行任务:跟随轮询刷新详情
  useEffect(() => {
    const active = expandedId
      ? (detail[expandedId] ?? jobs.find((j) => j.id === expandedId))
      : undefined;
    if (!expandedId || !active || (active.status !== 'queued' && active.status !== 'running')) return;
    const timer = window.setTimeout(() => {
      void mediaToolApi
        .getJob(target, expandedId)
        .then((j) => {
          if (j) setDetail((d) => ({ ...d, [j.id]: j }));
        })
        .catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [expandedId, detail, jobs, target]);

  const act = async (action: 'cancel' | 'retry' | 'delete', job: MediaJobRecord) => {
    setPendingAction(`${action}:${job.id}`);
    setError(null);
    setFlash(null);
    try {
      if (action === 'cancel') await mediaToolApi.cancelJob(target, job.id);
      else if (action === 'retry') await mediaToolApi.retryJob(target, job.id);
      else await mediaToolApi.deleteJob(target, job.id);
      if (action === 'delete') {
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        setDetail((d) => {
          const next = { ...d };
          delete next[job.id];
          return next;
        });
      } else {
        setFlash(action === 'cancel' ? '已请求取消。' : '已重新入队。');
        await refreshList();
      }
    } catch (err) {
      setError(action === 'delete' ? '删除失败(需超级管理员;运行中的任务需先取消)。' : '操作失败,请稍后重试。');
      console.error('任务操作失败:', err);
    } finally {
      setPendingAction(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (expandedId !== id) {
      void mediaToolApi
        .getJob(target, id)
        .then((j) => {
          if (j) setDetail((d) => ({ ...d, [j.id]: j }));
        })
        .catch(() => undefined);
    }
  };

  const openPreview = async (rel: string) => {
    try {
      const text = await mediaToolApi.fetchText(target, rel);
      setPreview({ title: rel, text });
    } catch (err) {
      setError(`读取 ${rel} 失败。`);
      console.error('读取文本文件失败:', err);
    }
  };

  const doDownload = (rel: string) => {
    void mediaToolApi.downloadFile(target, rel, baseName(rel)).catch((err) => {
      setError(`下载 ${rel} 失败。`);
      console.error('下载失败:', err);
    });
  };

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  return (
    <div className="space-y-4">
      <InfoSectionTitle
        title="任务历史"
        description="本页每 2.5 秒轮询一次队列;点开任务可看实时日志与全部产物(文本可预览、媒体可下载)。"
        icon={FaHistory}
        tone="slate"
        action={
          <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700">
            {activeCount} 进行中
          </span>
        }
      />

      {error ? (
        <ErrLine>
          <FaExclamationTriangle className="text-rose-500" />
          {error}
        </ErrLine>
      ) : null}
      {flash ? <OkLine>{flash}</OkLine> : null}

      <div className="space-y-2">
        {loading && jobs.length === 0 ? (
          <div className="flex justify-center py-14">
            <SimpleLoadingSpinner size={1} />
          </div>
        ) : jobs.length === 0 ? (
          <div className={`${logSharePanelClass} overflow-hidden`}>
            <EmptyHint>还没有任务。到「B站下载」或「转写」页提交第一个任务。</EmptyHint>
          </div>
        ) : (
          jobs.map((job) => {
            const full = detail[job.id] ?? job;
            const isActive = job.status === 'queued' || job.status === 'running';
            const expanded = expandedId === job.id;
            const showRetry = job.status === 'failed' || job.status === 'cancelled';
            const files = full.result?.files ?? [];
            const items = full.result?.items ?? [];
            const failedItems = items.filter((it) => !it.ok);
            return (
              <div key={job.id} className={`${logSharePanelClass} overflow-hidden`}>
                <div
                  className={cx(
                    'flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3',
                    expanded ? 'bg-slate-50/70' : 'hover:bg-slate-50/50',
                  )}
                  onClick={() => toggleExpand(job.id)}
                >
                  <span className="text-slate-300">
                    {expanded ? <FaChevronDown className="text-xs" /> : <FaChevronRight className="text-xs" />}
                  </span>
                  <StatusBadge status={job.status} pulse />
                  <span className="text-xs font-semibold text-slate-700">{KIND_LABEL[job.kind] ?? job.kind}</span>
                  <span className="max-w-[220px] truncate font-mono text-[10px] text-slate-400">{job.id}</span>
                  {isActive ? (
                    <div className="flex min-w-[140px] flex-1 items-center gap-2">
                      <span className="whitespace-nowrap text-[10px] text-slate-400">{stageLabel(full.stage)}</span>
                      <ProgressBar percent={job.progress} />
                      <span className="whitespace-nowrap font-mono text-[10px] text-slate-500">{job.progress}%</span>
                    </div>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {job.result?.summary ?? job.error ?? '—'}
                    </span>
                  )}
                  <span className="whitespace-nowrap text-[10px] text-slate-400">
                    {fmtTime(job.createdAt)} · {job.createdBy}
                  </span>
                  {/* 动作(阻止行点击) */}
                  <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isActive ? (
                      <button
                        onClick={() => void act('cancel', job)}
                        disabled={pendingAction !== null || job.cancelRequested}
                        className={cx(btnTiny, 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100')}
                      >
                        {pendingAction === `cancel:${job.id}` ? <SimpleLoadingSpinner size={0.6} /> : <FaTimes className="text-[10px]" />}
                        {job.cancelRequested ? '取消中…' : '取消'}
                      </button>
                    ) : showRetry ? (
                      <button
                        onClick={() => void act('retry', job)}
                        disabled={pendingAction !== null}
                        className={cx(btnTiny, 'border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100')}
                      >
                        {pendingAction === `retry:${job.id}` ? <SimpleLoadingSpinner size={0.6} /> : <FaRedo className="text-[10px]" />}
                        重试
                      </button>
                    ) : null}
                    <button
                      onClick={() => void act('delete', job)}
                      disabled={pendingAction !== null || isActive}
                      className={cx(btnTiny, 'border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600', isActive && 'cursor-not-allowed opacity-40')}
                      title={isActive ? '运行中的任务需先取消' : '删除记录(需超级管理员)'}
                    >
                      {pendingAction === `delete:${job.id}` ? <SimpleLoadingSpinner size={0.6} /> : <FaTrash className="text-[10px]" />}
                      删除
                    </button>
                  </span>
                </div>

                {expanded ? (
                  <div className="space-y-3 border-t border-slate-100 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {failedItems.length > 0 ? (
                      <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {failedItems.map((it) => (
                          <div key={it.label} className="flex gap-2 py-0.5">
                            <span className="shrink-0 font-medium">✗ {it.label}</span>
                            <span className="truncate text-rose-500">{it.error}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {files.length > 0 ? (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          产物 ({files.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {files.map((rel) => (
                            <span key={rel} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                              <FaFileAlt className={cx('text-[10px]', isTextRel(rel) ? 'text-sky-400' : 'text-emerald-500')} />
                              <span className="max-w-[220px] truncate font-mono text-[11px] text-slate-600">{rel}</span>
                              {isTextRel(rel) ? (
                                <button
                                  onClick={() => void openPreview(rel)}
                                  className="ml-0.5 text-slate-400 transition hover:text-indigo-600"
                                  title="查看文本"
                                >
                                  <FaEye className="text-[11px]" />
                                </button>
                              ) : null}
                              <button
                                onClick={() => doDownload(rel)}
                                className="ml-0.5 text-slate-400 transition hover:text-indigo-600"
                                title="下载"
                              >
                                <FaDownload className="text-[11px]" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        实时日志
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-100">
                        {full.logs.length === 0
                          ? '（暂无日志）'
                          : full.logs
                              .map((l) => `[${fmtTime(l.t)}] ${l.text}`)
                              .join('\n')}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPreview(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="truncate font-mono text-xs text-slate-700">{preview.title}</div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">
                <FaTimes />
              </button>
            </div>
            <pre className="min-h-[40vh] flex-1 overflow-auto whitespace-pre-wrap bg-slate-50 px-4 py-3 font-mono text-xs leading-6 text-slate-700">
              {preview.text}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default JobsPanel;
