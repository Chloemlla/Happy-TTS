import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { AuthRequestError } from '../hooks/useAuth';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { usePasskey } from '../hooks/usePasskey';
import { useNotification } from './Notification';
import GoogleAuthButton from './GoogleAuthButton';
import LinuxDoAuthButton from './LinuxDoAuthButton';
import MobileLoginPanel from './MobileLoginPanel';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import PasskeyVerifyModal from './PasskeyVerifyModal';
import TOTPVerification from './TOTPVerification';
import VerificationMethodSelector from './VerificationMethodSelector';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
    FaEnvelope,
    FaLock,
    FaEye,
    FaEyeSlash,
    FaFingerprint,
    FaVolumeUp,
    FaArrowLeft,
    FaQuestionCircle,
    FaChevronDown,
    FaChevronUp,
    FaShieldAlt,
    FaUserShield,
    FaBolt,
    FaMobileAlt,
    FaUser,
    FaSignInAlt,
} from 'react-icons/fa';
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
    authCheckboxClassName,
    authDividerClassName,
    authDividerLabelClassName,
    authDividerLineClassName,
    authElevatedPanelClassName,
    authEyebrowClassName,
    authFieldActionClassName,
    authFieldClassName,
    authFieldIconClassName,
    authFormClassName,
    authFrameClassName,
    authHeaderBadgeClassName,
    authInfoPanelClassName,
    authLabelClassName,
    authMutedLinkClassName,
    authPageShellClassName,
    authPasswordFieldClassName,
    authPrimaryButtonClassName,
    authSecondaryButtonClassName,
    authTextLinkClassName,
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

type LoginAttemptStatus = {
    message: string;
    tone: 'warning' | 'locked';
};

const buildLoginAttemptStatus = (error: AuthRequestError): LoginAttemptStatus | null => {
    if (typeof error.lockedUntil === 'number') {
        const lockedUntilText = new Date(error.lockedUntil).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        });
        return {
            tone: 'locked',
            message: `登录已暂时锁定，请在 ${lockedUntilText} 后重试。`,
        };
    }

    if (typeof error.remainingAttempts === 'number' && typeof error.attemptLimit === 'number') {
        return {
            tone: error.remainingAttempts <= 1 ? 'locked' : 'warning',
            message: `还可尝试 ${error.remainingAttempts}/${error.attemptLimit} 次。`,
        };
    }

    return null;
};

export const LoginPage: React.FC = () => {
    const { user, login, loginWithToken, pending2FA, setPending2FA } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });
    const { authenticateWithPasskey, authenticateWithDiscoverablePasskey } = usePasskey();
    const prefersReducedMotion = useReducedMotion();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileError, setTurnstileError] = useState(false);
    const [turnstileKey, setTurnstileKey] = useState(0);
    const [showTOTPVerification, setShowTOTPVerification] = useState(false);
    const [showPasskeyVerification, setShowPasskeyVerification] = useState(false);
    const [showVerificationSelector, setShowVerificationSelector] = useState(false);
    const [pendingVerificationData, setPendingVerificationData] = useState<any>(null);
    const [pendingToken, setPendingToken] = useState<string>('');
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showPasskeyHelp, setShowPasskeyHelp] = useState(false);
    const [attemptStatus, setAttemptStatus] = useState<LoginAttemptStatus | null>(null);

    const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
    const effectiveCardTransition = React.useMemo(() => prefersReducedMotion ? NO_TRANSITION : CARD_TRANSITION, [prefersReducedMotion]);
    const effectiveItemHover = React.useMemo(() => prefersReducedMotion ? undefined : ITEM_HOVER, [prefersReducedMotion]);
    const effectiveButtonTap = React.useMemo(() => prefersReducedMotion ? undefined : BUTTON_TAP, [prefersReducedMotion]);
    const postLoginRedirect = React.useMemo(() => {
        const raw = searchParams.get('redirectTo') || '';
        if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
        return raw;
    }, [searchParams]);

    // External redirect_uri for PiliPlus-style app deep-link callbacks
    const redirectUri = React.useMemo(() => {
        const raw = searchParams.get('redirect_uri') || '';
        if (!raw) return null;
        try {
            const parsed = new URL(raw);
            // Only allow custom scheme URLs (e.g. piliplus://), NOT http/https
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                // Allow localhost for development use
                if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') {
                    return raw;
                }
                return null;
            }
            return raw;
        } catch {
            return null;
        }
    }, [searchParams]);

    // Ref to hold the login token so it survives across 2FA flows
    const loginTokenRef = React.useRef<string | null>(null);

    const adminLoginRequested = React.useMemo(() => {
        return postLoginRedirect?.startsWith('/admin') || username.trim().toLowerCase() === 'admin';
    }, [postLoginRedirect, username]);
    const completeLogin = React.useCallback(() => {
        // If an external redirect_uri was provided, send the token back to the calling app
        if (redirectUri && loginTokenRef.current) {
            window.location.href = `${redirectUri}?token=${encodeURIComponent(loginTokenRef.current)}`;
            return;
        }
        if (postLoginRedirect) {
            navigate(postLoginRedirect, { replace: true });
            return;
        }
        window.location.reload();
    }, [navigate, postLoginRedirect, redirectUri]);

    useEffect(() => {
        const savedUsername = localStorage.getItem('rememberedUsername');
        if (savedUsername) { setUsername(savedUsername); setRememberMe(true); }
    }, []);

    useEffect(() => { if (turnstileToken) setError(null); }, [turnstileToken]);

    const handleTurnstileVerify = (token: string) => { setTurnstileToken(token); setTurnstileVerified(true); setTurnstileError(false); };
    const handleTurnstileExpire = () => { setTurnstileToken(''); setTurnstileVerified(false); setTurnstileError(false); };
    const handleTurnstileError = () => { setTurnstileToken(''); setTurnstileVerified(false); setTurnstileError(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setAttemptStatus(null);
        const sanitizedUsername = DOMPurify.sanitize(username).trim();
        if (!sanitizedUsername || !password) { setError('请输入用户名和密码'); return; }
        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证'); setNotification({ message: '请先完成人机验证', type: 'warning' }); return;
        }
        setLoading(true);
        try {
            if (rememberMe) { localStorage.setItem('rememberedUsername', sanitizedUsername); }
            else { localStorage.removeItem('rememberedUsername'); }
            const result = await login(sanitizedUsername, password, turnstileConfig.siteKey ? turnstileToken : undefined);
            // Save the token for redirect_uri callback (e.g. piliplus://)
            if (result?.token) {
                loginTokenRef.current = result.token;
            }
            if (result && result.requires2FA && result.twoFactorType) {
                setNotification({ message: '需要二次验证，请选择验证方式', type: 'info' });
                setPendingToken(result.token);
                const verificationTypes = result.twoFactorType;
                if (!verificationTypes || verificationTypes.length === 0) {
                    setNotification({ message: '未启用任何二次验证方式，请联系管理员', type: 'error' }); setLoading(false); return;
                }
                const hasPasskey = verificationTypes.includes('Passkey');
                const hasTOTP = verificationTypes.includes('TOTP');
                if (hasPasskey && hasTOTP) {
                    setPendingVerificationData({ user: result.user, userId: result.user.id, token: result.token, username: sanitizedUsername, twoFactorType: result.twoFactorType });
                    setShowVerificationSelector(true);
                } else if (hasPasskey) {
                    setPending2FA({ userId: result.user.id, username: sanitizedUsername, type: ['Passkey'] }); setShowPasskeyVerification(true);
                } else if (hasTOTP) {
                    setPending2FA({ userId: result.user.id, username: sanitizedUsername, type: ['TOTP'] }); setShowTOTPVerification(true);
                }
                return;
            }
            if (postLoginRedirect?.startsWith('/admin') && result.user?.role !== 'admin') {
                setNotification({ message: '当前账号没有管理员权限，已返回首页', type: 'warning' });
                navigate('/', { replace: true });
                return;
            }
            setNotification({ message: adminLoginRequested ? '管理员登录成功' : '登录成功', type: 'success' }); completeLogin();
        } catch (err: any) {
            const authError = err as AuthRequestError;
            const attemptFeedback = buildLoginAttemptStatus(authError);
            if (attemptFeedback) setAttemptStatus(attemptFeedback);
            if (turnstileConfig.siteKey) {
                setTurnstileToken('');
                setTurnstileVerified(false);
                setTurnstileKey(k => k + 1);
            }
            setError(authError.message || '登录失败'); setNotification({ message: authError.message || '登录失败', type: 'error' });
        } finally { setLoading(false); }
    };

    const handleVerificationMethodSelect = async (method: 'passkey' | 'totp') => {
        setShowVerificationSelector(false); setLoading(true);
        try {
            if (method === 'passkey') {
                const success = await authenticateWithPasskey(pendingVerificationData.username);
                if (success) { setPendingVerificationData(null); completeLogin(); }
                else { setError('Passkey 验证失败'); setNotification({ message: 'Passkey 验证失败', type: 'error' }); }
            } else if (method === 'totp') {
                setPending2FA({ userId: pendingVerificationData.userId, username: pendingVerificationData.username, type: ['TOTP'] });
                setShowTOTPVerification(true); setNotification({ message: '请进行 TOTP 验证', type: 'info' });
            }
        } catch (e: any) {
            const msg = e.message || '验证失败';
            setError(msg);
            setNotification({ message: msg, type: 'error' });
        } finally { setLoading(false); }
    };

    const handleVerificationSelectorClose = () => { setShowVerificationSelector(false); setPendingVerificationData(null); setPending2FA(null); };

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
                        <p className={authBrandSubtitleClassName}>Welcome back</p>
                    </m.div>

                    <m.div className={authCardClassName} variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}>
                        <div className={authCardBodyClassName}>
                            <div className={authCardHeaderClassName}>
                                <div className={authHeaderBadgeClassName}>
                                    {adminLoginRequested ? <FaUserShield /> : <FaSignInAlt />}
                                </div>
                                <div>
                                    <div className={authEyebrowClassName}>{adminLoginRequested ? 'Admin Access' : 'Account Login'}</div>
                                    <h2 className={authTitleClassName}>{adminLoginRequested ? '管理员登录' : '登录账户'}</h2>
                                </div>
                            </div>

                            <div className="mb-5 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                                <button
                                    type="button"
                                    onClick={() => navigate('/login', { replace: true })}
                                    className={cn(
                                        'rounded-xl px-3 py-2 text-sm font-semibold transition',
                                        !postLoginRedirect?.startsWith('/admin') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                                    )}
                                >
                                    用户入口
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!username) setUsername('admin');
                                        navigate('/login?redirectTo=%2Fadmin', { replace: true });
                                    }}
                                    className={cn(
                                        'rounded-xl px-3 py-2 text-sm font-semibold transition',
                                        postLoginRedirect?.startsWith('/admin') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                                    )}
                                >
                                    管理员入口
                                </button>
                            </div>

                            {user && (
                                <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn(authInfoPanelClassName, 'mb-5 flex items-start gap-3')}>
                                    <FaUser className="mt-1 shrink-0 text-slate-500" />
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900">您已登录为 {user.username}</p>
                                        <p className="mt-1 text-[11px] leading-5 text-slate-600">继续登录将在此设备上添加新账号，您可以在菜单中随时切换。</p>
                                    </div>
                                </m.div>
                            )}

                            {adminLoginRequested && (
                                <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn(authWarningPanelClassName, 'mb-5 flex items-start gap-3')}>
                                    <FaShieldAlt className="mt-1 shrink-0 text-amber-600" />
                                    <div>
                                        <p className="text-xs font-semibold text-amber-950">管理员会话</p>
                                        <p className="mt-1 text-[11px] leading-5">登录后将进入管理后台，非管理员账号会被带回首页。</p>
                                    </div>
                                </m.div>
                            )}

                            <form className={authFormClassName} onSubmit={handleSubmit}>
                                {error && <div role="alert" aria-live="assertive" className={authAlertClassName}>{error}</div>}
                                {attemptStatus && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        className={attemptStatus.tone === 'locked' ? authWarningPanelClassName : authInfoPanelClassName}
                                    >
                                        {attemptStatus.message}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="username" className={authLabelClassName}>邮箱或用户名</label>
                                    <div className="relative">
                                        <FaEnvelope className={authFieldIconClassName} />
                                        <input id="username" name="username" type="text" required inputMode="text" enterKeyHint="next" aria-label="用户名或邮箱" aria-required="true" aria-invalid={!!error}
                                            className={authFieldClassName}
                                            placeholder="请输入邮箱或用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label htmlFor="password" className="block text-sm font-medium text-slate-700">密码</label>
                                        <Link to="/forgot-password" className={authMutedLinkClassName} aria-label="忘记密码">忘记密码？</Link>
                                    </div>
                                    <div className="relative">
                                        <FaLock className={authFieldIconClassName} />
                                        <input id="password" name="password" type={showPassword ? 'text' : 'password'} required enterKeyHint="done" aria-label="密码" aria-required="true" aria-invalid={!!error}
                                            className={authPasswordFieldClassName}
                                            placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className={authFieldActionClassName} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                                            {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} aria-label="Remember my username" className={authCheckboxClassName} />
                                    <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600">记住我</label>
                                </div>

                                {!turnstileConfigLoading && turnstileConfig.siteKey && (
                                    <div role="group" aria-label="人机验证">
                                        <TurnstileWidget key={turnstileKey} siteKey={turnstileConfig.siteKey} onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} onError={handleTurnstileError} theme="light" size="normal" />
                                        {turnstileVerified && <p className="mt-2 text-xs text-emerald-600" role="status" aria-live="polite">人机验证通过</p>}
                                        {turnstileError && <p className="mt-2 text-xs text-rose-600" role="alert" aria-live="assertive">验证失败，请重新验证</p>}
                                    </div>
                                )}

                                <m.button type="submit" disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)} aria-label={loading ? '正在登录' : '登录'} aria-busy={loading}
                                    className={authPrimaryButtonClassName}
                                    whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                    {loading ? '登录中...' : '登录'}
                                </m.button>
                            </form>

                            <div className={authDividerClassName}>
                                <div className="absolute inset-0 flex items-center"><div className={authDividerLineClassName}></div></div>
                                <div className="relative flex justify-center"><span className={authDividerLabelClassName}>或者使用以下方式</span></div>
                            </div>

                            <div className="space-y-4">
                                <MobileLoginPanel
                                    disabled={loading}
                                    loginWithToken={loginWithToken}
                                    onSuccess={completeLogin}
                                />
                                <GoogleAuthButton
                                    intent="login"
                                    label="使用 Google 登录或注册"
                                    description="使用 Google 账号快速登录，首次登录自动创建本地账户"
                                />
                                <LinuxDoAuthButton
                                    intent="login"
                                    label="使用 Linux.do 登录或注册"
                                    description="复用 Linux.do 论坛账号，首次登录自动创建本地账户"
                                />
                                <div className={authInfoPanelClassName}>
                                    <div className="flex items-start gap-3">
                                        <FaFingerprint className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-semibold text-slate-900">通行密钥</h3>
                                            <p className="mt-1 text-xs leading-5 text-slate-600">使用生物识别或设备认证完成无密码登录。</p>
                                            <div className="mt-3 grid grid-cols-3 gap-2">
                                                {[{ Icon: FaShieldAlt, label: '安全', sub: '防钓鱼' }, { Icon: FaBolt, label: '快速', sub: '一键登录' }, { Icon: FaMobileAlt, label: '简单', sub: '无需密码' }].map(({ Icon, label, sub }) => (
                                                    <div key={label} className="rounded-2xl border border-slate-200 bg-white/80 p-2 text-center">
                                                        <Icon className="mx-auto mb-1 h-4 w-4 text-slate-500" />
                                                        <span className="block text-xs font-medium text-slate-900">{label}</span>
                                                        <span className="block text-[10px] text-slate-500">{sub}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <button type="button" onClick={() => setShowPasskeyHelp(!showPasskeyHelp)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900">
                                                <FaQuestionCircle className="h-3 w-3" /><span>{showPasskeyHelp ? '隐藏' : '显示'}详细指南</span>
                                                {showPasskeyHelp ? <FaChevronUp className="h-2.5 w-2.5" /> : <FaChevronDown className="h-2.5 w-2.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    {showPasskeyHelp && (
                                        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                                            {[
                                                { num: '1', title: '如何使用通行密钥', items: ['点击下方“使用通行密钥登录”按钮', '浏览器将提示您进行认证', '使用指纹、面部识别或设备 PIN 码', '验证后将自动登录'] },
                                                { num: '2', title: '前置要求', items: ['您必须已为账户注册了通行密钥', '您的设备必须支持生物认证或安全密钥', '使用现代浏览器'] },
                                            ].map(({ num, title, items }) => (
                                                <div key={num}>
                                                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
                                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">{num}</span>{title}
                                                    </h4>
                                                    <ul className="ml-7 space-y-1.5 text-xs leading-5 text-slate-600">
                                                        {items.map(item => <li key={item}>{item}</li>)}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <m.button type="button" onClick={async () => { try { setLoading(true); const success = await authenticateWithDiscoverablePasskey(); if (success) { setNotification({ message: '通行密钥登录成功！', type: 'success' }); completeLogin(); } } catch (err: any) { setNotification({ message: err.message || '通行密钥登录失败', type: 'error' }); } finally { setLoading(false); } }} disabled={loading}
                                    className={authSecondaryButtonClassName}
                                    aria-label="Sign in with Passkey" whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                    <FaFingerprint className="h-5 w-5" />
                                    使用通行密钥登录
                                </m.button>
                            </div>

                            <div className="mt-6 text-center">
                                <p className="text-sm text-slate-600">还没有账户？<Link to="/register" className={authTextLinkClassName}>立即注册</Link></p>
                            </div>
                        </div>
                    </m.div>

                    <div className="mt-6 text-center">
                        <Link to="/" className={authBackLinkClassName} aria-label="返回首页">
                            <FaArrowLeft className="h-3.5 w-3.5" />返回首页
                        </Link>
                    </div>
                </div>

                <PasskeyVerifyModal open={showPasskeyVerification || false} username={username} onSuccess={() => { setShowPasskeyVerification(false); setPending2FA(null); setPendingVerificationData(null); completeLogin(); }} onClose={() => { setShowPasskeyVerification(false); setPending2FA(null); setPendingVerificationData(null); }} />
                {showTOTPVerification && (<TOTPVerification isOpen={showTOTPVerification} onClose={() => { setShowTOTPVerification(false); setPending2FA(null); setPendingVerificationData(null); }} onSuccess={() => { setShowTOTPVerification(false); setPending2FA(null); setPendingVerificationData(null); completeLogin(); }} userId={pending2FA?.userId || ''} token={pendingToken || ''} />)}
                {showVerificationSelector && pendingVerificationData && (<VerificationMethodSelector isOpen={showVerificationSelector} onClose={handleVerificationSelectorClose} onSelectMethod={handleVerificationMethodSelect} username={pendingVerificationData.username} loading={loading} availableMethods={pendingVerificationData.twoFactorType?.map((type: string) => type === 'Passkey' ? 'passkey' : type === 'TOTP' ? 'totp' : null).filter(Boolean) as ('passkey' | 'totp')[] || []} />)}
            </div>
        </LazyMotion>
    );
};
