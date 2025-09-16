import { useState, useEffect, useCallback } from 'react';
import { generateSecureCaptchaSelection, CaptchaType, EncryptedCaptchaSelection } from '../utils/captchaSelection';
import getApiBaseUrl from '../api';

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

export const useSecureCaptchaSelection = (options: UseSecureCaptchaSelectionOptions) => {
  const [captchaConfig, setCaptchaConfig] = useState<SecureCaptchaConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedSelection, setEncryptedSelection] = useState<EncryptedCaptchaSelection | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { fingerprint } = options;

  /**
   * 生成安全的CAPTCHA选择并获取配置
   */
  const generateAndFetchConfig = useCallback(async () => {
    if (!fingerprint) {
      setError('浏览器指纹未提供');
      return;
    }

    // 防止重复请求
    if (loading) {
      console.log('请求正在进行中，跳过重复请求');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 生成加密的随机选择（后端会忽略选择结果，自行决定验证码类型）
      const selection = generateSecureCaptchaSelection(fingerprint, [CaptchaType.TURNSTILE, CaptchaType.HCAPTCHA]);
      setEncryptedSelection(selection);

      // 向后端请求对应的配置

      const response = await fetch(`${getApiBaseUrl()}/api/turnstile/secure-captcha-config`, {
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
        config: data.config
      });

      console.log('后端CAPTCHA选择成功:', {
        type: data.captchaType,
        enabled: data.config.enabled,
        timestamp: new Date(selection.timestamp).toISOString(),
        note: '验证码类型由后端决定'
      });

      setHasInitialized(true);

    } catch (err) {
      console.error('安全CAPTCHA选择失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setCaptchaConfig(null);
      setEncryptedSelection(null);
    } finally {
      setLoading(false);
    }
  }, [fingerprint, loading]);

  /**
   * 重新生成选择
   */
  const regenerateSelection = useCallback(() => {
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
