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
  availableTypes?: CaptchaType[];
}

export const useSecureCaptchaSelection = (options: UseSecureCaptchaSelectionOptions) => {
  const [captchaConfig, setCaptchaConfig] = useState<SecureCaptchaConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedSelection, setEncryptedSelection] = useState<EncryptedCaptchaSelection | null>(null);

  const { fingerprint, availableTypes = [CaptchaType.TURNSTILE, CaptchaType.HCAPTCHA] } = options;

  /**
   * 生成安全的CAPTCHA选择并获取配置
   */
  const generateAndFetchConfig = useCallback(async () => {
    if (!fingerprint) {
      setError('浏览器指纹未提供');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 生成加密的随机选择
      const selection = generateSecureCaptchaSelection(fingerprint, availableTypes);
      setEncryptedSelection(selection);

      // 向后端请求对应的配置
      const response = await fetch(`${getApiBaseUrl()}/api/turnstile/secure-captcha-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

      console.log('安全CAPTCHA选择成功:', {
        type: data.captchaType,
        enabled: data.config.enabled,
        timestamp: new Date(selection.timestamp).toISOString()
      });

    } catch (err) {
      console.error('安全CAPTCHA选择失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setCaptchaConfig(null);
      setEncryptedSelection(null);
    } finally {
      setLoading(false);
    }
  }, [fingerprint, availableTypes]);

  /**
   * 重新生成选择
   */
  const regenerateSelection = useCallback(() => {
    setCaptchaConfig(null);
    setEncryptedSelection(null);
    setError(null);
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
   * 自动刷新过期的选择
   */
  useEffect(() => {
    if (encryptedSelection && isSelectionExpired()) {
      console.log('CAPTCHA选择已过期，自动重新生成');
      regenerateSelection();
    }
  }, [encryptedSelection, isSelectionExpired, regenerateSelection]);

  /**
   * 初始化时生成选择
   */
  useEffect(() => {
    if (fingerprint && !captchaConfig && !loading) {
      generateAndFetchConfig();
    }
  }, [fingerprint, captchaConfig, loading, generateAndFetchConfig]);

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
    siteKey: captchaConfig?.config.siteKey || '',
    enabled: captchaConfig?.config.enabled || false
  };
};
