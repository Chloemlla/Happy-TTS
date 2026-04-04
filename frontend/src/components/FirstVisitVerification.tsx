import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaptchaType } from '../utils/captchaSelection';
import { storeAccessToken, verifyTempFingerprint } from '../utils/fingerprint';
import { useSecureCaptchaSelection } from '../hooks/useSecureCaptchaSelection';
import { useNotification } from './Notification';

const TurnstileWidget = lazy(() =>
  import('./TurnstileWidget').then((module) => ({ default: module.TurnstileWidget })),
);
const HCaptchaWidget = lazy(() => import('./HCaptchaWidget'));

interface FirstVisitVerificationProps {
  onVerificationComplete: () => void;
  fingerprint: string;
  isIpBanned?: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  clientIP?: string | null;
}

type VerificationMode = 'turnstile' | 'hcaptcha' | null;

interface BanState {
  isBanned: boolean;
  reason?: string;
  expiresAt?: Date;
}

const LOGO_URL = 'https://picui.ogmua.cn/s1/2026/03/29/69c8f6226a17c.webp';

export const FirstVisitVerification: React.FC<FirstVisitVerificationProps> = ({
  onVerificationComplete,
  fingerprint,
  isIpBanned = false,
  banReason,
  banExpiresAt,
  clientIP,
}) => {
  const { setNotification } = useNotification();
  const {
    captchaConfig: secureCaptchaConfig,
    loading: secureSelectionLoading,
    error: secureSelectionError,
    siteKey: secureSiteKey,
    enabled: secureEnabled,
  } = useSecureCaptchaSelection({ fingerprint });

  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [hcaptchaToken, setHCaptchaToken] = useState('');
  const [hcaptchaVerified, setHCaptchaVerified] = useState(false);
  const [hcaptchaKey, setHCaptchaKey] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [banState, setBanState] = useState<BanState>({
    isBanned: isIpBanned,
    reason: banReason,
    expiresAt: banExpiresAt,
  });

  useEffect(() => {
    setBanState({
      isBanned: isIpBanned,
      reason: banReason,
      expiresAt: banExpiresAt,
    });
  }, [isIpBanned, banReason, banExpiresAt]);

  const verificationMode = useMemo<VerificationMode>(() => {
    if (!secureCaptchaConfig || !secureEnabled || !secureSiteKey) {
      return null;
    }

    return secureCaptchaConfig.captchaType === CaptchaType.HCAPTCHA ? 'hcaptcha' : 'turnstile';
  }, [secureCaptchaConfig, secureEnabled, secureSiteKey]);

  const serviceLabel = verificationMode === 'hcaptcha' ? 'hCaptcha' : 'Cloudflare Turnstile';

  const configError = useMemo(() => {
    if (secureSelectionLoading) {
      return '';
    }
    if (secureSelectionError) {
      return secureSelectionError;
    }
    if (!secureEnabled || !secureSiteKey || !verificationMode) {
      return 'Verification service is unavailable. Refresh and try again.';
    }
    return '';
  }, [secureEnabled, secureSelectionError, secureSelectionLoading, secureSiteKey, verificationMode]);

  const isVerified = useMemo(() => {
    if (verificationMode === 'turnstile') {
      return turnstileVerified && Boolean(turnstileToken);
    }
    if (verificationMode === 'hcaptcha') {
      return hcaptchaVerified && Boolean(hcaptchaToken);
    }
    return false;
  }, [hcaptchaToken, hcaptchaVerified, turnstileToken, turnstileVerified, verificationMode]);

  const currentToken = useMemo(() => {
    if (verificationMode === 'turnstile') {
      return turnstileToken;
    }
    if (verificationMode === 'hcaptcha') {
      return hcaptchaToken;
    }
    return '';
  }, [hcaptchaToken, turnstileToken, verificationMode]);

  const resetChallenge = useCallback(
    (mode: VerificationMode = verificationMode) => {
      if (mode === 'turnstile') {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey((value) => value + 1);
        return;
      }

      if (mode === 'hcaptcha') {
        setHCaptchaToken('');
        setHCaptchaVerified(false);
        setHCaptchaKey((value) => value + 1);
      }
    },
    [verificationMode],
  );

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setError('');
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setError('Turnstile expired. Please complete it again.');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setError('Turnstile failed to load or verify. Refresh and try again.');
  }, []);

  const handleHCaptchaVerify = useCallback((token: string) => {
    setHCaptchaToken(token);
    setHCaptchaVerified(true);
    setError('');
  }, []);

  const handleHCaptchaExpire = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setError('hCaptcha expired. Please complete it again.');
  }, []);

  const handleHCaptchaError = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setError('hCaptcha failed to load or verify. Refresh and try again.');
  }, []);

  const handleVerify = useCallback(async () => {
    if (!verificationMode || !currentToken || !isVerified) {
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const result = await verifyTempFingerprint(fingerprint, currentToken, verificationMode);
      if (!result.success) {
        throw new Error('Verification was not accepted. Please complete the challenge again.');
      }

      if (result.accessToken) {
        storeAccessToken(fingerprint, result.accessToken);
      }

      setNotification({
        message: 'Verification succeeded. Redirecting...',
        type: 'success',
      });

      window.setTimeout(() => {
        onVerificationComplete();
      }, 250);
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : 'Verification failed. Please try again later.';
      const banData =
        verifyError && typeof verifyError === 'object' && 'banData' in verifyError
          ? (verifyError as { banData?: { reason?: string; expiresAt?: string } }).banData
          : undefined;

      if (banData) {
        setBanState({
          isBanned: true,
          reason: banData.reason || message,
          expiresAt: banData.expiresAt ? new Date(banData.expiresAt) : undefined,
        });
      } else {
        setError(message);
        resetChallenge(verificationMode);
        setNotification({
          message,
          type: 'error',
        });
      }
    } finally {
      setVerifying(false);
    }
  }, [currentToken, fingerprint, isVerified, onVerificationComplete, resetChallenge, setNotification, verificationMode]);

  if (banState.isBanned) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-red-50 p-4"
        data-component="FirstVisitVerification"
        data-page="FirstVisitVerification"
        data-view="FirstVisitVerification"
      >
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-500">
            !
          </div>
          <h1 className="text-2xl font-bold text-red-700">Access blocked</h1>
          <p className="mt-4 text-sm text-gray-600">
            {banState.reason || 'This IP is temporarily blocked. Please try again later.'}
          </p>
          {banState.expiresAt && (
            <p className="mt-3 text-xs text-gray-500">
              Unblock time: {banState.expiresAt.toLocaleString()}
            </p>
          )}
          {clientIP && clientIP !== 'unknown' && (
            <p className="mt-2 text-xs text-gray-400">Client IP: {clientIP}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 p-4"
      data-component="FirstVisitVerification"
      data-page="FirstVisitVerification"
      data-view="FirstVisitVerification"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-[#8ECAE6]/30 bg-white/95 p-8 shadow-2xl backdrop-blur-sm"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#8ECAE6]/10 shadow-inner">
            <img src={LOGO_URL} alt="Synapse Logo" className="h-14 w-14 rounded-2xl object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-[#023047]">Welcome</h1>
          <p className="mt-2 text-sm text-[#023047]/65">
            Complete a quick human verification before entering.
          </p>
          {verificationMode && (
            <p className="mt-2 text-xs text-[#219EBC]">
              Verification service: {serviceLabel}
            </p>
          )}
          {clientIP && clientIP !== 'unknown' && (
            <p className="mt-1 text-[11px] text-[#023047]/45">Client IP: {clientIP}</p>
          )}
        </div>

        {secureSelectionLoading ? (
          <div className="rounded-2xl border border-[#8ECAE6]/20 bg-[#8ECAE6]/8 p-6 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#8ECAE6]/30 border-t-[#219EBC]" />
            <p className="text-sm text-[#023047]/70">Loading verification service...</p>
          </div>
        ) : configError ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {configError}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-2xl bg-[#023047] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#034a68]"
            >
              Refresh page
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex justify-center">
              <Suspense
                fallback={
                  <div className="h-[78px] w-full animate-pulse rounded-2xl bg-[#8ECAE6]/10" />
                }
              >
                {verificationMode === 'turnstile' ? (
                  <TurnstileWidget
                    key={turnstileKey}
                    siteKey={secureSiteKey}
                    onVerify={handleTurnstileVerify}
                    onExpire={handleTurnstileExpire}
                    onError={handleTurnstileError}
                  />
                ) : (
                  <HCaptchaWidget
                    key={hcaptchaKey}
                    siteKey={secureSiteKey}
                    onVerify={handleHCaptchaVerify}
                    onExpire={handleHCaptchaExpire}
                    onError={handleHCaptchaError}
                    theme="light"
                    size="normal"
                  />
                )}
              </Suspense>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleVerify}
                disabled={!isVerified || verifying}
                className={`w-full rounded-2xl px-4 py-4 text-base font-semibold transition-all ${
                  !isVerified || verifying
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                    : 'bg-[#FFB703] text-[#023047] shadow-lg shadow-[#FFB703]/20 hover:bg-[#FB8500]'
                }`}
              >
                {verifying ? 'Verifying...' : 'Continue'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  resetChallenge();
                }}
                disabled={verifying}
                className="w-full rounded-2xl border border-[#8ECAE6]/30 bg-[#8ECAE6]/10 px-4 py-3 text-sm font-medium text-[#023047] transition-colors hover:bg-[#8ECAE6]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reload challenge
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-[#023047]/45">
              This check only filters abnormal traffic and does not affect normal use.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
};
