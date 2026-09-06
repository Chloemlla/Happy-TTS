import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaDownload,
  FaExclamationTriangle,
  FaHistory,
  FaPlay,
  FaServer,
  FaSlidersH,
  FaSyncAlt,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { emptyTarget, mediaToolApi } from '../../api/mediaTool';
import type { MediaTarget, MediaToolHealth, MediaToolSettings } from '../../api/mediaTool';
import { InfoSectionTitle, InfoMetricCard, logSharePanelClass } from '../LogShareStyleScaffold';
import { SimpleLoadingSpinner } from '../LoadingSpinner';
import { BiliPanel } from './media-tool/BiliPanel';
import { JobsPanel } from './media-tool/JobsPanel';
import { SettingsPanel } from './media-tool/SettingsPanel';
import { TranscribePanel } from './media-tool/TranscribePanel';
import { btnGhost, cx, ErrLine, inputCls } from './media-tool/ui';

const LS_KEY = 'media-tool-conn-v1';

type ConnMode = 'internal' | 'local';

interface PersistedConn {
  mode: ConnMode;
  baseUrl: string;
  toolKey: string;
}

const DEFAULT_CONN: PersistedConn = { mode: 'internal', baseUrl: '', toolKey: '' };

function loadPersisted(): PersistedConn {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedConn;
      if (parsed && (parsed.mode === 'internal' || parsed.mode === 'local')) {
        return { mode: parsed.mode, baseUrl: parsed.baseUrl ?? '', toolKey: parsed.toolKey ?? '' };
      }
    }
  } catch {
    // 忽略损坏的本地存储
  }
  return DEFAULT_CONN;
}

/** 独立后端尚未返回真实设置前的兜底默认值(健康检查返回后即被真实值替换)。 */
const MEDIA_DEFAULT_SETTINGS: MediaToolSettings = {
  enabled: true,
  workDir: '',
  maxUploadBytes: 400 * 1024 * 1024,
  maxJobLogLines: 200,
  lasr: {
    serverUrl: '',
    appId: '',
    appKey: '',
    engineType: 'luyin',
    packageName: '',
    language: 'cn',
    scene: '',
    saveSrt: false,
    brand: '',
    model: '',
    product: '',
    rom: '',
    systemVersion: '',
    androidVersion: '',
    clientVersion: '',
    sdkVersion: '',
    netType: '',
    vaid: '',
    did: '',
    token: '',
    openid: '',
    blockSizeBytes: 0,
    maxFileSizeBytes: 0,
    concurrency: 1,
  },
  bili: {
    ytDlpPath: '',
    cookiesFile: '',
    downloadDir: '',
    audioFormat: 'mp3',
    concurrency: 1,
    videoMode: false,
    transcribeAfter: false,
  },
};

const TAB: Array<{ id: 'settings' | 'bili' | 'transcribe' | 'jobs'; label: string; icon: IconType }> = [
  { id: 'settings', label: '设置', icon: FaSlidersH },
  { id: 'bili', label: 'B站下载', icon: FaDownload },
  { id: 'transcribe', label: '音频转写', icon: FaPlay },
  { id: 'jobs', label: '任务历史', icon: FaHistory },
];

/**
 * 媒体工具完整流程 GUI。两种运行目标:
 *  1) 站点内置 —— 走当前站点的 /api/admin/media-tool,服务器内部下载/转写;
 *  2) 独立本地后端 —— 本地 npm run media-tool:serve 起一个仅带媒体工具的后端,
 *     本页填入其地址(可选 X-Media-Tool-Key)后即可当「方便壳」使用全部流程。
 * 连接偏好持久化到 localStorage,面板按目标重新挂载,避免跨后端串数据。
 */
export const MediaToolAdmin: React.FC = () => {
  const [persisted] = useState<PersistedConn>(loadPersisted);
  const [mode, setMode] = useState<ConnMode>(persisted.mode);
  const [baseUrl, setBaseUrl] = useState(persisted.baseUrl);
  const [toolKey, setToolKey] = useState(persisted.toolKey);
  const [health, setHealth] = useState<MediaToolHealth | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'bili' | 'transcribe' | 'jobs'>('bili');

  const isInternal = mode === 'internal';
  const target = useMemo<MediaTarget>(
    () => (isInternal ? emptyTarget : { baseUrl, toolKey }),
    [isInternal, baseUrl, toolKey],
  );

  useEffect(() => {
    try {
      const next: PersistedConn = { mode, baseUrl, toolKey };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可用时静默降级(仅本会话内存态)
    }
  }, [mode, baseUrl, toolKey]);

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    setHealth(null);
    try {
      if (!isInternal && !target.baseUrl.trim()) {
        setProbeError('请填写独立后端的地址后再测试连接。');
        return;
      }
      const h = await mediaToolApi.health(target);
      setHealth(h);
    } catch (err) {
      setProbeError(
        isInternal
          ? '内置媒体工具不可达:请确认后端已升级部署且当前账号具备管理员权限。'
          : '连接失败:请确认本地后端已启动,地址/密钥正确,且后端已允许本页面源(详见说明)。',
      );
      console.error('媒体工具连接探测失败:', err);
    } finally {
      setProbing(false);
    }
  }, [target, isInternal]);

  // 切换运行目标 / 地址输入停顿后自动(重新)探测;本地模式地址为空时不探测
  const targetSig = `${target.baseUrl}|${target.toolKey}`;
  useEffect(() => {
    if (!isInternal && !baseUrl.trim()) {
      setHealth(null);
      setProbeError('请填写独立后端的地址后再测试连接。');
      return;
    }
    setHealth(null);
    setProbeError(null);
    const timer = window.setTimeout(() => {
      void probe();
    }, isInternal ? 0 : 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSig, isInternal]);

  const segBtn = (active: boolean) =>
    cx(
      'inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition',
      active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    );

  const runtimeChips = health
    ? [
        { label: '工作目录', value: health.runtime.workDir || '(默认)' },
        { label: 'yt-dlp', value: health.runtime.ytDlp.ok ? (health.runtime.ytDlp.version ?? '可用') : '缺失' },
        { label: 'ffprobe', value: health.runtime.ffprobe.ok ? '可用' : '缺失' },
        { label: 'cookies', value: health.runtime.cookies.ok ? (health.runtime.cookies.path ?? '已配置') : '无' },
        { label: 'vivo 账号', value: health.runtime.lasrConfigured ? '已配置' : '未配置' },
        { label: '排队任务', value: String(health.runtime.queuedJobs) },
      ]
    : [];

  const panelSettings = health ? health.settings : MEDIA_DEFAULT_SETTINGS;
  // 健康信息返回后重挂载面板,让其按真实设置初始化默认值
  const panelKey = `${targetSig}|${health ? 'h1' : 'h0'}`;

  return (
    <div className="space-y-4">
      <InfoSectionTitle
        title="媒体工具"
        eyebrow="Media Tool"
        description="B 站视频下载与 vivo 录音转写完整流程。可连接当前站点的内置接口(服务器内部下载),或仅连一台独立本地后端把本页当方便壳用。"
        icon={FaDownload}
        tone="slate"
        action={
          <span
            className={cx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
              health
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : probeError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-slate-100 text-slate-500',
            )}
          >
            {health ? <FaCheckCircle className="text-xs" /> : <FaExclamationTriangle className="text-xs" />}
            {health ? `已连接 · ${health.mode === 'standalone' ? '独立后端' : '站点内置'}` : probeError ? '未连接' : '探测中'}
          </span>
        }
      />

      <div className={`${logSharePanelClass} space-y-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-800">运行目标</div>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setMode('internal')} className={segBtn(isInternal)}>
              <FaServer className="text-[10px]" />
              站点内置
            </button>
            <button type="button" onClick={() => setMode('local')} className={segBtn(!isInternal)}>
              <FaPlay className="text-[10px]" />
              独立本地后端
            </button>
          </div>
        </div>

        {isInternal ? (
          <div className="flex items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-800">
            <FaServer className="mt-0.5 shrink-0 text-indigo-400" />
            <span>
              使用<b>当前站点</b>的内置媒体工具接口 (<code className="font-mono">/api/admin/media-tool</code>)。下载 / 转写均在服务器本机
              workDir 完成,任务历史写入站点数据库。需以管理员身份登录。
            </span>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">后端地址</span>
                <input
                  className={inputCls}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:4007"
                  spellCheck={false}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  密钥(可选) <code className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">X-Media-Tool-Key</code>
                </span>
                <input
                  className={inputCls}
                  value={toolKey}
                  onChange={(e) => setToolKey(e.target.value)}
                  placeholder="留空 = 无密钥"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              <FaSyncAlt className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                独立后端启动方式(在仓库内):<code className="mx-1 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px]">npm run media-tool:serve</code>
                默认监听 127.0.0.1:4007。如需密钥,启动前设置环境变量(如
                <code className="mx-1 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px]">MEDIA_TOOL_KEY</code>)。
                修改地址后点「测试连接」刷新状态。
              </span>
            </div>
          </>
        )}

        {probeError ? (
          <ErrLine>
            <FaExclamationTriangle className="text-rose-500" />
            {probeError}
          </ErrLine>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button onClick={() => void probe()} disabled={probing} className={btnGhost}>
            {probing ? <SimpleLoadingSpinner size={0.6} /> : <FaSyncAlt className="text-xs" />}
            测试连接
          </button>
        </div>

        {probing ? (
          <div className="flex justify-center py-4">
            <SimpleLoadingSpinner size={0.8} />
          </div>
        ) : health ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {runtimeChips.map((c) => (
              <div key={c.label} className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
                <div
                  className={cx(
                    'mt-1 truncate text-xs font-medium text-slate-700',
                    c.value === '缺失' || c.value === '未配置' ? 'text-amber-600' : '',
                  )}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {health ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InfoMetricCard label="工作目录可写" value={health.runtime.workDirWritable ? '是' : '否'} icon={FaServer} tone="slate" />
          <InfoMetricCard label="下载能力" value={health.runtime.ytDlp.ok ? '可用' : '缺失'} icon={FaDownload} tone="slate" />
          <InfoMetricCard label="转写账号" value={health.runtime.lasrConfigured ? '已配置' : '未配置'} icon={FaPlay} tone="slate" />
          <InfoMetricCard label="排队中" value={health.runtime.queuedJobs} icon={FaHistory} tone="slate" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200">
        {TAB.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cx(
              'inline-flex items-center gap-2 rounded-t-2xl border-b-2 px-4 py-2.5 text-sm font-semibold transition',
              activeTab === t.id
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            )}
          >
            <t.icon className="text-xs" />
            {t.label}
          </button>
        ))}
      </div>

      <div key={panelKey}>
        {activeTab === 'settings' ? <SettingsPanel target={target} /> : null}
        {activeTab === 'bili' ? <BiliPanel target={target} settings={panelSettings} /> : null}
        {activeTab === 'transcribe' ? <TranscribePanel target={target} settings={panelSettings} /> : null}
        {activeTab === 'jobs' ? <JobsPanel target={target} /> : null}
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        <FaCheckCircle className="mt-0.5 shrink-0 text-slate-400" />
        <span>
          连接偏好保存在本浏览器(localStorage)。面板切换目标会自动重新挂载并从对应后端拉取数据;任务列表每 2.5 秒轮询一次,当前选择会被记住。
        </span>
      </div>
    </div>
  );
};

export default MediaToolAdmin;
