import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaptchaType } from '../utils/captchaSelection';
import { completeIpVerification } from '../utils/ipVerification';
import { useSecureCaptchaSelection } from '../hooks/useSecureCaptchaSelection';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useNotification } from './Notification';
import { PenaltyAppealActions } from './PenaltyAppealActions';

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

/**
 * 验证圆环的单一几何来源：静态轨道与旋转弧共用同一个 <circle>
 * （同圆心、同半径、同线宽），弧只用 strokeDasharray 截出来。
 *
 * 旧实现是「border 圆环 + border-top 弧」两层 DOM：弧的两端走 45° 斜接、
 * 内外半径不等，元素越大越明显偏离轨道圆 —— 这就是宽屏（sm:h-11）下
 * 「圆圈和绕动的环不是一样的」的根因。改成 SVG 后任何断点都同心等粗。
 */
const RING_VIEWBOX = 44;
const RING_CENTER = RING_VIEWBOX / 2;
/** 留出描边空间，弧不会被容器裁切（22 + 20 + 1.25 < 44）。 */
const RING_RADIUS = RING_CENTER - 2;
const RING_TRACK_COLOR = '#f7d2b4';
const RING_ARC_COLOR = '#f48120';
const RING_ARC_FRACTION = 0.28;

/** 徽标圆与圆环共用同一组尺寸常量，避免两者在大屏上直径打架。 */
const ACCENT_BADGE_SHELL_CLASS =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ffd6c2] bg-[#fff4ef] text-sm font-semibold text-[#f48120]';
const RING_SHELL_CLASS = 'pointer-events-none relative h-11 w-11 shrink-0';

const VerificationRing: React.FC<{
  className?: string;
  reducedMotion: boolean;
  trackColor?: string;
  arcColor?: string;
  strokeWidth?: number;
  label?: string;
}> = ({
  className = RING_SHELL_CLASS,
  reducedMotion,
  trackColor = RING_TRACK_COLOR,
  arcColor = RING_ARC_COLOR,
  strokeWidth = 2.5,
  label,
}) => {
  const circumference = 2 * Math.PI * RING_RADIUS;
  const arcLength = circumference * RING_ARC_FRACTION;

  return (
    <div
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-busy={label ? true : undefined}
    >
      <motion.div
        className="absolute inset-0"
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={{
          duration: 1.4,
          ease: 'linear',
          repeat: reducedMotion ? 0 : Number.POSITIVE_INFINITY,
        }}
      >
        <svg
          viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`}
          className="h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          />
        </svg>
      </motion.div>
    </div>
  );
};

const REVIEW_STEPS = [
  { id: 'scan', label: 'Network scan' },
  { id: 'challenge', label: 'Human check' },
  { id: 'token', label: 'Session token' },
] as const;

const ReviewSteps: React.FC<{ activeIndex: number }> = ({ activeIndex }) => (
  <ol className="mt-5 flex flex-wrap items-center gap-2">
    {REVIEW_STEPS.map((step, index) => {
      const done = index < activeIndex;
      const current = index === activeIndex;

      return (
        <li key={step.id} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden="true" className="h-px w-4 bg-[#e2e8f0]" />}
          <span
            aria-current={current ? 'step' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              done
                ? 'border-[#cbe8d6] bg-[#f4fbf7] text-[#2f7a4b]'
                : current
                  ? 'border-[#ffd9c8] bg-[#fff4ef] text-[#f48120]'
                  : 'border-[#eaeef5] bg-white text-[#94a1b0]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                done ? 'bg-[#3f9d63]' : current ? 'animate-pulse bg-[#f48120]' : 'bg-[#d3dbe5]'
              }`}
            />
            {done ? 'Passed' : step.label}
          </span>
        </li>
      );
    })}
  </ol>
);

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
  const reducedMotion = useReducedMotion();
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

  // 0 = 解析验证码配置，1 = 等待人机挑战，2 = 挑战已过、正在换发会话令牌
  const reviewStepIndex = secureSelectionLoading || !verificationMode ? 0 : isVerified ? 2 : 1;

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
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#f6f8fb]">
        <div className="pointer-events-none fixed inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,rgba(244,129,32,0.18),transparent_58%)]" />
        <div className="relative flex min-h-full items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          <div className="relative w-full max-w-xl rounded-2xl border border-[#dde3ec] bg-white/95 px-6 py-8 shadow-[0_28px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:px-9 sm:py-10">
            <div className="mb-8 flex items-center gap-3">
              <div className={ACCENT_BADGE_SHELL_CLASS}>
                !
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f48120]">Security Check</p>
                <h1 className="text-xl sm:text-2xl font-semibold text-[#1d2735]">Access temporarily restricted</h1>
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
              <PenaltyAppealActions
                kind="ip_ban"
                reason={banState.reason}
                remainingText={banState.expiresAt ? banState.expiresAt.toLocaleString() : undefined}
                details={clientIP && clientIP !== 'unknown' ? `IP: ${clientIP}` : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#f6f8fb]">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          maskImage: 'radial-gradient(circle at 50% 28%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(circle at 50% 28%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 78%)',
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-60 bg-[radial-gradient(circle_at_top,rgba(244,129,32,0.18),transparent_58%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(226,232,240,0.55))]" />

      <div className="relative flex min-h-full items-center justify-center px-4 py-8 sm:px-6 sm:py-12 xl:py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative w-full max-w-[860px] xl:max-w-[980px] rounded-2xl border border-[#dde3ec] bg-white/95 shadow-[0_28px_70px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="grid gap-0 md:grid-cols-[1.18fr_0.82fr]">
            <div className="border-b border-[#edf1f5] px-4 py-6 md:border-b-0 md:border-r md:px-10 md:py-10 xl:px-12 xl:py-12">
              <div className="mb-7 flex items-center gap-3">
                <div className={ACCENT_BADGE_SHELL_CLASS}>
                  CF
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f48120]">Traffic Review</p>
                  <h1 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.03em] text-[#1d2735]">Checking your browser</h1>
                </div>
              </div>

              <div className="mb-7 flex items-start gap-4 rounded-2xl border border-[#eceff4] bg-[#fbfcfe] px-5 py-4">
                <VerificationRing reducedMotion={reducedMotion} label="Security review in progress" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#253140]">Review in progress</p>
                  <p className="mt-1 text-sm leading-6 text-[#637082]">
                    The server requested a one-time human verification before your session token can be
                    renewed.
                  </p>
                  <ReviewSteps activeIndex={reviewStepIndex} />
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

              <div className="rounded-2xl border border-[#eceff4] bg-[#fbfcfe] px-5 py-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#253140]">Complete the security challenge</p>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      isVerified
                        ? 'border-[#cbe8d6] bg-[#f4fbf7] text-[#2f7a4b]'
                        : 'border-[#ffd9c8] bg-[#fff4ef] text-[#f48120]'
                    }`}
                  >
                    {isVerified ? 'Challenge passed' : 'Required'}
                  </span>
                </div>

                {secureSelectionLoading ? (
                  <div className="rounded-2xl border border-[#eceff4] bg-white px-5 py-6 text-sm text-[#637082]">
                    Loading verification provider...
                  </div>
                ) : configError ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[#f4d2c7] bg-[#fff5f1] px-4 py-4 text-sm text-[#a34516]">
                      {configError}
                    </div>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-2xl border border-[#1d2735] px-4 py-3 text-sm font-semibold text-[#1d2735] transition hover:bg-[#1d2735] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                    >
                      Reload page
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className={`flex min-h-[86px] items-center justify-center rounded-2xl border border-dashed px-4 py-4 transition-colors ${
                        isVerified ? 'border-[#bfe3cd] bg-[#f5fbf7]' : 'border-[#dfe5ee] bg-white'
                      }`}
                    >
                      <Suspense fallback={<div className="h-[78px] w-full animate-pulse rounded-2xl bg-[#f3f6fa]" />}>
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
                          className="mt-4 rounded-2xl border border-[#f4d2c7] bg-[#fff5f1] px-4 py-3 text-sm text-[#a34516]"
                          role="alert"
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
                        className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f48120]/45 focus-visible:ring-offset-2 ${
                          !isVerified || verifying
                            ? 'cursor-not-allowed bg-[#e9edf3] text-[#9aa5b1]'
                            : 'bg-[#f48120] text-white shadow-[0_18px_30px_rgba(244,129,32,0.24)] hover:bg-[#de6f12]'
                        }`}
                        aria-busy={verifying}
                      >
                        {verifying && (
                          <VerificationRing
                            className="pointer-events-none h-4 w-4 shrink-0"
                            reducedMotion={reducedMotion}
                            trackColor="rgba(255,255,255,0.35)"
                            arcColor="#ffffff"
                            strokeWidth={5}
                          />
                        )}
                        {verifying ? 'Finalizing check...' : 'Continue to site'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          resetChallenge();
                        }}
                        disabled={verifying}
                        className="rounded-2xl border border-[#d7dde6] px-5 py-3.5 text-sm font-semibold text-[#253140] transition hover:border-[#bcc6d3] hover:bg-[#f6f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reload challenge
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-4 py-6 md:px-9 md:py-10 xl:px-11 xl:py-12">
              <div className="rounded-2xl border border-[#eceff4] bg-[#fbfcfe] px-5 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8a98]">Session Context</p>

                <div className="mt-5 space-y-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a6]">Fingerprint</p>
                    <p className="mt-2 truncate rounded-xl border border-[#eaeef5] bg-white px-3 py-2 font-mono text-xs text-[#334155]">
                      {fingerprintPreview}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a6]">IP Address</p>
                    <p className="mt-2 truncate rounded-xl border border-[#eaeef5] bg-white px-3 py-2 font-mono text-xs text-[#334155]">
                      {clientIP || 'Detecting...'}
                    </p>
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

              <div className="mt-6 rounded-2xl border border-[#eceff4] bg-white px-5 py-5">
                <p className="text-sm font-semibold text-[#253140]">Why this page appears</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[#637082]">
                  {[
                    'Backend fraud scoring marked the current network as risky enough to step up verification.',
                    'The challenge is one-time and bound to the current IP plus browser fingerprint.',
                    'Refreshing the site without a valid token will trigger the check again.',
                  ].map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f4c7aa]"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
