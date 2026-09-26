import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import {
  FaArrowRight,
  FaBan,
  FaCheck,
  FaCircleNotch,
  FaClock,
  FaFingerprint,
  FaGlobe,
  FaLock,
  FaRedo,
  FaShieldAlt,
} from 'react-icons/fa';
import { CaptchaType } from '../utils/captchaSelection';
import { completeIpVerification } from '../utils/ipVerification';
import { useSecureCaptchaSelection } from '../hooks/useSecureCaptchaSelection';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useNotification } from './Notification';
import { SUPPORT_EMAIL } from './PenaltyAppealActions';

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

/** 图标旋转一律交给 framer-motion，尺寸随字号走，不再手写 SVG 几何。 */
const Spinner: React.FC<{ className?: string; reducedMotion: boolean }> = ({
  className = 'h-4 w-4',
  reducedMotion,
}) => (
  <m.span
    className={`inline-flex shrink-0 items-center justify-center ${className}`}
    aria-hidden="true"
    animate={reducedMotion ? undefined : { rotate: 360 }}
    transition={{ duration: 1.1, ease: 'linear', repeat: reducedMotion ? 0 : Number.POSITIVE_INFINITY }}
  >
    <FaCircleNotch className="h-full w-full" aria-hidden="true" />
  </m.span>
);

const REVIEW_STEPS = [
  { id: 'scan', label: 'Network scan', Icon: FaGlobe },
  { id: 'challenge', label: 'Human check', Icon: FaShieldAlt },
  { id: 'token', label: 'Session token', Icon: FaLock },
] as const;

const ReviewSteps: React.FC<{ activeIndex: number }> = ({ activeIndex }) => (
  <ol className="mt-6 space-y-0">
    {REVIEW_STEPS.map((step, index) => {
      const done = index < activeIndex;
      const current = index === activeIndex;
      const Icon = step.Icon;
      const isLast = index === REVIEW_STEPS.length - 1;

      return (
        <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
          {!isLast && (
            <span
              aria-hidden="true"
              className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px ${
                done ? 'bg-[#8fce9f]' : 'bg-[#e2e8f0]'
              }`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors ${
              done
                ? 'border-[#bfe3cd] bg-[#eef9f1] text-[#2f7a4b]'
                : current
                  ? 'border-[#ffd0b4] bg-[#fff4ef] text-[#f48120]'
                  : 'border-[#e6ebf2] bg-white text-[#a7b2c0]'
            }`}
          >
            {done ? <FaCheck /> : <Icon />}
          </span>
          <span
            aria-current={current ? 'step' : undefined}
            className={`pt-1 text-xs font-semibold tracking-[0.02em] ${
              done ? 'text-[#2f7a4b]' : current ? 'text-[#1d2735]' : 'text-[#9aa5b1]'
            }`}
          >
            {step.label}
            {current && <span className="ml-2 font-medium text-[#f48120]">in progress</span>}
            {done && <span className="ml-2 font-medium text-[#2f7a4b]">passed</span>}
          </span>
        </li>
      );
    })}
  </ol>
);

const MetaRow: React.FC<{ Icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }> = ({
  Icon,
  label,
  children,
}) => (
  <div className="rounded-2xl border border-[#eaeef5] bg-white px-4 py-3">
    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b97a6]">
      <Icon className="h-3 w-3" />
      {label}
    </p>
    <div className="mt-1.5">{children}</div>
  </div>
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

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#f4f6fa]">
      {/* 均匀网格铺满整屏：不再用圆形遮罩，避免出现一圈巨大的"圆盘" */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15,23,42,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.028) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(244,129,32,0.09),transparent)]"
        aria-hidden="true"
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(244,129,32,0.55),transparent)]" />
      <div className="relative flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </div>
    </div>
  );

  if (banState.isBanned) {
    // 被拦截期间工单接口同样过不了 ipBanCheck，提交工单只会拿到 403；
    // 所以这里不给工单入口，只把管理员支持邮箱直接写出来。
    const appealSubject = encodeURIComponent('申诉：IP 访问限制');
    const appealBody = encodeURIComponent(
      [
        `拦截原因：${banState.reason || '未知'}`,
        banState.expiresAt ? `解封时间：${banState.expiresAt.toLocaleString()}` : '',
        clientIP && clientIP !== 'unknown' ? `IP：${clientIP}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    return shell(
      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[#e3e9f2] bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.25)]"
      >
        <div className="flex items-center gap-3 border-b border-[#eef2f7] bg-[#fff8f4] px-6 py-6 sm:px-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffd6c2] bg-white text-lg text-[#e0562b]">
            <FaBan />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e0562b]">
              Security check
            </p>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#1d2735] sm:text-2xl">
              Access temporarily restricted
            </h1>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6 text-sm leading-6 text-[#526071] sm:px-8 sm:py-7">
          <p>{banState.reason || 'This IP is currently restricted because of repeated abnormal traffic.'}</p>
          {banState.expiresAt && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-[#e7ecf3] bg-[#f8fafc] px-4 py-3 text-[#2c3948]">
              <FaClock className="h-3.5 w-3.5 text-[#8b97a6]" />
              <span>Retry after {banState.expiresAt.toLocaleString()}</span>
            </div>
          )}
          {clientIP && clientIP !== 'unknown' && (
            <MetaRow Icon={FaGlobe} label="IP address">
              <p className="font-mono text-xs text-[#334155]">{clientIP}</p>
            </MetaRow>
          )}
          <div className="rounded-2xl border border-[#e7ecf3] bg-[#f8fafc] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b97a6]">
              申诉方式
            </p>
            <p className="mt-2 leading-6 text-[#2c3948]">
              被拦截期间工单接口同样会被拦下，提交工单无法送达。如认为这是误判，请把上方 IP 与时间发送到{' '}
              <a
                className="font-mono font-semibold text-[#e0562b] underline decoration-[#ffd0b4] underline-offset-2"
                href={`mailto:${SUPPORT_EMAIL}?subject=${appealSubject}&body=${appealBody}`}
              >
                {SUPPORT_EMAIL}
              </a>
              ，管理员会人工核查后解封。
            </p>
          </div>
        </div>
      </m.div>,
    );
  }

  const statusPill = isVerified
    ? { className: 'border-[#bfe3cd] bg-[#eef9f1] text-[#2f7a4b]', label: 'Challenge passed' }
    : { className: 'border-[#ffd9c8] bg-[#fff4ef] text-[#f48120]', label: 'Required' };

  return shell(
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: 'easeOut' }}
      className="relative w-full max-w-[880px] overflow-hidden rounded-3xl border border-[#e3e9f2] bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.25)] xl:max-w-[1000px]"
    >
      <div className="grid md:grid-cols-[1.15fr_0.85fr]">
        <div className="px-5 py-7 sm:px-8 sm:py-9 md:px-10 md:py-11">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f48120] text-lg text-white shadow-[0_12px_24px_-10px_rgba(244,129,32,0.85)]">
              <FaShieldAlt />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f48120]">
                Traffic review
              </p>
              <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#1d2735] sm:text-[28px]">
                Checking your browser
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#526071]">
            The backend risk policy asked for a one-time human verification before your session token can be
            renewed. Finish the challenge below and you are straight back to the site.
          </p>

          <div className="mt-6 rounded-2xl border border-[#eceff4] bg-[#fbfcfe] px-5 py-5">
            <div className="flex items-center gap-3">
              <Spinner className="h-5 w-5 text-[#f48120]" reducedMotion={reducedMotion} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#253140]">
                  {isVerified ? 'Challenge accepted' : 'Review in progress'}
                </p>
                <p className="text-xs text-[#7b8796]">
                  One-time check · bound to this browser and network
                </p>
              </div>
            </div>
            <ReviewSteps activeIndex={reviewStepIndex} />
          </div>

          <div className="mt-6 rounded-2xl border border-[#eceff4] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#253140]">Complete the security challenge</p>
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={statusPill.label}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18 }}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusPill.className}`}
                >
                  {statusPill.label}
                </m.span>
              </AnimatePresence>
            </div>

            <div className="mt-4">
              {secureSelectionLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#eceff4] bg-[#fbfcfe] px-5 py-6 text-sm text-[#637082]">
                  <Spinner className="h-4 w-4 text-[#94a3b8]" reducedMotion={reducedMotion} />
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#1d2735] px-4 py-3 text-sm font-semibold text-[#1d2735] transition hover:bg-[#1d2735] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                  >
                    <FaRedo className="h-3.5 w-3.5" />
                    Reload page
                  </button>
                </div>
              ) : (
                <>
                  <m.div
                    animate={{
                      borderColor: isVerified ? '#bfe3cd' : '#dfe5ee',
                      backgroundColor: isVerified ? '#f5fbf7' : '#ffffff',
                    }}
                    transition={{ duration: 0.25 }}
                    className="flex min-h-[86px] items-center justify-center rounded-2xl border border-dashed px-4 py-4"
                  >
                    <Suspense
                      fallback={
                        <div className="flex h-[78px] w-full items-center justify-center">
                          <Spinner className="h-5 w-5 text-[#c3ccd8]" reducedMotion={reducedMotion} />
                        </div>
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
                          size="normal"
                        />
                      )}
                    </Suspense>
                  </m.div>

                  <AnimatePresence initial={false}>
                    {error && (
                      <m.div
                        initial={{ opacity: 0, y: 8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        className="overflow-hidden"
                        role="alert"
                      >
                        <div className="mt-4 rounded-2xl border border-[#f4d2c7] bg-[#fff5f1] px-4 py-3 text-sm text-[#a34516]">
                          {error}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <m.button
                      type="button"
                      onClick={handleVerify}
                      disabled={!isVerified || verifying}
                      whileTap={reducedMotion || !isVerified || verifying ? undefined : { scale: 0.985 }}
                      className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f48120]/45 focus-visible:ring-offset-2 ${
                        !isVerified || verifying
                          ? 'cursor-not-allowed bg-[#e9edf3] text-[#9aa5b1]'
                          : 'bg-[#f48120] text-white shadow-[0_18px_30px_-12px_rgba(244,129,32,0.75)] hover:bg-[#de6f12]'
                      }`}
                      aria-busy={verifying}
                    >
                      {verifying ? (
                        <>
                          <Spinner className="h-4 w-4 text-white" reducedMotion={reducedMotion} />
                          Finalizing check...
                        </>
                      ) : (
                        <>
                          Continue to site
                          <FaArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </m.button>

                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        resetChallenge();
                      }}
                      disabled={verifying}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d7dde6] px-5 py-3.5 text-sm font-semibold text-[#253140] transition hover:border-[#bcc6d3] hover:bg-[#f6f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FaRedo className="h-3.5 w-3.5" />
                      Reload challenge
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="mt-5 text-xs text-[#8b97a6]">
            Powered by {verificationMode ? serviceLabel : 'the site verification provider'} · tokens are never
            stored in logs or URLs.
          </p>
        </div>

        <div className="border-t border-[#eef2f7] bg-[#fafbfe] px-5 py-7 sm:px-8 sm:py-9 md:border-l md:border-t-0 md:px-9 md:py-11">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8a98]">
            Session context
          </p>

          <div className="mt-4 space-y-3">
            <MetaRow Icon={FaFingerprint} label="Fingerprint">
              <p className="truncate font-mono text-xs text-[#334155]">{fingerprintPreview}</p>
            </MetaRow>

            <MetaRow Icon={FaGlobe} label="IP address">
              <p className="truncate font-mono text-xs text-[#334155]">{clientIP || 'Detecting...'}</p>
            </MetaRow>

            <MetaRow Icon={FaClock} label="Token policy">
              <p className="text-xs leading-5 text-[#526071]">
                The session is accepted for 40 minutes after verification. Every API request carries the
                fingerprint and the verification token, so the check does not come back on reload.
              </p>
            </MetaRow>
          </div>

          <div className="mt-6 rounded-2xl border border-[#eceff4] bg-white px-5 py-5">
            <p className="text-sm font-semibold text-[#253140]">Why this page appears</p>
            <ul className="mt-3.5 space-y-3 text-xs leading-5 text-[#637082]">
              {[
                'Backend fraud scoring marked the current network as risky enough to step up verification.',
                'The challenge is one-time and bound to the current IP plus browser fingerprint.',
                'A passed challenge lasts 40 minutes; refreshing inside that window keeps your session.',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <FaCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#c9a48f]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </m.div>,
  );
};
