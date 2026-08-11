const SESSION_FLAG = 'synapse_checking';
const CACHE_KEY = 'synapse_detected';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

interface CacheEntry {
  result: boolean;
  timestamp: number;
}

/**
 * 智能检测 Synapse-Client 是否可用。
 *
 * 策略（按优先级）：
 * 1. localStorage 缓存 —— 上次检测结果缓存 7 天，避免重复跳转
 * 2. sessionStorage 回访 —— 从 synapse://ping 返回后自动识别
 * 3. 主动检测 —— 弹窗/跳转触发，用户需交互确认
 *
 * 非 Android 设备始终返回 false。
 */
export async function checkSynapseClientAvailable(): Promise<boolean> {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isAndroid) return false;

  // 1. 检查 localStorage 缓存
  const cached = readCache();
  if (cached !== null) return cached;

  // 2. 检查 sessionStorage 回访标记
  const wasChecking = sessionStorage.getItem(SESSION_FLAG);
  if (wasChecking) {
    sessionStorage.removeItem(SESSION_FLAG);
    writeCache(true);
    return true;
  }

  // 3. 无缓存，无回访 → 返回 null，由调用方决定是否主动检测
  return false;
}

/**
 * 执行主动检测。用 `window.open` 在新标签页打开 synapse://ping，
 * 原始页面不受影响。如果安装了客户端，新标签页会立即拉起 app；
 * 否则新标签页显示错误页面，用户可关闭。
 *
 * 调用方应在用户交互时（如点击按钮）调用此方法。
 */
export function triggerSynapseDetection(): void {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isAndroid) return;

  // 标记检测状态，以便回访时识别
  sessionStorage.setItem(SESSION_FLAG, 'true');
  window.open('synapse://ping', '_blank');
}

function readCache(): boolean | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

function writeCache(result: boolean): void {
  try {
    const entry: CacheEntry = { result, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // 无痕模式可能抛异常
  }
}