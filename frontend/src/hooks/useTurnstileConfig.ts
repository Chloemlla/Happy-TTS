import { useState, useEffect } from 'react';
import getApiBaseUrl from '../api';

interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

interface UseTurnstileConfigOptions {
  usePublicConfig?: boolean; // 是否使用公共配置接口（无需认证）
}

const maskSiteKey = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return 'present';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const debugTurnstileConfig = (..._args: unknown[]) => {};

export const useTurnstileConfig = (options: UseTurnstileConfigOptions = {}) => {
  const { usePublicConfig = false } = options;
  const [config, setConfig] = useState<TurnstileConfig>({
    enabled: false,
    siteKey: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        debugTurnstileConfig('正在获取 Turnstile 配置...', usePublicConfig ? '(公共配置)' : '(认证配置)');
        
        // 根据选项选择不同的API端点
        const endpoint = usePublicConfig ? '/api/turnstile/public-config' : '/api/turnstile/config';
        const apiBaseUrl = getApiBaseUrl();
        const url = `${apiBaseUrl}${endpoint}`;
        
        // 获取认证token（仅认证配置需要）
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (!usePublicConfig) {
          const token = localStorage.getItem('token');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }
        
        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const rawSiteKey = typeof data?.siteKey === 'string' ? data.siteKey.trim() : '';
        const enabled = Boolean(data?.enabled && rawSiteKey);
        debugTurnstileConfig('Turnstile 配置获取成功:', {
          enabled,
          siteKey: maskSiteKey(enabled ? rawSiteKey : null),
        });
        setConfig({
          enabled,
          siteKey: enabled ? rawSiteKey : null,
        });
      } catch (err) {
        if (isTurnstileConfigDebugEnabled()) {
          console.error('获取Turnstile配置失败:', err);
        }
        setError('获取验证配置失败');
        // 失败时默认关闭Turnstile
        setConfig({ enabled: false, siteKey: null });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [usePublicConfig]);

  return { config, loading, error };
}; 
