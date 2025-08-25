import { useState, useEffect } from 'react';
import { api } from '../api/api';

interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

export const useTurnstileConfig = () => {
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
        console.log('正在获取 Turnstile 配置...');
        const response = await api.get('/api/tts/turnstile/config');
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
  }, []);

  return { config, loading, error };
}; 