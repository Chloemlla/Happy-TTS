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

export const useFirstVisitDetection = (): UseFirstVisitDetectionReturn => {
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [clientIP, setClientIP] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const checkFirstVisitRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

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
      setIsFirstVisit(false);
      setIsVerified(false);
      clearRefreshTimer();
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [clearRefreshTimer, scheduleRefresh]);

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
    void checkFirstVisit();

    return () => {
      clearRefreshTimer();
    };
  }, [checkFirstVisit, clearRefreshTimer]);

  useEffect(() => {
    const unsubscribe = onIpVerificationRequired((event) => {
      const nextError =
        typeof event.detail?.reason === 'string'
          ? event.detail.reason
          : 'IP verification is required to continue.';
      setError(nextError);
      setIsVerified(false);
      setIsFirstVisit(true);
      clearRefreshTimer();
    });

    return unsubscribe;
  }, [clearRefreshTimer]);

  return useMemo(
    () => ({
      isFirstVisit,
      isVerified,
      isLoading,
      error,
      fingerprint,
      isIpBanned: false,
      banReason: undefined,
      banExpiresAt: undefined,
      clientIP,
      checkFirstVisit: () => checkFirstVisit(false),
      markAsVerified,
    }),
    [checkFirstVisit, clientIP, error, fingerprint, isFirstVisit, isLoading, isVerified, markAsVerified],
  );
};
