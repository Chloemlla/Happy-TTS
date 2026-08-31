import { useState, useEffect, useCallback, useRef } from 'react';
import { generateSecureCaptchaSelection, CaptchaType, EncryptedCaptchaSelection } from '../utils/captchaSelection';
import getApiBaseUrl from '../api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

interface SecureCaptchaConfig {
  captchaType: CaptchaType;
  config: {
    enabled: boolean;
    siteKey: string;
  };
}

interface UseSecureCaptchaSelectionOptions {
  fingerprint: string;
  // availableTypes 已移除，由后端决定
}

const MAX_INIT_FAILURES = 5; // 连续失败达到上限后停止自动重试，避免打爆 publicLimiter
const INIT_FAILURE_BACKOFF_MS = 2000; // 失败后的基础退避时间

export const useSecureCaptchaSelection = (options: UseSecureCaptchaSelectionOptions) => {
  const [captchaConfig, setCaptchaConfig] = useState<SecureCaptchaConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedSelection, setEncryptedSelection] = useState<EncryptedCaptchaSelection | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { fingerprint } = options;

  // 用 ref 持有可变状态，避免把它们放进 useCallback 依赖导致回调随 loading 重建
  const loadingRef = useRef(false);
  const failureCountRef = useRef(0);

  /**
   * 生成安全的CAPTCHA选择并获取配置
   */
  const generateAndFetchConfig = useCallback(async () => {
    if (!fingerprint) {
      setError('浏览器指纹未提供');
      return;
    }

    // 防止重复请求（用 ref 而非 state，保持回调引用稳定）
    if (loadingRef.current) {
      console.log('请求正在进行中，跳过重复请求');
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      // 生成加密的随机选择（后端会忽略选择结果，自行决定验证码类型）
      const selection = generateSecureCaptchaSelection(fingerprint, [CaptchaType.TURNSTILE, CaptchaType.HCAPTCHA]);
      setEncryptedSelection(selection);

      // 向后端请求对应的配置
      const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/turnstile/secure-captcha-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          encryptedData: selection.encryptedData,
          timestamp: selection.timestamp,
          hash: selection.hash,
          fingerprint
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取CAPTCHA配置失败');
      }

      setCaptchaConfig({
        captchaType: data.captchaType,
        config: {
          enabled: Boolean(data?.config?.enabled),
          siteKey: typeof data?.config?.siteKey === 'string' ? data.config.siteKey : '',
        }
      });

      console.log('后端CAPTCHA选择成功:', {
        type: data.captchaType,
        enabled: data.config.enabled,
        timestamp: new Date(selection.timestamp).toISOString(),
        note: '验证码类型由后端决定'
      });

      failureCountRef.current = 0;
      setHasInitialized(true);

    } catch (err) {
      console.error('安全CAPTCHA选择失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setCaptchaConfig(null);
      setEncryptedSelection(null);

      // 失败计数 + 指数退避：消除"失败→loading翻转→回调重建→再触发"的无限重试环。
      // 达到上限后置 hasInitialized=true，初始化 effect 不再重跑，改由用户主动 regenerate。
      failureCountRef.current += 1;
      if (failureCountRef.current >= MAX_INIT_FAILURES) {
        console.warn(`安全CAPTCHA初始化连续失败 ${MAX_INIT_FAILURES} 次，停止自动重试，等待用户手动刷新`);
        setHasInitialized(true);
      } else {
        const backoffMs = INIT_FAILURE_BACKOFF_MS * Math.pow(2, Math.min(failureCountRef.current - 1, 4));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fingerprint]);

  /**
   * 重新生成选择
   */
  const regenerateSelection = useCallback(() => {
    failureCountRef.current = 0;
    setCaptchaConfig(null);
    setEncryptedSelection(null);
    setError(null);
    setHasInitialized(false);
    generateAndFetchConfig();
  }, [generateAndFetchConfig]);

  /**
   * 检查选择是否过期
   */
  const isSelectionExpired = useCallback(() => {
    if (!encryptedSelection) return true;

    const now = Date.now();
    const timeDiff = now - encryptedSelection.timestamp;
    return timeDiff > 4 * 60 * 1000; // 4分钟后过期（留1分钟缓冲）
  }, [encryptedSelection]);

  /**
   * 初始化时生成选择（只执行一次）
   */
  useEffect(() => {
    if (fingerprint && !hasInitialized && !loading && !captchaConfig) {
      console.log('初始化CAPTCHA配置');
      generateAndFetchConfig();
    }
  }, [fingerprint, hasInitialized, loading, captchaConfig, generateAndFetchConfig]);

  return {
    captchaConfig,
    loading,
    error,
    encryptedSelection,
    regenerateSelection,
    isSelectionExpired,
    // 便利方法
    isTurnstile: captchaConfig?.captchaType === CaptchaType.TURNSTILE,
    isHCaptcha: captchaConfig?.captchaType === CaptchaType.HCAPTCHA,
    siteKey: typeof captchaConfig?.config.siteKey === 'string' ? captchaConfig.config.siteKey : '',
    enabled: captchaConfig?.config.enabled || false
  };
};
