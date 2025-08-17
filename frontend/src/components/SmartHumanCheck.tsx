import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FaShieldAlt, FaInfoCircle, FaSync, FaRobot } from 'react-icons/fa';

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
  // API 基础路径（默认 /api/human-check）
  apiBaseUrl?: string;
  // 自动获取 nonce（默认 true）
  autoFetchNonce?: boolean;
}

// 行为评分阈值
const SCORE_THRESHOLD = 0.62; // 合理偏宽松，降低误判率

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 8000,  // 8秒
  backoffFactor: 2
};

// 指数退避延迟计算
function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

// 带重试的 fetch 函数
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = RETRY_CONFIG.maxRetries): Promise<Response> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // 解析错误响应体，附带错误码等信息
      let body: any = null;
      try { body = await response.clone().json(); } catch { }
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const code = body?.errorCode || body?.code;
      const message = body?.errorMessage || body?.error || response.statusText;
      const richErr: any = new Error(`HTTP ${response.status}: ${message}`);
      (richErr as any).httpStatus = response.status;
      (richErr as any).errorCode = code;
      (richErr as any).errorMessage = message;
      if (retryAfter && !Number.isNaN(retryAfter)) (richErr as any).retryAfter = retryAfter;
      if (body?.banUntil || body?.bannedUntil) (richErr as any).banUntil = body.banUntil || body.bannedUntil;
      // 对于 4xx 错误不重试
      if (response.status >= 400 && response.status < 500) {
        throw richErr;
      }
      throw richErr;
    } catch (error) {
      lastError = error as Error;

      // 最后一次尝试失败
      if (attempt === maxRetries) {
        break;
      }

      // 等待后重试
      const delay = getRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

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

// 增强的行为收集器
interface BehaviorStats {
  mouseMoves: number;
  keyPresses: number;
  totalDistance: number; // 鼠标移动总距离
  uniquePathPoints: number; // 去重后的轨迹点
  avgSpeed: number; // 简易速度估计
  maxSpeed: number; // 最大速度
  minSpeed: number; // 最小速度
  speedVariance: number; // 速度方差
  focusTimeMs: number; // 页面聚焦时间
  visibilityChanges: number;
  trapTriggered: boolean; // 蜜罐触发

  // 新增的键盘行为分析
  keyTimings: number[]; // 按键间隔时间
  avgKeyInterval: number; // 平均按键间隔
  keyPressVariance: number; // 按键间隔方差

  // 新增的鼠标轨迹分析
  mouseAcceleration: number; // 鼠标加速度
  directionChanges: number; // 方向改变次数
  pauseCount: number; // 鼠标停顿次数
  clickCount: number; // 点击次数

  // 新增的设备特征
  screenResolution: string; // 屏幕分辨率
  devicePixelRatio: number; // 设备像素比
  touchSupport: boolean; // 触摸支持

  // 新增的时间模式
  sessionDuration: number; // 会话持续时间
  idleTime: number; // 空闲时间
}

function useBehaviorTracker(containerRef: React.RefObject<HTMLDivElement | null>) {
  const statsRef = useRef<BehaviorStats>({
    mouseMoves: 0,
    keyPresses: 0,
    totalDistance: 0,
    uniquePathPoints: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    minSpeed: Number.MAX_SAFE_INTEGER,
    speedVariance: 0,
    focusTimeMs: 0,
    visibilityChanges: 0,
    trapTriggered: false,

    // 键盘行为
    keyTimings: [],
    avgKeyInterval: 0,
    keyPressVariance: 0,

    // 鼠标轨迹
    mouseAcceleration: 0,
    directionChanges: 0,
    pauseCount: 0,
    clickCount: 0,

    // 设备特征
    screenResolution: `${screen.width}x${screen.height}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    touchSupport: 'ontouchstart' in window,

    // 时间模式
    sessionDuration: 0,
    idleTime: 0,
  });

  const lastPointRef = useRef<{ x: number; y: number; t: number; speed: number } | null>(null);
  const focusStartRef = useRef<number | null>(null);
  const lastKeyPressRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(performance.now());
  const lastActivityRef = useRef<number>(performance.now());
  const speedHistoryRef = useRef<number[]>([]);
  const pathGridRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // 检查鼠标是否在容器内
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const isInside = e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!isInside) return; // 只跟踪容器内的鼠标移动
      }

      const now = performance.now();
      lastActivityRef.current = now;
      statsRef.current.mouseMoves += 1;

      const currentPoint = { x: e.clientX, y: e.clientY, t: now, speed: 0 };

      if (lastPointRef.current) {
        const dx = currentPoint.x - lastPointRef.current.x;
        const dy = currentPoint.y - lastPointRef.current.y;
        const dt = Math.max(1, currentPoint.t - lastPointRef.current.t);
        const dist = Math.hypot(dx, dy);

        // 计算速度和加速度
        const speed = dist / dt;
        currentPoint.speed = speed;

        if (lastPointRef.current.speed > 0) {
          const acceleration = Math.abs(speed - lastPointRef.current.speed) / dt;
          statsRef.current.mouseAcceleration = (statsRef.current.mouseAcceleration * 0.9) + (acceleration * 0.1);
        }

        // 更新距离和速度统计
        statsRef.current.totalDistance += dist;
        speedHistoryRef.current.push(speed);

        // 保持速度历史在合理范围内
        if (speedHistoryRef.current.length > 100) {
          speedHistoryRef.current.shift();
        }

        // 更新速度统计
        if (speedHistoryRef.current.length > 0) {
          statsRef.current.avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
          statsRef.current.maxSpeed = Math.max(statsRef.current.maxSpeed, speed);
          if (speed > 0) {
            statsRef.current.minSpeed = Math.min(statsRef.current.minSpeed, speed);
          }

          // 计算速度方差
          const avgSpeed = statsRef.current.avgSpeed;
          statsRef.current.speedVariance = speedHistoryRef.current.reduce((acc, s) => acc + Math.pow(s - avgSpeed, 2), 0) / speedHistoryRef.current.length;
        }

        // 检测方向变化
        if (speedHistoryRef.current.length >= 3) {
          const recent = speedHistoryRef.current.slice(-3);
          if ((recent[0] < recent[1] && recent[1] > recent[2]) || (recent[0] > recent[1] && recent[1] < recent[2])) {
            statsRef.current.directionChanges += 1;
          }
        }

        // 检测停顿（速度接近0）
        if (speed < 0.1 && lastPointRef.current.speed > 0.1) {
          statsRef.current.pauseCount += 1;
        }
      }

      lastPointRef.current = currentPoint;

      // 增强的轨迹点去重（使用更精确的网格）
      const gridX = Math.round(e.clientX / 8);
      const gridY = Math.round(e.clientY / 8);
      const gridKey = `${gridX},${gridY}`;

      if (!pathGridRef.current.has(gridKey)) {
        pathGridRef.current.add(gridKey);
        statsRef.current.uniquePathPoints = pathGridRef.current.size;
      }
    };

    const onKeyDown = () => {
      const now = performance.now();
      lastActivityRef.current = now;
      statsRef.current.keyPresses += 1;

      // 记录按键时间间隔
      if (lastKeyPressRef.current) {
        const interval = now - lastKeyPressRef.current;
        statsRef.current.keyTimings.push(interval);

        // 保持按键时间历史在合理范围内
        if (statsRef.current.keyTimings.length > 50) {
          statsRef.current.keyTimings.shift();
        }

        // 计算平均按键间隔
        if (statsRef.current.keyTimings.length > 0) {
          statsRef.current.avgKeyInterval = statsRef.current.keyTimings.reduce((a, b) => a + b, 0) / statsRef.current.keyTimings.length;

          // 计算按键间隔方差
          const avgInterval = statsRef.current.avgKeyInterval;
          statsRef.current.keyPressVariance = statsRef.current.keyTimings.reduce((acc, t) => acc + Math.pow(t - avgInterval, 2), 0) / statsRef.current.keyTimings.length;
        }
      }

      lastKeyPressRef.current = now;
    };

    const onVisibility = () => {
      statsRef.current.visibilityChanges += 1;
      lastActivityRef.current = performance.now();
    };

    const onClick = () => {
      statsRef.current.clickCount += 1;
      lastActivityRef.current = performance.now();
    };

    const onFocus = () => {
      const now = performance.now();
      focusStartRef.current = now;
      lastActivityRef.current = now;
    };

    const onBlur = () => {
      const now = performance.now();
      if (focusStartRef.current != null) {
        statsRef.current.focusTimeMs += now - focusStartRef.current;
        focusStartRef.current = null;
      }
    };

    // 定期更新会话时间和空闲时间
    const updateSessionStats = () => {
      const now = performance.now();
      statsRef.current.sessionDuration = now - sessionStartRef.current;
      statsRef.current.idleTime = now - lastActivityRef.current;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    // 定期更新会话统计
    const sessionInterval = setInterval(updateSessionStats, 1000);

    onFocus();

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      clearInterval(sessionInterval);
      onBlur();
    };
  }, [containerRef]);

  const setTrapTriggered = useCallback(() => {
    statsRef.current.trapTriggered = true;
  }, []);

  return { statsRef, setTrapTriggered };
}

// 简易滑块验证组件（拖到最右并保持稳定）
function Slider({ onComplete, disabled, showInnerHint = true }: { onComplete: () => void; disabled?: boolean; showInnerHint?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(0); // 0..1 (基于可滑动范围)
  const [done, setDone] = useState(false);
  const [trackW, setTrackW] = useState(0);
  const [trackH, setTrackH] = useState(40); // 默认高度，后续根据宽度自适应

  // 自适应：监听容器尺寸变化，按宽度计算高度（在区间内夹持）
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const w = cr.width || el.getBoundingClientRect().width || 0;
      // 高度随宽度自适应，手机上更高一点，PC 保持中等高度
      const h = Math.max(32, Math.min(56, Math.round(w * 0.12)));
      setTrackW(w);
      setTrackH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 计算圆块尺寸：略小于轨道高度，保留上下间距
  const knobSize = Math.max(24, Math.min(40, trackH - 8));
  const maxTravel = Math.max(0, trackW - knobSize);
  const leftPx = Math.round(pos * maxTravel);

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
      // 将左侧对齐到圆块中心，保证圆块不超出轨道
      const xLeft = clientX - rect.left - knobSize / 2;
      const clamped = Math.min(Math.max(xLeft, 0), rect.width - knobSize);
      const newPos = (rect.width - knobSize) > 0 ? clamped / (rect.width - knobSize) : 0;
      setPos(newPos);
      // 阻止移动端滚动
      if ((e as TouchEvent).touches) {
        try { (e as TouchEvent).preventDefault(); } catch { }
      }
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, done, knobSize]);

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

  // 进度填充到圆块中心，完成后100%
  const fillWidthPct = (() => {
    if (done) return '100%';
    const center = leftPx + knobSize / 2;
    const pct = trackW > 0 ? (center / trackW) * 100 : pos * 100;
    return `${Math.max(0, Math.min(100, pct))}%`;
  })();

  return (
    <div className={`w-full select-none ${disabled ? 'opacity-50' : ''}`}>
      <div
        ref={trackRef}
        className="relative bg-gray-200 rounded-full overflow-hidden"
        style={{ height: `${trackH}px` }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-green-400 transition-all"
          style={{ width: fillWidthPct }}
        />
        <div
          role="button"
          aria-label="slider-handle"
          className={`absolute rounded-full bg-white shadow-md border border-gray-300 flex items-center justify-center cursor-pointer`}
          style={{
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            left: `${leftPx}px`,
            top: '50%',
            transform: 'translateY(-50%)',
            touchAction: 'none'
          }}
          onMouseDown={() => !disabled && setDragging(true)}
          onTouchStart={(e) => {
            if (disabled) return;
            setDragging(true);
            try { e.preventDefault(); } catch { }
          }}
        >
          {done ? '✓' : '≡'}
        </div>
        {done ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-600">
            验证成功
          </div>
        ) : showInnerHint ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-600">
            按住滑块拖动完成验证
          </div>
        ) : null}
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
  apiBaseUrl = '/api/human-check',
  autoFetchNonce = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { statsRef, setTrapTriggered } = useBehaviorTracker(containerRef);

  const [canvasEntropy, setCanvasEntropy] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sliderOk, setSliderOk] = useState(false);
  const [sliderKey, setSliderKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(challengeNonce || null);
  const [fetchingNonce, setFetchingNonce] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // 速率限制与封禁控制
  const [bannedUntil, setBannedUntil] = useState<number | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  // 轻量心跳用于驱动 UI 刷新，使行为评分根据 statsRef 变化而更新
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => (p + 1) % 1024), 250);
    return () => clearInterval(id);
  }, []);

  // 根据缩放自动进入极简模式：仅显示“打勾 + 滑块 + 提交”
  const baseScaleRef = useRef<number>(1);
  const [isHighZoom, setIsHighZoom] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isTightViewport, setIsTightViewport] = useState(false);
  useEffect(() => {
    const ZOOM_THRESHOLD = 1.25;
    const getScale = () => (window.visualViewport?.scale || window.devicePixelRatio || 1);
    const computeIsHighZoom = () => {
      const vv = window.visualViewport;
      // 优先使用 visualViewport.scale 作为绝对缩放判定
      if (vv && typeof vv.scale === 'number') {
        return vv.scale >= ZOOM_THRESHOLD; // 阈值可按需调整（更敏感）
      }
      // 退化方案：使用绝对 DPR 判定（避免以初始缩放为基准导致初始即高缩放时检测失败）
      const dpr = window.devicePixelRatio || 1;
      return dpr >= ZOOM_THRESHOLD;
    };

    // 初始化基准缩放
    baseScaleRef.current = getScale();
    const handleResize = () => {
      setIsHighZoom(computeIsHighZoom());
      const vpw = window.visualViewport?.width ?? window.innerWidth ?? 9999;
      setIsTightViewport(vpw <= 420);
    };
    handleResize();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleResize);
      return () => vv.removeEventListener('resize', handleResize);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 监听容器宽度，过窄时也启用极简模式
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setIsNarrow((el.clientWidth || 0) <= 420);
    update();
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      setIsNarrow((w || 0) <= 420);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const isMinimal = (size === 'compact') || isHighZoom || isNarrow || isTightViewport;

  // 动态状态（依赖 pulse 触发重新计算以更新倒计时）
  const isBanned = useMemo(() => bannedUntil != null && bannedUntil > Date.now(), [bannedUntil, pulse]);
  const cooldownActive = useMemo(() => cooldownUntil != null && cooldownUntil > Date.now(), [cooldownUntil, pulse]);
  const remainingCooldownSec = useMemo(() => {
    if (!cooldownActive || !cooldownUntil) return 0;
    return Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
  }, [cooldownActive, cooldownUntil, pulse]);
  const remainingBanSec = useMemo(() => {
    if (!isBanned || !bannedUntil) return 0;
    return Math.max(1, Math.ceil((bannedUntil - Date.now()) / 1000));
  }, [isBanned, bannedUntil, pulse]);

  // 获取 nonce
  const fetchNonce = useCallback(async () => {
    if (fetchingNonce) return;
    if (isBanned) {
      setError('检测到滥用，已暂时封禁。请稍后再试。');
      setLastErrorCode('ABUSE_BANNED');
      return;
    }
    if (cooldownActive) {
      setError(`请求过于频繁，请 ${remainingCooldownSec} 秒后重试。`);
      setLastErrorCode('RATE_LIMITED');
      return;
    }

    setFetchingNonce(true);
    setError(null);

    try {
      const response = await fetchWithRetry(`${apiBaseUrl}/nonce`, {
        method: 'GET',
        headers:
        {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.success && data.nonce) {
        setNonce(data.nonce);
        setRetryCount(0);
        setCooldownUntil(null);
        setBannedUntil(null);
        setLastErrorCode(null);
      } else {
        throw new Error(data.error || '获取验证码失败');
      }
    } catch (err: any) {
      const code = err?.errorCode as string | undefined;
      const msg = (err?.errorMessage as string) || err?.message || '网络错误，请重试';
      setLastErrorCode(code || null);
      if (code === 'ABUSE_BANNED') {
        const until = (err?.banUntil as number | undefined) || (Date.now() + 60_000);
        setBannedUntil(until);
        setError('检测到滥用，已暂时封禁。请稍后再试。');
      } else if (code === 'RATE_LIMITED') {
        const ra = (err?.retryAfter as number | undefined);
        const until = Date.now() + ((ra && !Number.isNaN(ra) ? ra : 30) * 1000);
        setCooldownUntil(until);
        setError(`请求过于频繁，请 ${Math.max(1, Math.ceil((until - Date.now()) / 1000))} 秒后重试。`);
      } else {
        setError(msg);
      }
      onFail?.(code || msg);
      setRetryCount(prev => prev + 1);
    } finally {
      setFetchingNonce(false);
    }
  }, [apiBaseUrl, fetchingNonce, onFail, isBanned, cooldownActive, remainingCooldownSec]);

  // 自动获取 nonce
  useEffect(() => {
    if (autoFetchNonce && !challengeNonce && !nonce && !fetchingNonce && !isBanned && !cooldownActive) {
      fetchNonce();
    }
  }, [autoFetchNonce, challengeNonce, nonce, fetchingNonce, fetchNonce, isBanned, cooldownActive]);

  // 增强的行为评分算法（0..1）
  const score = useMemo(() => {
    const s = statsRef.current;

    // 基础行为特征评分
    const mouseActivityScore = Math.min(1, Math.log10(1 + s.mouseMoves) / 2.5);
    const keyboardActivityScore = Math.min(1, Math.log10(1 + s.keyPresses) / 2.2);
    const movementDistanceScore = Math.min(1, Math.log10(1 + s.totalDistance) / 3.2);
    const pathComplexityScore = Math.min(1, s.uniquePathPoints / 200);
    const focusEngagementScore = Math.min(1, s.focusTimeMs / 4000);

    // 高级行为模式评分
    const speedConsistencyScore = s.speedVariance > 0 ?
      Math.min(1, 1 / (1 + s.speedVariance * 0.1)) : 0.5; // 速度变化的自然性

    const accelerationNaturalnessScore = s.mouseAcceleration > 0 ?
      Math.min(1, 1 / (1 + Math.abs(s.mouseAcceleration - 0.5) * 2)) : 0.5; // 加速度的自然性

    const directionVariabilityScore = s.directionChanges > 0 ?
      Math.min(1, Math.log10(1 + s.directionChanges) / 2.0) : 0; // 方向变化的自然性

    const pausePatternScore = s.pauseCount > 0 ?
      Math.min(1, Math.log10(1 + s.pauseCount) / 1.8) : 0; // 停顿模式的人性化

    const clickPatternScore = s.clickCount > 0 ?
      Math.min(1, Math.log10(1 + s.clickCount) / 1.5) : 0; // 点击行为

    // 键盘行为模式评分
    const keyTimingNaturalnessScore = s.keyPressVariance > 0 ?
      Math.min(1, 1 / (1 + Math.abs(s.keyPressVariance - 150) * 0.01)) : 0.5; // 按键间隔的自然性

    const keyRhythmScore = s.avgKeyInterval > 0 && s.avgKeyInterval < 2000 ?
      Math.min(1, 1 / (1 + Math.abs(s.avgKeyInterval - 200) * 0.005)) : 0.3; // 按键节奏

    // 时间模式评分
    const sessionEngagementScore = Math.min(1, s.sessionDuration / 10000); // 会话参与度
    const activityConsistencyScore = s.idleTime < 5000 ? 1 : Math.max(0, 1 - (s.idleTime - 5000) / 15000); // 活跃度一致性

    // 设备特征评分（基础分）
    const deviceNaturalnessScore = s.touchSupport ? 0.8 : 0.9; // 触摸设备稍微降低基础分

    // 权重配置（可根据风险评估动态调整）
    const weights = {
      mouseActivity: 0.12,
      keyboardActivity: 0.10,
      movementDistance: 0.12,
      pathComplexity: 0.12,
      focusEngagement: 0.15,
      speedConsistency: 0.08,
      accelerationNaturalness: 0.06,
      directionVariability: 0.05,
      pausePattern: 0.04,
      clickPattern: 0.03,
      keyTimingNaturalness: 0.05,
      keyRhythm: 0.03,
      sessionEngagement: 0.03,
      activityConsistency: 0.02
    };

    // 计算加权基础分
    const baseScore =
      mouseActivityScore * weights.mouseActivity +
      keyboardActivityScore * weights.keyboardActivity +
      movementDistanceScore * weights.movementDistance +
      pathComplexityScore * weights.pathComplexity +
      focusEngagementScore * weights.focusEngagement +
      speedConsistencyScore * weights.speedConsistency +
      accelerationNaturalnessScore * weights.accelerationNaturalness +
      directionVariabilityScore * weights.directionVariability +
      pausePatternScore * weights.pausePattern +
      clickPatternScore * weights.clickPattern +
      keyTimingNaturalnessScore * weights.keyTimingNaturalness +
      keyRhythmScore * weights.keyRhythm +
      sessionEngagementScore * weights.sessionEngagement +
      activityConsistencyScore * weights.activityConsistency;

    // 应用惩罚因子
    const visibilityPenalty = Math.max(0.3, 1 - s.visibilityChanges * 0.1); // 频繁切换可见性扣分
    const trapPenalty = s.trapTriggered ? 0.1 : 1; // 触发陷阱严重扣分

    // 应用设备特征调整
    const deviceAdjustedScore = baseScore * deviceNaturalnessScore;

    // 最终评分
    const finalScore = Math.max(0, Math.min(1, deviceAdjustedScore * visibilityPenalty * trapPenalty));

    return finalScore;
  }, [pulse]);

  // 自适应阈值计算
  const adaptiveThreshold = useMemo(() => {
    const s = statsRef.current;
    let baseThreshold = SCORE_THRESHOLD;

    // 根据设备特征调整阈值
    if (s.touchSupport) {
      baseThreshold -= 0.05; // 触摸设备降低阈值
    }

    // 根据会话时间调整阈值
    if (s.sessionDuration > 30000) { // 超过30秒的长会话
      baseThreshold -= 0.03;
    }

    // 根据交互复杂度调整阈值
    const interactionComplexity = (s.mouseMoves + s.keyPresses + s.clickCount) / 100;
    if (interactionComplexity > 1) {
      baseThreshold -= Math.min(0.05, interactionComplexity * 0.02);
    }

    // 确保阈值在合理范围内
    return Math.max(0.4, Math.min(0.8, baseThreshold));
  }, [pulse]);

  // 滑块成功后的评分调整
  const effectiveScore = useMemo(() => {
    if (sliderOk) {
      // 滑块完成给予显著奖励，确保可提交，但不直接满分
      const boosted = Math.max(score, 0.95);
      return Math.min(1, boosted);
    }
    return score;
  }, [score, sliderOk]);

  // 初始化 Canvas 熵
  useEffect(() => {
    let mounted = true;
    getCanvasEntropy().then(v => { if (mounted) setCanvasEntropy(v); });
    const t = setTimeout(() => setReady(true), 400); // 给事件收集预热时间
    return () => { mounted = false; clearTimeout(t); };
  }, []);

  // 增强的蜜罐检测系统
  const trapInputRef = useRef<HTMLInputElement>(null);
  const trapInput2Ref = useRef<HTMLInputElement>(null);
  const trapInput3Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkTraps = () => {
      let trapTriggered = false;

      // 检查多个蜜罐字段
      const traps = [trapInputRef.current, trapInput2Ref.current, trapInput3Ref.current];

      traps.forEach((trap, index) => {
        if (trap) {
          // 检查值是否被填充
          if (trap.value && trap.value.length > 0) {
            trapTriggered = true;
          }

          // 检查是否被聚焦（机器人可能会聚焦隐藏字段）
          if (document.activeElement === trap) {
            trapTriggered = true;
          }

          // 检查样式是否被修改（某些机器人会尝试显示隐藏字段）
          const computedStyle = window.getComputedStyle(trap);
          if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden' && computedStyle.opacity !== '0') {
            trapTriggered = true;
          }
        }
      });

      if (trapTriggered) {
        setTrapTriggered();
      }
    };

    const trapInterval = setInterval(checkTraps, 500);

    // 立即检查一次
    checkTraps();

    return () => clearInterval(trapInterval);
  }, [setTrapTriggered]);

  const canSubmit = checked && sliderOk && ready && effectiveScore >= adaptiveThreshold && (nonce || challengeNonce) && !fetchingNonce && !isBanned;

  const handleSliderComplete = useCallback(() => setSliderOk(true), []);

  const handleCheckChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setChecked(next);
    // 每次切换复选框都强制重置滑块状态与实例，确保需要重新拖动验证
    setSliderOk(false);
    setSliderKey((k) => k + 1);
  }, []);

  const reset = useCallback(() => {
    setChecked(false);
    setSliderOk(false);
    setSliderKey((k) => k + 1);
    setSubmitting(false);
    setError(null);
    setRetryCount(0);
    // 重置时获取新的 nonce
    if (autoFetchNonce && !challengeNonce) {
      setNonce(null);
      fetchNonce();
    }
  }, [autoFetchNonce, challengeNonce, fetchNonce]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const now = Date.now();
      // 快照行为统计，防止在签名与打包阶段被异步更新导致签名与载荷不一致
      const statsSnapshot = JSON.parse(JSON.stringify(statsRef.current));
      const payload = {
        v: 1,
        ts: now,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
        ua: navigator.userAgent,
        ce: canvasEntropy,
        sc: Number(effectiveScore.toFixed(3)),
        st: statsSnapshot,
        cn: nonce || challengeNonce || null,
      };
      const payloadStr = JSON.stringify(payload);
      // 弱签名（仅用于防篡改提示，服务端不可依赖）：payload + 浏览器随机 salt
      const salt = crypto.getRandomValues(new Uint8Array(12));
      const saltB64 = btoa(String.fromCharCode(...salt));
      const sig = await sha256Base64(payloadStr + '|' + saltB64);
      // 可选调试输出：设置 localStorage SHC_DEBUG=1 以启用
      if (typeof localStorage !== 'undefined' && localStorage.getItem('SHC_DEBUG') === '1') {
        try {
          const previewPayload = payloadStr.length > 300 ? payloadStr.slice(0, 300) + '…' : payloadStr;
          console.debug('[SmartHumanCheck] sig-debug', {
            payloadLen: payloadStr.length,
            salt: saltB64,
            sig,
            previewPayload,
          });
        } catch { }
      }
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
  }, [autoReset, canvasEntropy, canSubmit, challengeNonce, nonce, onFail, onSuccess, reset, effectiveScore, statsRef]);

  const cardCls = theme === 'dark' ? 'bg-gray-800/80 text-gray-100 border-gray-700' : 'bg-white/80 text-gray-800 border-white/20';
  const subTextCls = theme === 'dark' ? 'text-gray-300' : 'text-gray-500';
  const sizeCls = size === 'compact' ? 'p-3 text-sm' : 'p-4';
  const bubbleBgCls = theme === 'dark' ? 'bg-gray-700/60 text-gray-100' : 'bg-gray-100 text-gray-700';

  return (
    <motion.div
      className={`rounded-2xl shadow-xl backdrop-blur-sm border ${cardCls} w-full max-w-md overflow-hidden`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* 顶部渐变标题栏，与 TtsPage 统一（极简模式隐藏） */}
      {!isMinimal && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 flex items-center gap-2">
          <FaShieldAlt className="text-xl" />
          <h3 className="font-semibold">人机验证</h3>
          <div className="ml-auto text-xs opacity-90 flex items-center gap-2">
            <span className="hidden sm:inline">行为评分</span>
            <span className="font-mono">{(effectiveScore * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* 主体内容 */}
      <div ref={containerRef} className={`${sizeCls} p-4`}>
        {/* 增强的蜜罐输入框系统（隐藏） */}
        <input
          ref={trapInputRef}
          type="text"
          name="shc_trap_1"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          disabled
          readOnly
          inputMode="none"
          style={{ display: 'none' }}
          className="absolute w-0 h-0 opacity-0 pointer-events-none"
        />
        <input
          ref={trapInput2Ref}
          type="text"
          name="shc_trap_2"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          disabled
          readOnly
          inputMode="none"
          style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}
        />
        <input
          ref={trapInput3Ref}
          type="text"
          name="shc_trap_3"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          disabled
          readOnly
          inputMode="none"
          style={{ opacity: 0, position: 'absolute', top: '-9999px' }}
        />

        {/* 顶部状态与提示（极简模式隐藏） */}
        {!isMinimal && (
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FaRobot className="text-blue-600" />
              <label htmlFor="shc-check" className="cursor-pointer select-none">我不是机器人</label>
            </div>
            <div className={`ml-auto text-xs ${subTextCls} flex items-center gap-2`}>
              {fetchingNonce && (
                <span className="inline-flex items-center gap-1"><FaSync className="animate-spin" /> 获取验证码...</span>
              )}
              {!fetchingNonce && (
                <span>{ready ? '已准备' : '准备中...'}</span>
              )}
              <span className="hidden sm:inline">· Canvas熵: {canvasEntropy.slice(0, 10)}</span>
              <span>· Nonce: {nonce || challengeNonce ? '✓' : '✗'}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            id="shc-check"
            type="checkbox"
            className="h-5 w-5 accent-blue-600"
            checked={checked}
            onChange={handleCheckChange}
            aria-label="我不是机器人"
          />
          {/* 极简模式：在打勾框右侧显示“人机验证”；正常模式显示评分条 */}
          {isMinimal ? (
            <label htmlFor="shc-check" className="text-sm select-none cursor-pointer">人机验证</label>
          ) : (
            <div className="flex-1">
              {/* 行为评分进度条 */}
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${effectiveScore >= adaptiveThreshold ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, Math.round(effectiveScore * 100))}%` }}
                />
              </div>
              <div className={`mt-1 text-xs ${subTextCls}`}>当前评分：{(effectiveScore * 100).toFixed(0)}% · 阈值：{(adaptiveThreshold * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>

        {/* 极简/高缩放模式：将“按住滑块拖动完成验证”从内嵌改为外部提示 */}
        {isMinimal && checked && !sliderOk && (
          <div className="mt-3 mb-1 text-center">
            <span className={`inline-block px-3 py-1 rounded-full text-sm ${bubbleBgCls}`}>
              按住滑块拖动完成验证
            </span>
          </div>
        )}

        <div className="mt-4">
          <Slider key={sliderKey} onComplete={handleSliderComplete} disabled={!checked} showInnerHint={!isMinimal} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <motion.button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={submit}
            className={`px-4 py-2 rounded-lg text-white font-medium ${canSubmit && !submitting ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
            whileHover={{ scale: canSubmit && !submitting ? 1.02 : 1 }}
            whileTap={{ scale: canSubmit && !submitting ? 0.98 : 1 }}
          >
            {submitting ? '验证中...' : '提交验证'}
          </motion.button>

          {/* 错误显示和重试按钮（极简模式隐藏，仅保留三项） */}
          {!isMinimal && error && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-500">{error}</span>
              {lastErrorCode === 'RATE_LIMITED' && cooldownActive && (
                <span className="text-xs text-gray-500">剩余 {remainingCooldownSec}s</span>
              )}
              {lastErrorCode === 'ABUSE_BANNED' && isBanned && (
                <span className="text-xs text-gray-500">解禁倒计时 {remainingBanSec}s</span>
              )}
              {retryCount < RETRY_CONFIG.maxRetries && (
                <button
                  type="button"
                  onClick={fetchNonce}
                  disabled={fetchingNonce || cooldownActive || isBanned}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {fetchingNonce ? '重试中...' : cooldownActive ? `冷却中 (${remainingCooldownSec}s)` : isBanned ? '已封禁' : '重试'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SmartHumanCheck;
