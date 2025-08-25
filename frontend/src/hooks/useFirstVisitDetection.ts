import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '../api/api';
import { 
  getFingerprint, 
  reportTempFingerprint, 
  checkTempFingerprintStatus,
  checkAccessToken,
  getAccessToken,
  verifyAccessToken,
  storeAccessToken,
  cleanupExpiredAccessTokens,
  getClientIP
} from '../utils/fingerprint';

interface UseFirstVisitDetectionReturn {
  isFirstVisit: boolean;
  isVerified: boolean;
  isLoading: boolean;
  error: string | null;
  fingerprint: string | null;
  isIpBanned: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  clientIP: string | null;
  checkFirstVisit: () => Promise<void>;
  markAsVerified: () => void;
}

export const useFirstVisitDetection = (): UseFirstVisitDetectionReturn => {
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | undefined>();
  const [banExpiresAt, setBanExpiresAt] = useState<Date | undefined>();
  const [clientIP, setClientIP] = useState<string | null>(null);

  const checkFirstVisit = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsIpBanned(false);
      setBanReason(undefined);
      setBanExpiresAt(undefined);

      // 清理过期的访问密钥
      cleanupExpiredAccessTokens();

      // 获取客户端IP地址
      const ip = await getClientIP();
      setClientIP(ip);

      // 生成指纹
      const fp = await getFingerprint();
      if (!fp) {
        throw new Error('无法生成浏览器指纹');
      }
      setFingerprint(fp);

      // 首先检查是否有有效的访问密钥
      const hasValidToken = await checkAccessToken(fp);
      if (hasValidToken) {
        console.log('发现有效访问密钥，跳过首次访问验证');
        setIsFirstVisit(false);
        setIsVerified(true);
        setIsLoading(false);
        return;
      }

      // 检查本地存储的访问密钥
      const localToken = getAccessToken(fp);
      if (localToken) {
        // 验证本地存储的密钥是否仍然有效
        const isValid = await verifyAccessToken(localToken, fp);
        if (isValid) {
          console.log('本地访问密钥有效，跳过首次访问验证');
          setIsFirstVisit(false);
          setIsVerified(true);
          setIsLoading(false);
          return;
        }
      }

      // 临时强制显示首次访问验证页面（用于测试）
      // 注释掉下面的代码来恢复正常逻辑
      setIsFirstVisit(true);
      setIsVerified(false);
      
      // 即使强制显示，也要创建临时指纹记录
      try {
        await reportTempFingerprint();
      } catch (err) {
        console.warn('创建临时指纹记录失败:', err);
        // 检查是否是IP封禁错误
        if (err instanceof Error && err.message.includes('IP已被封禁')) {
          setIsIpBanned(true);
          setBanReason(err.message);
          // 从错误对象中提取封禁信息
          const banData = (err as any).banData;
          if (banData && banData.expiresAt) {
            setBanExpiresAt(new Date(banData.expiresAt));
          }
        }
      }
      
      setIsLoading(false);
      return;

      // 正常逻辑（已注释）
      /*
      // 检查是否已经验证过
      const status = await checkTempFingerprintStatus(fp);
      if (status.exists && status.verified) {
        setIsFirstVisit(false);
        setIsVerified(true);
        return;
      }

      // 上报指纹并检查是否首次访问
      const result = await reportTempFingerprint();
      setIsFirstVisit(result.isFirstVisit);
      setIsVerified(result.verified);
      */

    } catch (err) {
      console.error('首次访问检测失败:', err);
      
      // 检查是否是IP封禁错误
      if (err instanceof Error && err.message.includes('IP已被封禁')) {
        setIsIpBanned(true);
        setBanReason(err.message);
        // 从错误对象中提取封禁信息
        const banData = (err as any).banData;
        if (banData && banData.expiresAt) {
          setBanExpiresAt(new Date(banData.expiresAt));
        }
        setError('您的IP地址已被封禁，请稍后再试');
      } else {
        setError(err instanceof Error ? err.message : '检测失败');
      }
      
      // 出错时默认不是首次访问，避免阻塞用户
      setIsFirstVisit(false);
      setIsVerified(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsVerified = useCallback(() => {
    setIsVerified(true);
    setIsFirstVisit(false);
  }, []);

  useEffect(() => {
    checkFirstVisit();
  }, [checkFirstVisit]);

  return {
    isFirstVisit,
    isVerified,
    isLoading,
    error,
    fingerprint,
    isIpBanned,
    banReason,
    banExpiresAt,
    clientIP,
    checkFirstVisit,
    markAsVerified,
  };
}; 