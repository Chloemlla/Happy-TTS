import { useState, useEffect } from 'react';
import { api } from '../api/api';

interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

interface UseTurnstileConfigOptions {
  usePublicConfig?: boolean; // 是否使用公共配置接口（无需认证）
}

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
        console.log('正在获取 Turnstile 配置...', usePublicConfig ? '(公共配置)' : '(认证配置)');
        
        // 根据选项选择不同的API端点
        const endpoint = usePublicConfig ? '/api/turnstile/public-config' : '/api/turnstile/config';
        const response = await api.get(endpoint);
        
        console.log('Turnstile 配置获取成功:', response.data);
        setConfig(response.data);
      } catch (err) {
        console.error('获取Turnstile配置失败:', err);
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