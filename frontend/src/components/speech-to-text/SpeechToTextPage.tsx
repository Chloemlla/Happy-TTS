import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaExclamationTriangle,
  FaFileAudio,
  FaMicrophone,
  FaPlay,
  FaRedo,
  FaTimes,
  FaTrash,
  FaUpload,
} from 'react-icons/fa';
import {
  OUTPUT_LABELS,
  transcribeApi,
  type TranscribeConfig,
  type TranscribeOutput,
  type TranscriptItem,
} from '../../api/transcribe';
import type { MediaJobRecord } from '../../api/mediaTool';
import { SimpleLoadingSpinner } from '../LoadingSpinner';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  studioPrimaryButtonClassName,
  studioSecondaryButtonClassName,
  studioSubPanelClassName,
  studioSurfaceClassName,
} from '../studioTheme';
import { cn } from '../../utils/cn';
import { fmtBytes } from '../admin/media-tool/ui';
import TranscriptView from './TranscriptView';

const OUTPUT_ORDER: TranscribeOutput[] = ['plain', 'timed', 'srt'];

/**
 * 上传失败时把后端原文抽出来。axios 默认头会把 FormData 序列成 JSON，
 * 后端 multer 拿不到 part 时会回「未收到文件」，原文里带着这个区分度。
 */
function describeUploadError(err: unknown): string | null {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  const message = data?.error || data?.message || '';
  if (/未收到文件/.test(message)) {
    return '上传没到达后端文件解析环节（请求被当成 JSON 发出去了）。请硬刷新页面重试；若仍失败，说明前端构建产物不是最新版。';
  }
  return message || null;
}

const STAGE_LABEL: Record<string, string> = {
  queued: '排队',
  prepare: '准备',
  create: '创建会话',
  upload: '上传中',
  run: '启动识别',
  progress: '识别中',
  result: '取结果',
  transcribe: '转写中',
  finalize: '收尾',
};

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '转写中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/**
 * `/transcribe` — 语音转文本(核心功能)。
 *
 * 对外只讲能力:上传音频 → 选产物 → 看分段结果。引擎、参数、限额都留在服务端。
 * 文件作用域由后端锁在用户自己的目录内,前端拿到的都是相对自己目录的路径。
 */
export const SpeechToTextPage: React.FC = () => {
  const [config, setConfig] = useState<TranscribeConfig | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<TranscribeOutput[]>(['plain']);
  const [jobs, setJobs] = useState<MediaJobRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptItem[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const loadedOnce = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await transcribeApi.config();
      setConfig(cfg);
      setOutputs((prev) => (prev.length ? prev : cfg.limits.defaultOutputs.length ? cfg.limits.defaultOutputs : ['plain']));
      if (!cfg.enabled && cfg.notice) setError(cfg.notice);
    } catch (err) {
      console.error('加载语音转文本配置失败:', err);
      setError('加载配置失败,请检查登录状态或稍后重试。');
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await transcribeApi.listJobs(20));
    } catch (err) {
      console.error('加载我的转写任务失败:', err);
    }
  }, []);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadConfig();
    void loadJobs();
  }, [loadConfig, loadJobs]);

  // 有任务在跑就轮询;全部终态自动停轮,避免空转
  const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = window.setInterval(() => void loadJobs(), 3000);
    return () => window.clearInterval(timer);
  }, [hasActive, loadJobs]);

  const openJob = useCallback(async (id: string) => {
    try {
      const detail = await transcribeApi.getJob(id);
      setTranscripts((prev) => ({ ...prev, [id]: detail.transcripts }));
    } catch (err) {
      console.error('加载转写详情失败:', err);
    }
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    if (transcripts[expandedId]) return;
    void openJob(expandedId);
  }, [expandedId, transcripts, openJob]);

  const toggleOutput = (value: TranscribeOutput) =>
    setOutputs((prev) => (prev.includes(value) ? prev.filter((o) => o !== value) : [...prev, value]));

  const addChosen = (rel: string) => setChosen((prev) => (prev.includes(rel) ? prev : [...prev, rel]));

  const onFilesPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      for (const file of files) {
        setUploading(file.name);
        const up = await transcribeApi.upload(file);
        addChosen(up.rel);
      }
      setNotice(`已上传 ${files.length} 个音频,点「开始转写」提交任务。`);
    } catch (err) {
      console.error('上传音频失败:', err);
      setError(describeUploadError(err) || '上传失败:请确认文件为受支持音频且未超过大小上限。');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const job = await transcribeApi.createJob(chosen, outputs);
      setNotice(`任务已提交(${job.id}),可以关页面,回来还在。`);
      setChosen([]);
      await loadJobs();
      if (config) setConfig({ ...config, limits: { ...config.limits, activeJobs: config.limits.activeJobs + 1 } });
    } catch (err) {
      console.error('提交转写任务失败:', err);
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || '提交失败:请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'cancel' | 'retry' | 'delete', id: string) => {
    try {
      if (action === 'cancel') await transcribeApi.cancelJob(id);
      else if (action === 'retry') {
        await transcribeApi.retryJob(id);
        setTranscripts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        if (!window.confirm('删除该任务?转写正文与产物文件(txt / 时间线 / srt / json)会一并删除,已上传的音频保留。此操作不可恢复。')) return;
        await transcribeApi.deleteJob(id);
        setJobs((prev) => prev.filter((j) => j.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
      await loadJobs();
    } catch (err) {
      console.error('任务操作失败:', err);
      setError('操作失败,请稍后重试。');
    }
  };

  const limits = config?.limits;
  const meta = useMemo(
    () => (
      <>
        <InfoBadge tone="violet">最长 500MB / 个</InfoBadge>
        <InfoBadge tone="sky">单任务 {limits?.maxFilesPerJob ?? '-'} 个文件</InfoBadge>
        <InfoBadge tone="emerald">同时 {limits?.maxActiveJobs ?? '-'} 个任务</InfoBadge>
        <InfoBadge tone="amber">支持 {limits?.acceptedExts.length ?? 0} 种音频格式</InfoBadge>
      </>
    ),
    [limits],
  );

  return (
    <InfoQueryShell>
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="SPEECH TO TEXT"
          title="语音转文本"
          description="把录音交给平台转成文字:长录音也不用守在页面上等,结果可按需要输出纯文本、带时间线文本或 SRT 字幕。"
          icon={FaMicrophone}
          tone="violet"
          meta={meta}
        />

        {error ? (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <FaExclamationTriangle className="shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <InfoPanel className="space-y-4">
            <InfoSectionTitle
              title="1. 选择音频"
              description="上传自己的录音;也可以重复使用之前上传过的文件。文件只属于你,其他用户与访客看不到。"
              tone="violet"
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={(limits?.acceptedExts ?? []).join(',')}
              onChange={(e) => void onFilesPicked(e)}
            />
            <button
              type="button"
              disabled={busy || uploading !== null || config?.enabled === false}
              onClick={() => fileRef.current?.click()}
              className={cn(studioPrimaryButtonClassName, 'w-full')}
            >
              {uploading ? <SimpleLoadingSpinner size={0.7} /> : <FaUpload className="text-xs" />}
              {uploading ? `上传中 ${uploading}…` : '上传音频文件'}
            </button>

            {chosen.length === 0 ? (
              <div className={cn(studioSubPanelClassName, 'px-4 py-6 text-center text-xs text-slate-400')}>
                还没有待转写文件
              </div>
            ) : (
              <ul className="space-y-1.5">
                {chosen.map((rel) => (
                  <li key={rel} className={cn(studioSubPanelClassName, 'flex items-center gap-2 px-3 py-1.5')}>
                    <FaFileAudio className="shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{rel}</span>
                    <button
                      type="button"
                      onClick={() => setChosen((prev) => prev.filter((r) => r !== rel))}
                      className="text-slate-400 transition hover:text-rose-500"
                      aria-label={`移除 ${rel}`}
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {limits ? (
              <p className="text-[11px] leading-4 text-slate-400">
                单文件上限 {fmtBytes(Math.min(limits.maxUploadBytes, limits.maxFileSizeBytes))};格式 {limits.acceptedExts.join(' / ')}。
              </p>
            ) : null}
          </InfoPanel>

          <InfoPanel className="space-y-4">
            <InfoSectionTitle
              title="2. 选择产物"
              description="纯文本适合直接读或再喂给模型;带时间线保留每段起止;SRT 可丢进剪辑软件当字幕。"
              tone="sky"
            />
            <div className="flex flex-wrap gap-2">
              {OUTPUT_ORDER.map((value) => {
                const on = outputs.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleOutput(value)}
                    className={cn(
                      'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
                      on
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                    )}
                  >
                    {OUTPUT_LABELS[value]}
                    <span className="ml-1.5 text-[11px] font-normal opacity-70">
                      {value === 'plain' ? '.txt' : value === 'timed' ? '.timed.txt' : '.srt'}
                    </span>
                  </button>
                );
              })}
            </div>
            {outputs.length === 0 ? (
              <p className="text-[11px] text-amber-600">至少选一种产物,否则会按纯文本提交。</p>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-500">待转写 {chosen.length} 个文件</span>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || chosen.length === 0 || config?.enabled === false}
                className={studioPrimaryButtonClassName}
              >
                {busy ? <SimpleLoadingSpinner size={0.7} /> : <FaPlay className="text-xs" />}
                开始转写
              </button>
            </div>
            {notice ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>
            ) : null}
          </InfoPanel>
        </div>

        <InfoPanel className="space-y-3">
          <InfoSectionTitle
            title="我的转写任务"
            description="任务在服务端排队执行;提交后可以关掉页面,进度与结果都会留着,失败了也能原地重试。"
            tone="slate"
            action={
              hasActive ? (
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                  {jobs.filter((j) => j.status === 'running').length} 个进行中
                </span>
              ) : null
            }
          />
          {jobs.length === 0 ? (
            <div className={cn(studioSubPanelClassName, 'px-4 py-8 text-center text-sm text-slate-400')}>
              还没有任务,先上传一段录音试试。
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const active = job.status === 'queued' || job.status === 'running';
                const expanded = expandedId === job.id;
                const list = transcripts[job.id] ?? [];
                return (
                  <div key={job.id} className={cn(studioSurfaceClassName, 'overflow-hidden')}>
                    <div
                      className={cn('flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', expanded ? 'bg-slate-50/70' : 'hover:bg-slate-50/50')}
                      onClick={() => setExpandedId(expanded ? null : job.id)}
                    >
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : job.status === 'succeeded' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : job.status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600')}>
                        {STATUS_LABEL[job.status] ?? job.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                        {job.input?.values?.length ?? 0} 个文件 · {job.result?.summary ?? STAGE_LABEL[job.stage] ?? job.stage}
                      </span>
                      {active ? (
                        <span className="flex min-w-[160px] items-center gap-2">
                          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                            <span className="block h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${job.progress}%` }} />
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">{job.progress}%</span>
                          <span className="text-[10px] text-slate-400">{STAGE_LABEL[job.stage] ?? job.stage}</span>
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {active ? (
                          <button type="button" onClick={() => void act('cancel', job.id)} className={cn(studioSecondaryButtonClassName, 'px-2.5 py-1 text-[11px]')}>
                            <FaTimes className="text-[10px]" />
                            {job.cancelRequested ? '取消中…' : '取消'}
                          </button>
                        ) : job.status !== 'queued' ? (
                          <button type="button" onClick={() => void act('retry', job.id)} className={cn(studioSecondaryButtonClassName, 'px-2.5 py-1 text-[11px]')}>
                            <FaRedo className="text-[10px]" />
                            重试
                          </button>
                        ) : null}
                        {!active ? (
                          <button type="button" onClick={() => void act('delete', job.id)} className={cn(studioSecondaryButtonClassName, 'px-2.5 py-1 text-[11px]')}>
                            <FaTrash className="text-[10px]" />
                            删除
                          </button>
                        ) : null}
                      </span>
                    </div>

                    {expanded ? (
                      <div className="space-y-3 border-t border-slate-100 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {job.error ? (
                          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{job.error}</div>
                        ) : null}
                        {list.length === 0 ? (
                          <div className="text-xs text-slate-400">{active ? '任务进行中,完成后可在这里查看分段。' : '没有可展示的结果。'}</div>
                        ) : (
                          list.map((item) => (
                            <div key={`${job.id}-${item.index}`} className="space-y-2">
                              <div className="truncate text-xs font-semibold text-slate-600">{item.label}</div>
                              <TranscriptView
                                item={item}
                                onDownload={(format) => void transcribeApi.download(job.id, item.index, format).catch(() => setError('下载失败,请稍后重试。'))}
                              />
                            </div>
                          ))
                        )}
                        {active && job.logs.length > 0 ? (
                          <pre className="max-h-32 overflow-y-auto rounded-xl bg-slate-950/90 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100">
                            {job.logs.slice(-12).map((l) => l.text).join('\n')}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </InfoPanel>

        <p className="text-[11px] leading-5 text-slate-400">
          说明：识别链路的接口参数、并发与限额均由管理员在后台维护，本页只负责你自己的文件与任务。
        </p>
      </div>
    </InfoQueryShell>
  );
};

export default SpeechToTextPage;
