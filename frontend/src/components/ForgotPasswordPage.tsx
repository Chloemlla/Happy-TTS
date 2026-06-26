import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { FaEnvelope, FaArrowLeft, FaVolumeUp, FaKey, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint, getClientIP } from '../utils/fingerprint';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
    authAlertClassName,
    authBackLinkClassName,
    authBrandBlockClassName,
    authBrandPillClassName,
    authBrandSubtitleClassName,
    authBrandTitleClassName,
    authCardBodyClassName,
    authCardClassName,
    authCardHeaderClassName,
    authDescriptionClassName,
    authEyebrowClassName,
    authFieldClassName,
    authFieldIconClassName,
    authFormClassName,
    authFrameClassName,
    authHeaderBadgeClassName,
    authInfoPanelClassName,
    authLabelClassName,
    authMutedLinkClassName,
    authPageShellClassName,
    authPrimaryButtonClassName,
    authSuccessPanelClassName,
    authTitleClassName,
    authWarningPanelClassName,
    studioPageFont,
} from './authStudioTheme';
import { cn } from '../utils/cn';

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const CARD_TRANSITION = { duration: 0.45, type: 'spring', stiffness: 130 } as const;
const ITEM_HOVER = { scale: 1.01, y: -1 } as const;
const BUTTON_TAP = { scale: 0.99 } as const;

export const ForgotPasswordPage: React.FC = () => {
    const { user } = useAuth();
    const { setNotification } = useNotification();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });
    const prefersReducedMotion = useReducedMotion();

    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileError, setTurnstileError] = useState(false);
    const [turnstileKey, setTurnstileKey] = useState(0);

    const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
    const effectiveCardTransition = React.useMemo(() => prefersReducedMotion ? NO_TRANSITION : CARD_TRANSITION, [prefersReducedMotion]);
    const effectiveItemHover = React.useMemo(() => prefersReducedMotion ? undefined : ITEM_HOVER, [prefersReducedMotion]);
    const effectiveButtonTap = React.useMemo(() => prefersReducedMotion ? undefined : BUTTON_TAP, [prefersReducedMotion]);

    useEffect(() => {
        if (turnstileToken) {
            setError(null);
        }
    }, [turnstileToken]);

    const handleTurnstileVerify = (token: string) => {
        setTurnstileToken(token);
        setTurnstileVerified(true);
        setTurnstileError(false);
    };

    const handleTurnstileExpire = () => {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileError(false);
    };

    const handleTurnstileError = () => {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileError(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const sanitizedEmail = DOMPurify.sanitize(email).trim();

        if (!sanitizedEmail) {
            setError('请输入您的邮箱地址');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
            setError('请输入有效的邮箱地址');
            return;
        }

        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证');
            setNotification({ message: '请先完成人机验证', type: 'warning' });
            return;
        }

        setLoading(true);

        try {
            const [fingerprint, clientIP] = await Promise.all([
                getFingerprint(),
                getClientIP()
            ]);

            if (!fingerprint) {
                setError('无法获取设备信息，请稍后重试');
                setLoading(false);
                return;
            }

            const response = await fetch(getApiBaseUrl() + '/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    email: sanitizedEmail,
                    fingerprint: fingerprint,
                    clientIP: clientIP,
                    turnstileToken: turnstileConfig.siteKey ? turnstileToken : undefined
                }),
                credentials: 'same-origin'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccess(true);
                setNotification({
                    message: data.message || '重置链接已发送到您的邮箱，请点击链接重置密码',
                    type: 'success'
                });
            } else {
                setError(data.error || '发送重置链接失败');
                setNotification({ message: data.error || '发送重置链接失败', type: 'error' });
            }
        } catch (err: any) {
            setError('网络错误，请重试');
            setNotification({ message: '网络错误，请重试', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <LazyMotion features={domAnimation}>
            <div className={authPageShellClassName} style={{ fontFamily: studioPageFont }}>
                <div className={authFrameClassName}>
                    <m.div className={authBrandBlockClassName} variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5 }}>
                        <div className={authBrandPillClassName}>
                            <FaVolumeUp />
                            Synapse Access
                        </div>
                        <h1 className={authBrandTitleClassName}>Synapse</h1>
                        <p className={authBrandSubtitleClassName}>找回密码</p>
                    </m.div>

                    <m.div className={authCardClassName} variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}>
                        <div className={authCardBodyClassName}>
                            {success ? (
                                <>
                                    <div className="text-center">
                                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                                            <FaCheckCircle className="h-8 w-8 text-emerald-600" />
                                        </div>
                                        <div className={authEyebrowClassName}>Reset Link Sent</div>
                                        <h2 className="mt-2 text-2xl font-semibold text-slate-900">重置链接已发送</h2>
                                        <p className="mt-3 text-sm leading-7 text-slate-600">我们已将密码重置链接发送至</p>
                                        <p className="font-semibold text-slate-900">{email}</p>
                                    </div>

                                    <div className={cn(authInfoPanelClassName, 'mt-6')}>
                                        <div className="flex items-start gap-3">
                                            <FaInfoCircle className="mt-1 shrink-0 text-slate-500" />
                                            <div className="text-sm leading-6 text-slate-600">
                                                <p className="font-semibold text-slate-900">后续步骤</p>
                                                <p className="mt-1">检查邮箱并点击重置密码按钮，请在相同设备和网络下打开链接。</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={cn(authWarningPanelClassName, 'mt-4')}>
                                        重置链接有效期为 10 分钟。
                                    </div>

                                    <p className="my-6 text-center text-xs text-slate-500">
                                        没有收到邮件？请检查垃圾邮件文件夹
                                    </p>

                                    <Link to="/login" className={authPrimaryButtonClassName}>
                                        返回登录
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <div className={authCardHeaderClassName}>
                                        <div className={authHeaderBadgeClassName}>
                                            <FaKey />
                                        </div>
                                        <div>
                                            <div className={authEyebrowClassName}>Password Reset</div>
                                            <h2 className={authTitleClassName}>重置密码</h2>
                                            <p className={authDescriptionClassName}>输入邮箱地址，我们将向您发送重置链接。</p>
                                        </div>
                                    </div>

                                    {user && (
                                        <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn(authInfoPanelClassName, 'mb-5 flex items-start gap-3')}>
                                            <FaVolumeUp className="mt-1 shrink-0 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-semibold text-slate-900">您当前登录为 {user.username}</p>
                                                <p className="mt-1 text-[11px] leading-5 text-slate-600">您可以为当前账号或任何其他已注册账号重置密码。</p>
                                            </div>
                                        </m.div>
                                    )}

                                    <form className={authFormClassName} onSubmit={handleSubmit}>
                                        {error && <div role="alert" aria-live="assertive" className={authAlertClassName}>{error}</div>}

                                        <div>
                                            <label htmlFor="email" className={authLabelClassName}>邮箱地址</label>
                                            <div className="relative">
                                                <FaEnvelope className={authFieldIconClassName} />
                                                <input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    required
                                                    inputMode="email"
                                                    enterKeyHint="send"
                                                    aria-label="邮箱地址"
                                                    aria-required="true"
                                                    aria-invalid={!!error}
                                                    className={authFieldClassName}
                                                    placeholder="请输入您的邮箱地址"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    autoComplete="email"
                                                />
                                            </div>
                                        </div>

                                        {!turnstileConfigLoading && turnstileConfig.siteKey && (
                                            <div role="group" aria-label="人机验证">
                                                <TurnstileWidget
                                                    key={turnstileKey}
                                                    siteKey={turnstileConfig.siteKey}
                                                    onVerify={handleTurnstileVerify}
                                                    onExpire={handleTurnstileExpire}
                                                    onError={handleTurnstileError}
                                                    theme="light"
                                                    size="normal"
                                                />
                                                {turnstileVerified && <p className="mt-2 text-xs text-emerald-600" role="status" aria-live="polite">人机验证通过</p>}
                                                {turnstileError && <p className="mt-2 text-xs text-rose-600" role="alert" aria-live="assertive">验证失败，请重新验证</p>}
                                            </div>
                                        )}

                                        <m.button
                                            type="submit"
                                            disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)}
                                            aria-label={loading ? '发送中...' : '发送重置链接'}
                                            aria-busy={loading}
                                            className={authPrimaryButtonClassName}
                                            whileHover={effectiveItemHover}
                                            whileTap={effectiveButtonTap}
                                        >
                                            {loading ? '发送中...' : '发送重置链接'}
                                        </m.button>
                                    </form>

                                    <div className="mt-6 flex flex-col items-center gap-3">
                                        <Link to="/login" className={authMutedLinkClassName}>
                                            返回登录
                                        </Link>
                                    </div>
                                </>
                            )}
                        </div>
                    </m.div>

                    <div className="mt-6 text-center">
                        <Link to="/" className={authBackLinkClassName} aria-label="返回首页">
                            <FaArrowLeft className="h-3.5 w-3.5" />
                            返回首页
                        </Link>
                    </div>
                </div>
            </div>
        </LazyMotion>
    );
};

export default ForgotPasswordPage;
