import { useState, useEffect } from 'react';
import getApiBaseUrl from '../api';

interface HCaptchaConfig {
  siteKey: string;
  enabled: boolean;
}

interface UseHCaptchaConfigOptions {
  usePublicConfig?: boolean;
}

export const useHCaptchaConfig = (options: UseHCaptchaConfigOptions = {}) => {
  const [config, setConfig] = useState<HCaptchaConfig>({
    siteKey: '',
    enabled: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(null);

        // 根据选项决定使用公开配置还是管理员配置
        const endpoint = options.usePublicConfig 
          ? '/api/turnstile/public-config' 
          : '/api/turnstile/config';

        const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // 从响应中提取hCaptcha配置
        const hcaptchaConfig: HCaptchaConfig = {
          siteKey: data.hcaptchaSiteKey || '',
          enabled: data.hcaptchaEnabled || false
        };

        setConfig(hcaptchaConfig);
      } catch (err) {
        console.error('Failed to fetch hCaptcha config:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        
        // 设置默认配置
        setConfig({
          siteKey: '',
          enabled: false
        });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [options.usePublicConfig]);

  return { config, loading, error };
};
