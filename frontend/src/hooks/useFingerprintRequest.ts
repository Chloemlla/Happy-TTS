import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '../api/api';

interface FingerprintRequestStatus {
  requireFingerprint: boolean;
  requireFingerprintAt: number;
}

export const useFingerprintRequest = () => {
  const [requestStatus, setRequestStatus] = useState<FingerprintRequestStatus>({
    requireFingerprint: false,
    requireFingerprintAt: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 检查用户是否已登录
  const isUserLoggedIn = useCallback((): boolean => {
    const token = localStorage.getItem('token');
    return !!token;
  }, []);

  // 获取用户ID用于dismissal tracking
  const getUserId = useCallback((): string => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return '';
      // 简单的JWT解析获取用户ID（实际项目中可能需要更安全的方式）
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id || '';
    } catch {
      return '';
    }
  }, []);

  // 检查是否在指定时间内被dismiss过
  const isDismissedRecently = useCallback((requireFingerprintAt: number): boolean => {
    const userId = getUserId();
    if (!userId || !requireFingerprintAt) return false;

    const dismissKey = `fp_request_dismissed_${userId}_${requireFingerprintAt}`;
    const dismissedAt = localStorage.getItem(dismissKey);
    
    if (!dismissedAt) return false;
    
    const dismissTime = parseInt(dismissedAt);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000; // 1小时冷却时间
    
    return (now - dismissTime) < oneHour;
  }, [getUserId]);

  // 处理用户dismiss操作
  const handleDismiss = useCallback((shouldTrack: boolean = true): void => {
    // 如果不需要tracking（例如用户点击X按钮或背景关闭），直接返回
    if (!shouldTrack) {
      console.log('🔓 普通关闭，不进行 dismissal tracking');
      return;
    }

    const userId = getUserId();
    if (!userId || !requestStatus.requireFingerprintAt) return;

    console.log('⏰ 用户主动跳过，记录 dismissal tracking（1小时冷却）');
    const dismissKey = `fp_request_dismissed_${userId}_${requestStatus.requireFingerprintAt}`;
    localStorage.setItem(dismissKey, Date.now().toString());
    
    // 清理旧的dismiss记录（超过24小时的）
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('fp_request_dismissed_')) {
        const timestamp = parseInt(localStorage.getItem(key) || '0');
        if (now - timestamp > oneDay) {
          localStorage.removeItem(key);
        }
      }
    });
  }, [getUserId, requestStatus.requireFingerprintAt]);

  // 获取指纹请求状态
  const checkFingerprintRequest = useCallback(async (): Promise<FingerprintRequestStatus> => {
    if (!isUserLoggedIn()) {
      return { requireFingerprint: false, requireFingerprintAt: 0 };
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/admin/user/fingerprint/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`检查状态失败: ${response.status}`);
      }

      const data = await response.json();
      return {
        requireFingerprint: data.requireFingerprint || false,
        requireFingerprintAt: data.requireFingerprintAt || 0
      };
    } catch (err) {
      console.error('检查指纹请求状态失败:', err);
      throw err;
    }
  }, [isUserLoggedIn]);

  // 标记指纹请求为已完成（清除请求标志）
  // 注意：此函数现在不需要调用后端，因为 /api/turnstile/fingerprint/report 已经清除了标志
  const markFingerprintRequestCompleted = useCallback((): void => {
    // 本地状态已经在指纹上报成功后通过轮询更新
    // 这里不需要额外的后端调用
    console.log('✅ 指纹请求完成，本地状态将通过轮询自动更新');
  }, []);

  // 初始化检查
  useEffect(() => {
    const initializeCheck = async () => {
      if (!isUserLoggedIn()) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const status = await checkFingerprintRequest();
        setRequestStatus(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : '检查失败');
      } finally {
        setLoading(false);
      }
    };

    initializeCheck();
  }, [isUserLoggedIn, checkFingerprintRequest]);

  // 定期检查（每30秒）
  useEffect(() => {
    if (!isUserLoggedIn()) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await checkFingerprintRequest();
        setRequestStatus(status);
      } catch (err) {
        console.error('定期检查指纹请求状态失败:', err);
      }
    }, 30000); // 30秒检查一次

    return () => clearInterval(interval);
  }, [isUserLoggedIn, checkFingerprintRequest]);

  // 登出时清理状态
  useEffect(() => {
    if (!isUserLoggedIn()) {
      setRequestStatus({ requireFingerprint: false, requireFingerprintAt: 0 });
      setError('');
    }
  }, [isUserLoggedIn]);

  // 检查是否应该显示请求弹窗
  const shouldShowRequest = requestStatus.requireFingerprint && 
                           requestStatus.requireFingerprintAt > 0 &&
                           !loading &&
                           !isDismissedRecently(requestStatus.requireFingerprintAt);

  return {
    requestStatus,
    loading,
    error,
    shouldShowRequest,
    checkFingerprintRequest,
    markFingerprintRequestCompleted,
    handleDismiss,
    isUserLoggedIn
  };
};
