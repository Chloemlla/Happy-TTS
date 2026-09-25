import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFingerprint } from '../utils/fingerprint';
import {
  getStoredIpVerificationExpiry,
  initializeIpVerificationSession,
  onIpVerificationRequired,
} from '../utils/ipVerification';

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

export const useFirstVisitDetection = (enabled = true): UseFirstVisitDetectionReturn => {
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [clientIP, setClientIP] = useState<string | null>(null);
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | undefined>(undefined);
  const [banExpiresAt, setBanExpiresAt] = useState<Date | undefined>(undefined);
  const refreshTimerRef = useRef<number | null>(null);
  const checkFirstVisitRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const bootstrapInFlightRef = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearRefreshTimer();
    const expiresAt = getStoredIpVerificationExpiry();
    if (!expiresAt) return;

    const refreshAt = expiresAt - Date.now() - 60 * 1000;
    if (refreshAt <= 0) return;

    refreshTimerRef.current = window.setTimeout(() => {
      void checkFirstVisitRef.current?.(true);
    }, refreshAt);
  }, [clearRefreshTimer]);

  const checkFirstVisit = useCallback(async (silent = false) => {
    if (!enabled) {
      setError(null);
      setIsFirstVisit(false);
      setIsVerified(true);
      setIsLoading(false);
      setIsIpBanned(false);
      setBanReason(undefined);
      setBanExpiresAt(undefined);
      clearRefreshTimer();
      return;
    }

    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      const fp = await getFingerprint();
      if (!fp) {
        throw new Error('Unable to generate a browser fingerprint.');
      }

      setFingerprint(fp);

      const session = await initializeIpVerificationSession(fp);
      setClientIP(session.ipAddress || 'unknown');

      if (!session.success && !session.requiresVerification) {
        throw new Error(session.reason || 'Failed to initialize IP verification.');
      }

      setIsIpBanned(false);
      setBanReason(undefined);
      setBanExpiresAt(undefined);
      setIsFirstVisit(session.requiresVerification);
      setIsVerified(session.verified);

      if (session.requiresVerification) {
        clearRefreshTimer();
      } else {
        scheduleRefresh();
      }
    } catch (err) {
      console.error('IP verification bootstrap failed:', err);
      setError(err instanceof Error ? err.message : 'Verification bootstrap failed.');

      // G9-14：fail-closed——初始化失败时视为"未验证"，要求走验证流程，不放行。
      // 此前 catch 里 setIsFirstVisit(false) 会让失败直接放行（对安全门禁方向反了）。
      setIsFirstVisit(true);
      setIsVerified(false);

      // 从后端 403 封禁响应中读取真实封禁信息（G9-14）
      const banData = (err as { banData?: { reason?: string; expiresAt?: string } })?.banData;
      if (banData) {
        setIsIpBanned(true);
        setBanReason(banData.reason || 'IP 已被封禁');
        setBanExpiresAt(banData.expiresAt ? new Date(banData.expiresAt) : undefined);
      }

      clearRefreshTimer();
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [clearRefreshTimer, enabled, scheduleRefresh]);

  useEffect(() => {
    checkFirstVisitRef.current = checkFirstVisit;
  }, [checkFirstVisit]);

  const markAsVerified = useCallback(() => {
    setError(null);
    setIsVerified(true);
    setIsFirstVisit(false);
    scheduleRefresh();
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      setIsFirstVisit(false);
      setIsVerified(true);
      setIsLoading(false);
      clearRefreshTimer();
      return;
    }

    void checkFirstVisit();

    return () => {
      clearRefreshTimer();
    };
  }, [checkFirstVisit, clearRefreshTimer, enabled]);

  useEffect(() => {
    const unsubscribe = onIpVerificationRequired((event) => {
      if (!enabled) {
        return;
      }

      const nextError =
        typeof event.detail?.reason === 'string'
          ? event.detail.reason
          : 'IP verification is required to continue.';
      setError(nextError);

      // 服务端说"要验证"，但结论得由握手来给：直接弹挑战页会把 IP 干净的访客也挡在验证码
      // 前（他本该被静默换一张自动令牌）。所以就地重跑一次静默握手——干净 IP 换到令牌后
      // 请求自动恢复正常，真有风险才落到 isFirstVisit 上弹验证页。一批并发 403 会同时触发，
      // 用 in-flight 标志合并成一次，避免重复消耗风险查询额度。
      if (bootstrapInFlightRef.current) return;
      bootstrapInFlightRef.current = true;
      void (checkFirstVisitRef.current?.(true) ?? Promise.resolve()).finally(() => {
        bootstrapInFlightRef.current = false;
      });
    });

    return unsubscribe;
  }, [enabled]);

  return useMemo(
    () => ({
      isFirstVisit,
      isVerified,
      isLoading,
      error,
      fingerprint,
      isIpBanned,
      banReason,
      banExpiresAt,
      clientIP,
      checkFirstVisit: () => checkFirstVisit(false),
      markAsVerified,
    }),
    [banExpiresAt, banReason, checkFirstVisit, clientIP, error, fingerprint, isFirstVisit, isIpBanned, isLoading, isVerified, markAsVerified],
  );
};
