import FingerprintJS from '@fingerprintjs/fingerprintjs';
import CryptoJS from 'crypto-js';
import { api } from '../api/api';

const FP_STORAGE_KEY = 'hapx_fingerprint_v2';
const FP_VERSION = '2';
const FP_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30天

type CachedFingerprint = { id: string; v: string; ts: number };

function safeHash(input: string): string {
  try {
    return CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
  } catch {
    // 极端情况下，返回简单base64作为兜底（较弱）
    return btoa(unescape(encodeURIComponent(input))).slice(0, 64);
  }
}

function readCache(): string | null {
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFingerprint;
    if (parsed.v !== FP_VERSION) return null;
    if (Date.now() - parsed.ts > FP_TTL_MS) return null;
    return parsed.id;
  } catch {
    return null;
  }
}

function writeCache(id: string): void {
  try {
    const payload: CachedFingerprint = { id, v: FP_VERSION, ts: Date.now() };
    localStorage.setItem(FP_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 忽略存储错误
  }
}

function getOrCreateStableRandomId(): string {
  const key = 'hapx_fp_rand';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
  } catch {}

  let rand = '';
  try {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    rand = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  try { localStorage.setItem(key, rand); } catch {}
  return rand;
}

function getNavigatorSignals() {
  try {
    const n = navigator as any;
    return {
      ua: n.userAgent || '',
      uaData: n.userAgentData ? JSON.stringify(n.userAgentData) : '',
      lang: navigator.language,
      langs: (navigator.languages || []).join(','),
      platform: navigator.platform,
      vendor: navigator.vendor,
      dnt: navigator.doNotTrack || (n.msDoNotTrack || ''),
      hardware: (navigator as any).hardwareConcurrency || 0,
      memory: (navigator as any).deviceMemory || 0,
      plugins: (() => {
        try { return Array.from(navigator.plugins || []).map(p => p.name + ':' + p.filename).join('|'); } catch { return ''; }
      })(),
      maxTouchPoints: (navigator as any).maxTouchPoints || 0,
    };
  } catch {
    return {};
  }
}

function getScreenSignals() {
  try {
    return {
      w: screen.width,
      h: screen.height,
      aw: screen.availWidth,
      ah: screen.availHeight,
      cd: screen.colorDepth,
      pr: (window.devicePixelRatio || 1),
      o: window.screen.orientation ? (window.screen.orientation.type || '') : '',
    };
  } catch {
    return {};
  }
}

function getTimezoneSignals() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const off = new Date().getTimezoneOffset();
    return { tz, off };
  } catch {
    return {};
  }
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('HAPX-FP-CANVAS-测试字符串😊', 2, 2);
    ctx.strokeStyle = 'rgba(120, 186, 176, 0.5)';
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(190, 40);
    ctx.stroke();
    const data = canvas.toDataURL();
    return safeHash(data);
  } catch {
    return '';
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return '';
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = dbgInfo ? gl.getParameter((dbgInfo as any).UNMASKED_VENDOR_WEBGL) : '';
    const renderer = dbgInfo ? gl.getParameter((dbgInfo as any).UNMASKED_RENDERER_WEBGL) : '';
    const params = [
      gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE),
      gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE),
      gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_VARYING_VECTORS),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
      gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      gl.getSupportedExtensions(),
    ];
    return safeHash(JSON.stringify({ vendor, renderer, params }));
  } catch {
    return '';
  }
}

function buildCompositeFingerprint(): string {
  const data = {
    nav: getNavigatorSignals(),
    scr: getScreenSignals(),
    tz: getTimezoneSignals(),
    can: getCanvasFingerprint(),
    wgl: getWebGLFingerprint(),
    rnd: getOrCreateStableRandomId(),
  };
  return safeHash(JSON.stringify(data));
}

async function getWithFingerprintJS(timeoutMs = 1500): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    // FingerprintJS 自身不使用AbortController，这里用Promise.race模拟超时
    const p = (async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId as string;
    })();
    const id = await Promise.race<string | null>([
      p,
      new Promise<string | null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
    clearTimeout(to);
    return id;
  } catch {
    return null;
  }
}

export const getFingerprint = async (): Promise<string> => {
  // 1) 读取缓存
  const cached = readCache();
  if (cached) return cached;

  // 2) 优先尝试 FingerprintJS（带超时）
  const fpjs = await getWithFingerprintJS(1500);
  if (fpjs && typeof fpjs === 'string' && fpjs.length > 0) {
    writeCache(fpjs);
    return fpjs;
  }

  // 3) 退回到组合指纹
  try {
    const composite = buildCompositeFingerprint();
    if (composite && composite.length > 0) {
      writeCache(composite);
      return composite;
    }
  } catch (error) {
    console.error('生成组合指纹失败:', error);
  }

// 4) 最终兜底：随机稳定ID（若localStorage不可用则非稳定）
const fallback = getOrCreateStableRandomId();
writeCache(fallback);
return fallback || 'unknown';
};

// 将指纹上报到后端（幂等、带限频）
export const reportFingerprintOnce = async (opts?: { force?: boolean }): Promise<void> => {
  try {
    const force = !!opts?.force;
    const lastKey = 'hapx_fp_report_ts_v2';
    const now = Date.now();
    const localLast = Number(localStorage.getItem(lastKey) || '0');
    // 本地兜底：5分钟内不重复上报，避免频繁写库（force 时跳过）
    if (!force && (now - localLast < 5 * 60 * 1000)) return;

    // 优先从后端查询最近一次的指纹时间与数量，服务端有真实来源
    if (!force) {
      try {
        const statusRes = await api.get('/api/admin/user/fingerprint/status', { withCredentials: true });
        if (statusRes?.data?.success) {
          const { lastTs, ipChanged, uaChanged } = statusRes.data as { success: boolean; lastTs: number; count: number; ipChanged?: boolean; uaChanged?: boolean };
          if (!ipChanged && !uaChanged) {
            if (typeof lastTs === 'number' && lastTs > 0) {
              // 若距离上次采集 < 5 分钟，则不再上报
              if (now - lastTs < 5 * 60 * 1000) return;
            }
          }
        }
      } catch {
        // 查询失败则继续走本地节流逻辑
      }
    }

    const id = await getFingerprint();
    if (!id) return;

    // 使用全局 axios 实例，自动带上 baseURL 与拦截器
    await api.post('/api/admin/user/fingerprint', { id }, { withCredentials: true }).catch(() => {});

    try { localStorage.setItem(lastKey, String(now)); } catch {}
  } catch (e) {
    // 静默失败
  }
};