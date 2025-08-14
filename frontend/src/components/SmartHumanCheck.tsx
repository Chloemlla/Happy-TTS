import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * SmartHumanCheck - 前端人机验证（仿 Turnstile）
 *
 * 目标：在前端通过多信号融合（行为轨迹、输入节律、可见性、陷阱字段、简单滑块挑战、指纹熵等）
 * 生成一个包含评分的 token，供后端进一步校验与风控。
 *
 * 注意：前端无法提供强校验的防伪签名。生产环境建议：
 * 1) 后端下发一次性 challenge/nonce（短时有效），前端生成 token 时回传该 nonce；
 * 2) 后端基于 nonce 与服务器密钥重新计算签名并比对；
 * 3) 对 token 字段进行阈值判断与风控。
 *
 * 使用示例：
 * <SmartHumanCheck onSuccess={(token) => setToken(token)} />
 */

export interface SmartHumanCheckProps {
  onSuccess: (token: string) => void;
  onFail?: (reason: string) => void;
  size?: 'normal' | 'compact';
  theme?: 'light' | 'dark';
  // 可选：服务端下发的随机挑战串（推荐）
  challengeNonce?: string;
  // 完成后是否自动重置组件（默认 false）
  autoReset?: boolean;
}

// 行为评分阈值
const SCORE_THRESHOLD = 0.62; // 合理偏宽松，降低误判率

// 计算 SHA-256 (base64)
async function sha256Base64(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// 简单 Canvas 指纹熵（不可唯一，但可提供稳定度参考）
async function getCanvasEntropy(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'noctx';
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#333';
    ctx.fillText(`HUMAN-CHECK-${navigator.userAgent}`, 10, 25);
    const data = canvas.toDataURL();
    return await sha256Base64(data);
  } catch {
    return 'canvas-error';
  }
}

// 行为收集器
interface BehaviorStats {
  mouseMoves: number;
  keyPresses: number;
  totalDistance: number; // 鼠标移动总距离
  uniquePathPoints: number; // 去重后的轨迹点
  avgSpeed: number; // 简易速度估计
  focusTimeMs: number; // 页面聚焦时间
  visibilityChanges: number;
  trapTriggered: boolean; // 蜜罐触发
}

function useBehaviorTracker(containerRef: React.RefObject<HTMLDivElement | null>) {
  const statsRef = useRef<BehaviorStats>({
    mouseMoves: 0,
    keyPresses: 0,
    totalDistance: 0,
    uniquePathPoints: 0,
    avgSpeed: 0,
    focusTimeMs: 0,
    visibilityChanges: 0,
    trapTriggered: false,
  });

  const lastPointRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const focusStartRef = useRef<number | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      statsRef.current.mouseMoves += 1;
      const now = performance.now();
      const p = { x: e.clientX, y: e.clientY, t: now };
      if (lastPointRef.current) {
        const dx = p.x - lastPointRef.current.x;
        const dy = p.y - lastPointRef.current.y;
        const dt = Math.max(1, p.t - lastPointRef.current.t);
        const dist = Math.hypot(dx, dy);
        statsRef.current.totalDistance += dist;
        // 简化速度估计（像素/毫秒）
        const speed = dist / dt;
        // 简单滚动平均
        statsRef.current.avgSpeed = (statsRef.current.avgSpeed * 0.9) + (speed * 0.1);
      }
      lastPointRef.current = p;

      // 去重轨迹点（按 8px 网格近似）
      const gridX = Math.round(e.clientX / 8);
      const gridY = Math.round(e.clientY / 8);
      statsRef.current.uniquePathPoints += 1 / (1 + (statsRef.current.uniquePathPoints / 200)); // 渐进式估计
    };

    const onKeyDown = () => { statsRef.current.keyPresses += 1; };

    const onVisibility = () => { statsRef.current.visibilityChanges += 1; };

    const onFocus = () => { focusStartRef.current = performance.now(); };
    const onBlur = () => {
      if (focusStartRef.current != null) {
        statsRef.current.focusTimeMs += performance.now() - focusStartRef.current;
        focusStartRef.current = null;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    onFocus();

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);

  const setTrapTriggered = useCallback(() => {
    statsRef.current.trapTriggered = true;
  }, []);

  return { statsRef, setTrapTriggered };
}

// 简易滑块验证组件（拖到最右并保持稳定）
function Slider({ onComplete, disabled }: { onComplete: () => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(0); // 0..1
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging || done) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      let clientX = (e as MouseEvent).clientX;
      if ((e as TouchEvent).touches && (e as TouchEvent).touches[0]) {
        clientX = (e as TouchEvent).touches[0].clientX;
      }
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      setPos(x / rect.width);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, done]);

  // 到达最右后保持 350ms 视为成功
  useEffect(() => {
    if (done || disabled) return;
    if (pos >= 0.985) {
      const t = setTimeout(() => {
        setDone(true);
        onComplete();
      }, 350);
      return () => clearTimeout(t);
    }
  }, [pos, done, disabled, onComplete]);

  return (
    <div className={`w-full select-none ${disabled ? 'opacity-50' : ''}`}>
      <div ref={trackRef} className="relative h-10 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-green-400 transition-all"
          style={{ width: `${Math.max(pos * 100, done ? 100 : 0)}%` }}
        />
        <div
          role="button"
          aria-label="slider-handle"
          className={`absolute top-1 left-1 h-8 w-8 rounded-full bg-white shadow-md border border-gray-300 flex items-center justify-center cursor-pointer ${dragging ? 'scale-105' : ''}`}
          style={{ transform: `translateX(${Math.max(0, (pos * 100) - 2)}%)` }}
          onMouseDown={() => !disabled && setDragging(true)}
          onTouchStart={() => !disabled && setDragging(true)}
        >
          {done ? '✓' : '≡'}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-600">
          {done ? '验证成功' : '按住滑块拖动完成验证'}
        </div>
      </div>
    </div>
  );
}

export const SmartHumanCheck: React.FC<SmartHumanCheckProps> = ({
  onSuccess,
  onFail,
  size = 'normal',
  theme = 'light',
  challengeNonce,
  autoReset = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { statsRef, setTrapTriggered } = useBehaviorTracker(containerRef);

  const [canvasEntropy, setCanvasEntropy] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sliderOk, setSliderOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 计算行为评分（0..1）
  const score = useMemo(() => {
    const s = statsRef.current;
    // 各特征的简单归一化与权重（经验值，目标：降低误判，偏向放行真人）
    const mScore = Math.min(1, Math.log10(1 + s.mouseMoves) / 2.2); // 鼠标移动次数
    const kScore = Math.min(1, Math.log10(1 + s.keyPresses) / 2.0); // 键盘敲击
    const dScore = Math.min(1, Math.log10(1 + s.totalDistance) / 3.0); // 移动距离
    const uScore = Math.min(1, s.uniquePathPoints / 180); // 轨迹点
    const fScore = Math.min(1, s.focusTimeMs / 3500); // 聚焦时间
    const vPenalty = Math.max(0, 1 - s.visibilityChanges * 0.08); // 频繁切换可见性扣分
    const tPenalty = s.trapTriggered ? 0.2 : 1; // 触发陷阱严重扣分

    const base = (mScore * 0.18) + (kScore * 0.14) + (dScore * 0.18) + (uScore * 0.18) + (fScore * 0.22);
    const finalScore = Math.max(0, Math.min(1, base * vPenalty * tPenalty));
    return finalScore;
  }, [statsRef]);

  // 初始化 Canvas 熵
  useEffect(() => {
    let mounted = true;
    getCanvasEntropy().then(v => { if (mounted) setCanvasEntropy(v); });
    const t = setTimeout(() => setReady(true), 400); // 给事件收集预热时间
    return () => { mounted = false; clearTimeout(t); };
  }, []);

  // 蜜罐字段（不可见）。若被自动填充，判为触发陷阱
  const trapInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setInterval(() => {
      if (trapInputRef.current && trapInputRef.current.value) {
        setTrapTriggered();
      }
    }, 600);
    return () => clearInterval(t);
  }, [setTrapTriggered]);

  const canSubmit = checked && sliderOk && ready && score >= SCORE_THRESHOLD;

  const handleSliderComplete = useCallback(() => setSliderOk(true), []);

  const reset = useCallback(() => {
    setChecked(false);
    setSliderOk(false);
    setSubmitting(false);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const now = Date.now();
      const payload = {
        v: 1,
        ts: now,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
        ua: navigator.userAgent,
        ce: canvasEntropy,
        sc: Number(score.toFixed(3)),
        st: statsRef.current,
        cn: challengeNonce || null,
      };
      const payloadStr = JSON.stringify(payload);
      // 弱签名（仅用于防篡改提示，服务端不可依赖）：payload + 浏览器随机 salt
      const salt = crypto.getRandomValues(new Uint8Array(12));
      const saltB64 = btoa(String.fromCharCode(...salt));
      const sig = await sha256Base64(payloadStr + '|' + saltB64);
      const token = btoa(
        JSON.stringify({ payload: payload, salt: saltB64, sig })
      );

      onSuccess(token);
      if (autoReset) {
        setTimeout(() => reset(), 500);
      }
    } catch (e: any) {
      setError(e?.message || '验证失败，请重试');
      onFail?.('exception');
    } finally {
      setSubmitting(false);
    }
  }, [autoReset, canvasEntropy, canSubmit, challengeNonce, onFail, onSuccess, reset, score, statsRef]);

  const themeCls = theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-white text-gray-800 border-gray-200';
  const subTextCls = theme === 'dark' ? 'text-gray-300' : 'text-gray-500';
  const sizeCls = size === 'compact' ? 'p-3 text-sm' : 'p-4';

  return (
    <div ref={containerRef} className={`rounded-xl border ${themeCls} ${sizeCls} w-full max-w-md`}>
      {/* 蜜罐输入框（隐藏） */}
      <input
        ref={trapInputRef}
        type="text"
        tabIndex={-1}
        autoComplete="username"
        aria-hidden="true"
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
      />

      <div className="flex items-center gap-3">
        <input
          id="shc-check"
          type="checkbox"
          className="h-5 w-5 accent-blue-600"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <label htmlFor="shc-check" className="cursor-pointer select-none">
          我不是机器人
        </label>
        <div className={`ml-auto text-xs ${subTextCls}`}>行为评分：{(score * 100).toFixed(0)}%</div>
      </div>

      <div className="mt-3">
        <Slider onComplete={handleSliderComplete} disabled={!checked} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={submit}
          className={`px-3 py-2 rounded-lg text-white ${
            canSubmit && !submitting ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? '验证中...' : '提交验证'}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
        <div className={`ml-auto text-xs ${subTextCls}`}>
          {ready ? '已准备' : '准备中...'} · Canvas熵: {canvasEntropy.slice(0, 10)}
        </div>
      </div>

      <div className={`mt-2 text-xs ${subTextCls}`}>
        提示：该组件仅在前端进行多信号融合与弱签名。为获得更高安全性，建议配合服务端 nonce 与签名校验。
      </div>
    </div>
  );
};

export default SmartHumanCheck;
