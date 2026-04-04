import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaptchaType } from '../utils/captchaSelection';
import { completeIpVerification } from '../utils/ipVerification';
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
  challengeReason?: string;
}

type VerificationMode = 'turnstile' | 'hcaptcha' | null;

interface BanState {
  isBanned: boolean;
  reason?: string;
  expiresAt?: Date;
}

export const FirstVisitVerification: React.FC<FirstVisitVerificationProps> = ({
  onVerificationComplete,
  fingerprint,
  isIpBanned = false,
  banReason,
  banExpiresAt,
  clientIP,
  challengeReason,
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

  useEffect(() => {
    if (challengeReason) {
      setError(challengeReason);
    }
  }, [challengeReason]);

  const verificationMode = useMemo<VerificationMode>(() => {
    if (!secureCaptchaConfig || !secureEnabled || !secureSiteKey) {
      return null;
    }

    return secureCaptchaConfig.captchaType === CaptchaType.HCAPTCHA ? 'hcaptcha' : 'turnstile';
  }, [secureCaptchaConfig, secureEnabled, secureSiteKey]);

  const serviceLabel = verificationMode === 'hcaptcha' ? 'hCaptcha' : 'Cloudflare Turnstile';

  const configError = useMemo(() => {
    if (secureSelectionLoading) return '';
    if (secureSelectionError) return secureSelectionError;
    if (!secureEnabled || !secureSiteKey || !verificationMode) {
      return 'Verification service is temporarily unavailable. Refresh and try again.';
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
    if (verificationMode === 'turnstile') return turnstileToken;
    if (verificationMode === 'hcaptcha') return hcaptchaToken;
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
    setError('The check expired. Complete it again to continue.');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setError('The verification widget did not load correctly. Refresh and retry.');
  }, []);

  const handleHCaptchaVerify = useCallback((token: string) => {
    setHCaptchaToken(token);
    setHCaptchaVerified(true);
    setError('');
  }, []);

  const handleHCaptchaExpire = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setError('The check expired. Complete it again to continue.');
  }, []);

  const handleHCaptchaError = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setError('The verification widget did not load correctly. Refresh and retry.');
  }, []);

  const handleVerify = useCallback(async () => {
    if (!verificationMode || !currentToken || !isVerified) return;

    setVerifying(true);
    setError('');

    try {
      const result = await completeIpVerification(fingerprint, currentToken, verificationMode);
      if (!result.success || !result.verified || !result.token) {
        throw new Error(result.reason || 'Verification was not accepted. Please try again.');
      }

      setNotification({
        message: 'Verification complete.',
        type: 'success',
      });

      window.setTimeout(() => {
        onVerificationComplete();
      }, 180);
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : 'Verification failed. Please try again later.';
      setError(message);
      resetChallenge(verificationMode);
      setNotification({
        message,
        type: 'error',
      });
    } finally {
      setVerifying(false);
    }
  }, [currentToken, fingerprint, isVerified, onVerificationComplete, resetChallenge, setNotification, verificationMode]);

  const fingerprintPreview = useMemo(() => {
    if (!fingerprint) return 'unavailable';
    return `${fingerprint.slice(0, 10)}...${fingerprint.slice(-6)}`;
  }, [fingerprint]);

  if (banState.isBanned) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f6f8fb] p-4">
        <div className="w-full max-w-xl rounded-[28px] border border-[#d6dbe5] bg-white px-8 py-10 shadow-[0_40px_90px_rgba(26,32,44,0.08)]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#ffd6c2] bg-[#fff4ef] text-sm font-semibold text-[#f48120]">
              !
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f48120]">Security Check</p>
              <h1 className="text-2xl font-semibold text-[#1d2735]">Access temporarily restricted</h1>
            </div>
          </div>

          <div className="space-y-4 text-sm leading-6 text-[#526071]">
            <p>{banState.reason || 'This IP is currently restricted because of repeated abnormal traffic.'}</p>
            {banState.expiresAt && (
              <p className="rounded-2xl border border-[#e7ecf3] bg-[#f8fafc] px-4 py-3 text-[#2c3948]">
                Retry after: {banState.expiresAt.toLocaleString()}
              </p>
            )}
            {clientIP && clientIP !== 'unknown' && (
              <p className="font-mono text-xs text-[#7b8796]">IP {clientIP}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#f6f8fb]">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(244,129,32,0.16),transparent_55%)]" />

      <div className="relative flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-[820px] rounded-[32px] border border-[#dde3ec] bg-white/95 shadow-[0_45px_120px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="grid gap-0 md:grid-cols-[1.18fr_0.82fr]">
            <div className="border-b border-[#edf1f5] px-8 py-8 md:border-b-0 md:border-r md:px-10 md:py-10">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#ffd6c2] bg-[#fff4ef] text-sm font-semibold text-[#f48120]">
                  CF
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f48120]">Traffic Review</p>
                  <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#1d2735]">Checking your browser</h1>
                </div>
              </div>

              <div className="mb-8 flex items-center gap-4 rounded-[24px] border border-[#eceff4] bg-[#fbfcfe] px-5 py-4">
                <div className="relative h-11 w-11">
                  <span className="absolute inset-0 rounded-full border-2 border-[#f4c7aa]/80" />
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-t-[#f48120] border-r-transparent border-b-transparent border-l-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.1, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#253140]">Review in progress</p>
                  <p className="mt-1 text-sm text-[#637082]">
                    The server requested a one-time human verification before your session token can be renewed.
                  </p>
                </div>
              </div>

              <div className="mb-8 space-y-4 text-sm leading-6 text-[#526071]">
                <p>
                  This step is triggered by the backend risk policy when the current IP or network profile looks unusual.
                  Once you pass, the access token remains valid for 40 minutes.
                </p>
                <p>
                  Verification provider: <span className="font-medium text-[#253140]">{verificationMode ? serviceLabel : 'Loading...'}</span>
                </p>
              </div>

              <div className="rounded-[24px] border border-[#eceff4] bg-[#fbfcfe] px-5 py-5">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#253140]">Complete the security challenge</p>
                  <span className="rounded-full border border-[#ffd9c8] bg-[#fff4ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f48120]">
                    Required
                  </span>
                </div>

                {secureSelectionLoading ? (
                  <div className="rounded-[20px] border border-[#eceff4] bg-white px-5 py-6 text-sm text-[#637082]">
                    Loading verification provider...
                  </div>
                ) : configError ? (
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-[#f4d2c7] bg-[#fff5f1] px-4 py-4 text-sm text-[#a34516]">
                      {configError}
                    </div>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-[18px] border border-[#1d2735] px-4 py-3 text-sm font-semibold text-[#1d2735] transition hover:bg-[#1d2735] hover:text-white"
                    >
                      Reload page
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-h-[82px] items-center justify-center rounded-[20px] border border-dashed border-[#dfe5ee] bg-white px-4 py-4">
                      <Suspense fallback={<div className="h-[78px] w-full animate-pulse rounded-[18px] bg-[#f3f6fa]" />}>
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
                          className="mt-4 rounded-[18px] border border-[#f4d2c7] bg-[#fff5f1] px-4 py-3 text-sm text-[#a34516]"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleVerify}
                        disabled={!isVerified || verifying}
                        className={`flex-1 rounded-[18px] px-5 py-3.5 text-sm font-semibold transition ${
                          !isVerified || verifying
                            ? 'cursor-not-allowed bg-[#e9edf3] text-[#9aa5b1]'
                            : 'bg-[#f48120] text-white shadow-[0_18px_30px_rgba(244,129,32,0.24)] hover:bg-[#de6f12]'
                        }`}
                      >
                        {verifying ? 'Finalizing check...' : 'Continue to site'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          resetChallenge();
                        }}
                        disabled={verifying}
                        className="rounded-[18px] border border-[#d7dde6] px-5 py-3.5 text-sm font-semibold text-[#253140] transition hover:border-[#bcc6d3] hover:bg-[#f6f8fb] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reload challenge
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-8 py-8 md:px-9 md:py-10">
              <div className="rounded-[26px] border border-[#eceff4] bg-[#fbfcfe] px-5 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8a98]">Session Context</p>

                <div className="mt-5 space-y-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a6]">Fingerprint</p>
                    <p className="mt-2 font-mono text-xs text-[#334155]">{fingerprintPreview}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a6]">IP Address</p>
                    <p className="mt-2 font-mono text-xs text-[#334155]">{clientIP || 'Detecting...'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a6]">Token Policy</p>
                    <p className="mt-2 text-sm leading-6 text-[#526071]">
                      The backend accepts this session for 40 minutes after verification and expects every frontend request
                      to carry both the fingerprint and verification token headers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[26px] border border-[#eceff4] bg-white px-5 py-5">
                <p className="text-sm font-semibold text-[#253140]">Why this page appears</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[#637082]">
                  <li>Backend fraud scoring marked the current network as risky enough to step up verification.</li>
                  <li>The challenge is one-time and bound to the current IP plus browser fingerprint.</li>
                  <li>Refreshing the site without a valid token will trigger the check again.</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
