// 「语音转文本」用户态 API 客户端(/api/transcribe)。
// 与 admin 的 mediaToolApi 分开:这里只面向登录用户,路径一律相对「用户自己的目录」,
// 前端不需要(也拿不到)服务端 uid 目录名。
import { api } from './api';
import type { MediaJobRecord } from './mediaTool';

export type TranscribeOutput = 'plain' | 'timed' | 'srt';

export interface TranscribeLimits {
  maxFilesPerJob: number;
  maxActiveJobs: number;
  activeJobs: number;
  maxUploadBytes: number;
  maxFileSizeBytes: number;
  acceptedExts: string[];
  outputs: TranscribeOutput[];
  defaultOutputs: TranscribeOutput[];
}

export interface TranscribeConfig {
  ok: boolean;
  enabled: boolean;
  notice: string | null;
  limits: TranscribeLimits;
}

export interface TranscribeUpload {
  rel: string;
  size: number;
  name: string;
}

export interface TranscribeDirEntry {
  name: string;
  rel: string;
  dir: boolean;
  size: number;
  audio: boolean;
  mtime: number;
}

export interface TranscriptSegment {
  bg: number;
  ed: number;
  onebest?: string;
  speaker?: string;
}

export type TranscriptSegment = {
  bg: number;
  ed: number;
  onebest?: string;
  speaker?: string;
};

export interface TranscriptItem {
  index: number;
  label: string;
  ok: boolean;
  error?: string;
  durationSec: number;
  segmentCount: number;
  segments: TranscriptSegment[];
  files: {
    audio?: string | null;
    txt: string | null;
    timed: string | null;
    srt: string | null;
    json: string | null;
  };
}

export interface TranscribeJobDetail {
  job: MediaJobRecord;
  transcripts: TranscriptItem[];
}

const BASE = '/api/transcribe';

const toQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
};

export const OUTPUT_LABELS: Record<TranscribeOutput, string> = {
  plain: '纯文本',
  timed: '带时间线',
  srt: 'SRT 字幕',
};

export const transcribeApi = {
  config: async (): Promise<TranscribeConfig> => {
    const res = await api.get(`${BASE}/config`);
    return res.data;
  },

  upload: async (file: File, onProgress?: (percent: number) => void): Promise<TranscribeUpload> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`${BASE}/upload`, form, {
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
    return res.data.upload;
  },

  listFiles: async (sub?: string): Promise<{ sub: string; entries: TranscribeDirEntry[] }> => {
    const res = await api.get(`${BASE}/files${toQuery({ sub })}`);
    return { sub: res.data.sub ?? '', entries: res.data.entries ?? [] };
  },

  createJob: async (files: string[], outputs: TranscribeOutput[]): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs`, { files, outputs });
    return res.data.job;
  },

  listJobs: async (limit = 20): Promise<MediaJobRecord[]> => {
    const res = await api.get(`${BASE}/jobs${toQuery({ limit })}`);
    return res.data.jobs ?? [];
  },

  getJob: async (id: string): Promise<TranscribeJobDetail> => {
    const res = await api.get(`${BASE}/jobs/${encodeURIComponent(id)}`);
    return { job: res.data.job, transcripts: res.data.transcripts ?? [] };
  },

  cancelJob: async (id: string): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs/${encodeURIComponent(id)}/cancel`, {});
    return res.data.job;
  },

  retryJob: async (id: string): Promise<MediaJobRecord> => {
    const res = await api.post(`${BASE}/jobs/${encodeURIComponent(id)}/retry`, {});
    return res.data.job;
  },

  deleteJob: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/jobs/${encodeURIComponent(id)}`);
  },

  /** 触发浏览器下载某个产物(先取 blob 再落盘,与媒体工具一致)。 */
  download: async (id: string, index: number, format: 'txt' | 'timed' | 'srt' | 'json'): Promise<void> => {
    const res = await api.get(`${BASE}/jobs/${encodeURIComponent(id)}/download${toQuery({ index, format })}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${format}-${index + 1}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  },
};
