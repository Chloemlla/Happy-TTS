// 媒体工具(media-tool)前端 API 客户端。
// 支持两种运行目标:
//   target.baseUrl 为空  -> 命中当前站点的内置媒体工具(/api/admin/media-tool,管理员会话)
//   target.baseUrl 有值  -> 命中独立本地后端(如 http://127.0.0.1:4007,可选 X-Media-Tool-Key)
// 自定义目标走 withCredentials:false,避免跨源携带 Cookie 触发 CORS 凭证拦截。
import { AxiosRequestConfig } from 'axios';
import { api } from './api';

export interface MediaTarget {
  baseUrl: string;
  toolKey: string;
}

export interface LasrOptions {
  serverUrl: string;
  appId: string;
  appKey: string;
  engineType: string;
  packageName: string;
  language: string;
  scene: string;
  saveSrt: boolean;
  brand: string;
  model: string;
  product: string;
  rom: string;
  systemVersion: string;
  androidVersion: string;
  clientVersion: string;
  sdkVersion: string;
  netType: string;
  vaid: string;
  did: string;
  token: string;
  openid: string;
  blockSizeBytes: number;
  maxFileSizeBytes: number;
  concurrency: number;
}

export interface BiliOptions {
  ytDlpPath: string;
  cookiesFile: string;
  downloadDir: string;
  audioFormat: string;
  concurrency: number;
  videoMode: boolean;
  transcribeAfter: boolean;
}

export interface MediaToolSettings {
  enabled: boolean;
  workDir: string;
  maxUploadBytes: number;
  maxJobLogLines: number;
  lasr: LasrOptions;
  bili: BiliOptions;
}

export type MediaSettingsPatch = {
  enabled?: boolean;
  workDir?: string;
  maxUploadBytes?: number;
  maxJobLogLines?: number;
  lasr?: Partial<LasrOptions>;
  bili?: Partial<BiliOptions>;
};

export type MediaJobKind = 'bili-download' | 'transcribe';
export type MediaJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type MediaJobStage =
  | 'queued'
  | 'prepare'
  | 'create'
  | 'upload'
  | 'run'
  | 'progress'
  | 'result'
  | 'download'
  | 'transcribe'
  | 'finalize';

export interface MediaJobLogLine {
  t: number;
  text: string;
}

export interface MediaJobResult {
  summary: string;
  files: string[];
  items: Array<{
    ok: boolean;
    label: string;
    file?: string;
    txtFile?: string;
    segments?: number;
    error?: string;
  }>;
}

export interface MediaJobRecord {
  id: string;
  kind: MediaJobKind;
  mode: string;
  createdBy: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: MediaJobStatus;
  stage: MediaJobStage;
  progress: number;
  input: { type: string; values: string[] };
  params?: {
    mode?: 'audio' | 'video';
    audioFormat?: string;
    transcribeAfter?: boolean;
    saveSrt?: boolean;
    urls?: string[];
  };
  logs: MediaJobLogLine[];
  error?: string;
  result?: MediaJobResult;
  cancelRequested: boolean;
}

export interface MediaDirEntry {
  name: string;
  rel: string;
  dir: boolean;
  size: number;
  audio: boolean;
  text: boolean;
  media: boolean;
  mtime: number;
}

export interface MediaToolHealth {
  ok: boolean;
  mode: string;
  timestamp: number;
  settings: MediaToolSettings;
  runtime: {
    workDir: string;
    workDirWritable: boolean;
    ytDlp: { ok: boolean; version?: string | null; hint?: string };
    ffprobe: { ok: boolean; hint?: string };
    cookies: { ok: boolean; path?: string | null };
    lasrConfigured: boolean;
    queuedJobs: number;
  };
}

export interface MediaJobCreateInput {
  urls?: string[];
  files?: string[];
  mode?: 'audio' | 'video';
  audioFormat?: string;
  transcribeAfter?: boolean;
  saveSrt?: boolean;
}

const BASE = '/api/admin/media-tool';

const cfgFor = (target: MediaTarget): AxiosRequestConfig => {
  const base = (target.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return {};
  const cfg: AxiosRequestConfig = { baseURL: base, withCredentials: false };
  const key = (target.toolKey || '').trim();
  if (key) cfg.headers = { 'X-Media-Tool-Key': key };
  return cfg;
};

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const emptyTarget: MediaTarget = { baseUrl: '', toolKey: '' };

/** 每个调用显式携带运行目标;空 baseUrl = 站点内置。 */
export const mediaToolApi = {
  health: async (target: MediaTarget): Promise<MediaToolHealth> => {
    const res = await api.get(`${BASE}/health`, cfgFor(target));
    return res.data;
  },

  updateSettings: async (target: MediaTarget, patch: MediaSettingsPatch): Promise<MediaToolSettings> => {
    const res = await api.put(`${BASE}/settings`, patch, cfgFor(target));
    return res.data.settings;
  },

  listJobs: async (target: MediaTarget, limit = 40): Promise<MediaJobRecord[]> => {
    const res = await api.get(`${BASE}/jobs${toQuery({ limit })}`, cfgFor(target));
    return res.data.jobs ?? [];
  },

  getJob: async (target: MediaTarget, id: string): Promise<MediaJobRecord | null> => {
    const res = await api.get(`${BASE}/jobs/${encodeURIComponent(id)}`, cfgFor(target));
    return res.data.job ?? null;
  },

  createJob: async (target: MediaTarget, kind: MediaJobKind, input: MediaJobCreateInput): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs`, { kind, ...input }, cfgFor(target));
    return res.data.job;
  },

  cancelJob: async (target: MediaTarget, id: string): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs/${encodeURIComponent(id)}/cancel`, {}, cfgFor(target));
    return res.data.job;
  },

  retryJob: async (target: MediaTarget, id: string): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs/${encodeURIComponent(id)}/retry`, {}, cfgFor(target));
    return res.data.job;
  },

  deleteJob: async (target: MediaTarget, id: string): Promise<void> => {
    await api.delete(`${BASE}/jobs/${encodeURIComponent(id)}`, cfgFor(target));
  },

  listFiles: async (target: MediaTarget, sub?: string): Promise<{ sub: string; entries: MediaDirEntry[] }> => {
    const res = await api.get(`${BASE}/files${toQuery({ sub })}`, cfgFor(target));
    return { sub: res.data.sub ?? '', entries: res.data.entries ?? [] };
  },

  fetchText: async (target: MediaTarget, rel: string): Promise<string> => {
    const res = await api.get<string>(`${BASE}/files/content${toQuery({ rel })}`, cfgFor(target));
    return typeof res.data === 'string' ? res.data : String(res.data);
  },

  /** 触发浏览器下载某文件(先拉 blob 再落盘,兼容自定义目标 + 密钥请求头)。 */
  downloadFile: async (target: MediaTarget, rel: string, displayName?: string): Promise<void> => {
    const res = await api.get(`${BASE}/files/download${toQuery({ rel })}`, {
      ...cfgFor(target),
      responseType: 'blob',
    });
    const data = res.data as Blob;
    const url = URL.createObjectURL(data);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      const name = displayName || (rel.split('/').pop() ?? 'download');
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  },

  /** 上传单个音频文件到服务端 inbox,返回相对路径,便于接着发起转写。 */
  uploadAudio: async (
    target: MediaTarget,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ rel: string; size: number; name: string }> => {
    const form = new FormData();
    form.append('file', file);
    // 不手动设 Content-Type:axios 浏览器适配器对 FormData 会自行附加 multipart boundary
    const res = await api.post(`${BASE}/upload`, form, {
      ...cfgFor(target),
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
    return res.data.upload;
  },
};
