import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from './Notification';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { FaVolumeUp, FaLock, FaEye, FaEyeSlash, FaCheckCircle, FaTimesCircle, FaArrowLeft, FaKey } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint, getClientIP } from '../utils/fingerprint';
import DOMPurify from 'dompurify';
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
    authFieldActionClassName,
    authFieldIconClassName,
    authFormClassName,
    authFrameClassName,
    authHeaderBadgeClassName,
    authInfoPanelClassName,
    authMutedLinkClassName,
    authPageShellClassName,
    authPasswordFieldClassName,
    authPrimaryButtonClassName,
    authSecondaryButtonClassName,
    authSuccessPanelClassName,
    authTitleClassName,
    studioPageFont,
} from './authStudioTheme';
import { cn } from '../utils/cn';

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const CARD_TRANSITION = { duration: 0.45, type: 'spring', stiffness: 130 } as const;
const ITEM_HOVER = { scale: 1.01, y: -1 } as const;
const BUTTON_TAP = { scale: 0.99 } as const;

export const ResetPasswordLinkPage: React.FC = () => {
    const { user } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const prefersReducedMotion = useReducedMotion();

    const [token, setToken] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
    const effectiveCardTransition = React.useMemo(() => prefersReducedMotion ? NO_TRANSITION : CARD_TRANSITION, [prefersReducedMotion]);
    const effectiveItemHover = React.useMemo(() => prefersReducedMotion ? undefined : ITEM_HOVER, [prefersReducedMotion]);
    const effectiveButtonTap = React.useMemo(() => prefersReducedMotion ? undefined : BUTTON_TAP, [prefersReducedMotion]);

    useEffect(() => {
        const validateToken = async () => {
            const tokenParam = searchParams.get('token');
            if (!tokenParam) {
                setError('重置链接无效：缺少令牌');
                setTokenValid(false);
                setVerifying(false);
                return;
            }
            setToken(tokenParam);

            try {
                const [fingerprint, clientIP] = await Promise.all([
                    getFingerprint(),
                    getClientIP()
                ]);

                if (!fingerprint) {
                    setError('无法获取设备信息，请刷新页面重试');
                    setTokenValid(false);
                    setVerifying(false);
                    return;
                }

                const response = await fetch(getApiBaseUrl() + '/api/auth/validate-reset-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenParam, fingerprint, clientIP }),
                });

                const data = await response.json();

                if (response.ok && data.valid) {
                    setTokenValid(true);
                } else {
                    setError(data.error || '重置链接验证失败');
                    setTokenValid(false);
                }
            } catch (err) {
                setError('验证重置链接时发生网络错误，请刷新页面重试');
                setTokenValid(false);
            }

            setVerifying(false);
        };
        validateToken();
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null);
        if (!token) { setError('无效的重置令牌'); return; }
        const sanitizedPassword = DOMPurify.sanitize(newPassword).trim();
        const sanitizedConfirmPassword = DOMPurify.sanitize(confirmPassword).trim();
        if (!sanitizedPassword || !sanitizedConfirmPassword) { setError('请填写所有字段'); return; }
        if (sanitizedPassword !== sanitizedConfirmPassword) { setError('两次输入的密码不一致'); return; }
        if (sanitizedPassword.length < 6) { setError('密码长度至少为6位'); return; }
        setLoading(true);
        try {
            const fingerprint = await getFingerprint();
            if (!fingerprint) { setError('无法获取设备信息，请刷新页面重试'); setLoading(false); return; }
            const clientIP = await getClientIP();
            const deviceName = navigator.userAgent || 'unknown';
            const response = await fetch(getApiBaseUrl() + '/api/auth/reset-password-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, fingerprint, newPassword: sanitizedPassword, clientIP, deviceName }),
            });

            const data = await response.json();
            if (response.ok && data.success) {
                setSuccess(true); setNotification({ message: data.message || '密码重置成功！', type: 'success' });
                setTimeout(() => navigate('/login'), 3000);
            } else {
                setError(data.error || '密码重置失败，请重试'); setNotification({ message: data.error || '密码重置失败', type: 'error' });
            }
        } catch (err: any) {
            setError('网络错误，请稍后重试'); setNotification({ message: '网络错误，请稍后重试', type: 'error' });
        } finally { setLoading(false); }
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
                        <p className={authBrandSubtitleClassName}>重置密码</p>
                    </m.div>

                    <m.div className={authCardClassName} variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}>
                        <div className={authCardBodyClassName}>
                            <div className={authCardHeaderClassName}>
                                <div className={authHeaderBadgeClassName}>
                                    <FaKey />
                                </div>
                                <div>
                                    <div className={authEyebrowClassName}>Secure Reset Link</div>
                                    <h2 className={authTitleClassName}>设置新密码</h2>
                                    <p className={authDescriptionClassName}>通过安全链接重置您的账户密码。</p>
                                </div>
                            </div>

                            {user && (
                                <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn(authInfoPanelClassName, 'mb-5 flex items-start gap-3')}>
                                    <FaLock className="mt-1 shrink-0 text-slate-500" />
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900">您当前登录为 {user.username}</p>
                                        <p className="mt-1 text-[11px] leading-5 text-slate-600">您正在为另一个账号设置新密码。重置完成后，该账号的登录状态将生效。</p>
                                    </div>
                                </m.div>
                            )}

                            {verifying ? (
                                <div className="py-8 text-center">
                                    <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
                                    <h3 className="text-xl font-semibold text-slate-900">验证中</h3>
                                    <p className="mt-2 text-sm text-slate-600">正在验证重置链接</p>
                                </div>
                            ) : !tokenValid ? (
                                <div className="py-4 text-center">
                                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100">
                                        <FaTimesCircle className="h-8 w-8 text-rose-500" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-slate-900">链接无效</h3>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
                                    <div className="mt-6 space-y-3">
                                        <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                            <Link to="/forgot-password" className={authPrimaryButtonClassName}>重新获取重置链接</Link>
                                        </m.div>
                                        <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                            <Link to="/login" className={authSecondaryButtonClassName}>返回登录</Link>
                                        </m.div>
                                    </div>
                                </div>
                            ) : success ? (
                                <div className="py-4 text-center">
                                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                                        <FaCheckCircle className="h-8 w-8 text-emerald-600" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-slate-900">密码重置成功</h3>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">您的密码已成功重置</p>
                                    <div className={cn(authSuccessPanelClassName, 'my-6 text-left')}>
                                        即将自动跳转到登录页面，请使用新密码登录。
                                    </div>
                                    <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                        <Link to="/login" className={authPrimaryButtonClassName}>立即登录</Link>
                                    </m.div>
                                </div>
                            ) : (
                                <>
                                    <form className={authFormClassName} onSubmit={handleSubmit}>
                                        {error && <div role="alert" aria-live="assertive" className={authAlertClassName}>{error}</div>}

                                        <div>
                                            <label htmlFor="newPassword" className="mb-2 block text-sm font-medium text-slate-700">新密码</label>
                                            <div className="relative">
                                                <FaLock className={authFieldIconClassName} />
                                                <input id="newPassword" name="newPassword" type={showPassword ? 'text' : 'password'} required minLength={6} aria-label="新密码" aria-required="true"
                                                    className={authPasswordFieldClassName}
                                                    placeholder="请输入新密码（至少6位）" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                                                <button type="button" className={authFieldActionClassName} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                                    {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">确认密码</label>
                                            <div className="relative">
                                                <FaLock className={authFieldIconClassName} />
                                                <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required minLength={6} aria-label="确认密码" aria-required="true"
                                                    className={authPasswordFieldClassName}
                                                    placeholder="请再次输入新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                                                <button type="button" className={authFieldActionClassName} onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                                                    {showConfirmPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        <m.button type="submit" disabled={loading} aria-label={loading ? '重置中...' : '重置密码'} aria-busy={loading}
                                            className={authPrimaryButtonClassName}
                                            whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                            {loading ? '重置中...' : '重置密码'}
                                        </m.button>
                                    </form>

                                    <div className="mt-6 text-center">
                                        <Link to="/login" className={authMutedLinkClassName}>返回登录</Link>
                                    </div>
                                </>
                            )}
                        </div>
                    </m.div>

                    <div className="mt-6 text-center">
                        <Link to="/" className={authBackLinkClassName}>
                            <FaArrowLeft className="h-3.5 w-3.5" />返回首页
                        </Link>
                    </div>
                </div>
            </div>
        </LazyMotion>
    );
};

export default ResetPasswordLinkPage;
