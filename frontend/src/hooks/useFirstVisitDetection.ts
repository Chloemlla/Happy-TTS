import { useCallback, useEffect, useState } from 'react';
import {
  checkAccessToken,
  checkTempFingerprintStatus,
  cleanupExpiredAccessTokens,
  getAccessToken,
  getClientIP,
  getFingerprint,
  reportTempFingerprint,
  verifyAccessToken,
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

      cleanupExpiredAccessTokens();

      const [ip, fp] = await Promise.all([getClientIP(), getFingerprint()]);
      setClientIP(ip);

      if (!fp) {
        throw new Error('Unable to generate a browser fingerprint.');
      }

      setFingerprint(fp);

      const hasValidServerToken = await checkAccessToken(fp);
      if (hasValidServerToken) {
        setIsFirstVisit(false);
        setIsVerified(true);
        return;
      }

      const localToken = getAccessToken(fp);
      if (localToken) {
        const isLocalTokenValid = await verifyAccessToken(localToken, fp);
        if (isLocalTokenValid) {
          setIsFirstVisit(false);
          setIsVerified(true);
          return;
        }
      }

      const tempFingerprintStatus = await checkTempFingerprintStatus(fp);
      if (tempFingerprintStatus.exists) {
        setIsFirstVisit(!tempFingerprintStatus.verified);
        setIsVerified(tempFingerprintStatus.verified);
        return;
      }

      const reportResult = await reportTempFingerprint(fp);
      setIsFirstVisit(!reportResult.verified);
      setIsVerified(reportResult.verified);
    } catch (err) {
      console.error('First-visit detection failed:', err);

      if (err instanceof Error && err.message.includes('IP')) {
        setIsIpBanned(true);
        setBanReason(err.message);

        const banData =
          err && typeof err === 'object' && 'banData' in err
            ? (err as { banData?: { expiresAt?: string } }).banData
            : undefined;

        if (banData?.expiresAt) {
          setBanExpiresAt(new Date(banData.expiresAt));
        }

        setError('This IP is currently blocked. Please try again later.');
      } else {
        setError(err instanceof Error ? err.message : 'Detection failed.');
      }

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
