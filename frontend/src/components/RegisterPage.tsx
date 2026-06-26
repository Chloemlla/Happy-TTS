import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import GoogleAuthButton from './GoogleAuthButton';
import LinuxDoAuthButton from './LinuxDoAuthButton';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import getApiBaseUrl from '../api';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaUser, FaVolumeUp, FaArrowLeft, FaUserPlus, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import { getFingerprint, getClientIP } from '../utils/fingerprint';
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
    authEyebrowClassName,
    authFieldActionClassName,
    authFieldClassName,
    authFieldIconClassName,
    authFormClassName,
    authFrameClassName,
    authHeaderBadgeClassName,
    authInfoPanelClassName,
    authLabelClassName,
    authModalCardClassName,
    authModalOverlayClassName,
    authPageShellClassName,
    authPasswordFieldClassName,
    authPrimaryButtonClassName,
    authSecondaryButtonClassName,
    authSuccessPanelClassName,
    authTextLinkClassName,
    authTitleClassName,
    authWarningPanelClassName,
    studioPageFont,
} from './authStudioTheme';
import { cn } from '../utils/cn';

interface PasswordStrength { score: number; feedback: string; }

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const CARD_TRANSITION = { duration: 0.45, type: 'spring', stiffness: 130 } as const;
const ITEM_HOVER = { scale: 1.01, y: -1 } as const;
const BUTTON_TAP = { scale: 0.99 } as const;

export const RegisterPage: React.FC = () => {
    const { user } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });
    const prefersReducedMotion = useReducedMotion();

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, feedback: '' });
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileError, setTurnstileError] = useState(false);
    const [turnstileKey, setTurnstileKey] = useState(0);
    const [showEmailVerify, setShowEmailVerify] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyResendTimer, setVerifyResendTimer] = useState(0);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
    const effectiveCardTransition = React.useMemo(() => prefersReducedMotion ? NO_TRANSITION : CARD_TRANSITION, [prefersReducedMotion]);
    const effectiveItemHover = React.useMemo(() => prefersReducedMotion ? undefined : ITEM_HOVER, [prefersReducedMotion]);
    const effectiveButtonTap = React.useMemo(() => prefersReducedMotion ? undefined : BUTTON_TAP, [prefersReducedMotion]);

    const allowedDomains = ['gmail.com', 'outlook.com', 'qq.com', '163.com', '126.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'foxmail.com', 'chloemlla.com', 'hapx.one'];
    const emailPattern = new RegExp(`^[\\w.-]+@(${allowedDomains.map(d => d.replace('.', '\\.')).join('|')})$`);
    const reservedUsernames = ['admin', 'root', 'system', 'test', 'administrator'];

    useEffect(() => { if (turnstileToken) setError(null); }, [turnstileToken]);

    const handleTurnstileVerify = (token: string) => { setTurnstileToken(token); setTurnstileVerified(true); setTurnstileError(false); };
    const handleTurnstileExpire = () => { setTurnstileToken(''); setTurnstileVerified(false); setTurnstileError(false); };
    const handleTurnstileError = () => { setTurnstileToken(''); setTurnstileVerified(false); setTurnstileError(true); };

    const checkPasswordStrength = (pwd: string): PasswordStrength => {
        let score = 0; const feedback: string[] = [];
        if (pwd.length < 8) { feedback.push('密码长度至少需要8个字符'); } else if (pwd.length >= 12) { score += 2; } else { score += 1; }
        if (/\d/.test(pwd)) score += 1; else feedback.push('需要包含数字');
        if (/[a-z]/.test(pwd)) score += 1; else feedback.push('需要包含小写字母');
        if (/[A-Z]/.test(pwd)) score += 1; else feedback.push('需要包含大写字母');
        if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 1; else feedback.push('需要包含特殊字符');
        const commonPatterns = [/^123/, /password/i, /qwerty/i, /abc/i, new RegExp(username, 'i')];
        if (commonPatterns.some(pattern => pattern.test(pwd))) { score = 0; feedback.push('请避免使用常见密码模式'); }
        return { score, feedback: feedback.join('、') };
    };

    const validateInput = (value: string, type: 'username' | 'email' | 'password'): string | null => {
        const sanitizedValue = DOMPurify.sanitize(value).trim();
        switch (type) {
            case 'username':
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitizedValue)) return '用户名只能包含字母、数字和下划线，长度3-20个字符';
                if (reservedUsernames.includes(sanitizedValue.toLowerCase())) return '该用户名为保留字段，不能注册';
                if (/[';"']/.test(sanitizedValue)) return '用户名包含非法字符';
                break;
            case 'email':
                if (!emailPattern.test(sanitizedValue)) return '只支持主流邮箱（如gmail、outlook、qq、163、126等）';
                break;
            case 'password':
                const strength = checkPasswordStrength(sanitizedValue);
                if (strength.score < 2) return strength.feedback || '密码强度不足';
                break;
        }
        return null;
    };

    useEffect(() => {
        if (!username || !email) { setPasswordStrength({ score: 0, feedback: '' }); return; }
        if (password) { setPasswordStrength(checkPasswordStrength(password)); } else { setPasswordStrength({ score: 0, feedback: '' }); }
    }, [password, username, email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null);
        const usernameError = validateInput(username, 'username'); if (usernameError) { setError(usernameError); return; }
        const emailError = validateInput(email, 'email'); if (emailError) { setError(emailError); return; }
        const passwordError = validateInput(password, 'password'); if (passwordError) { setError(passwordError); return; }
        if (password !== confirmPassword) { setError('两次输入的密码不一致'); return; }
        if (!agreed) { setNotification({ message: '请勾选服务条款与隐私政策', type: 'warning' }); return; }
        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证'); setNotification({ message: '请先完成人机验证', type: 'warning' }); return;
        }
        setLoading(true);
        try {
            const sanitizedUsername = DOMPurify.sanitize(username).trim();
            const sanitizedEmail = DOMPurify.sanitize(email).trim();
            const [fingerprint, clientIP] = await Promise.all([getFingerprint(), getClientIP()]);
            if (!fingerprint) { setError('无法获取设备信息，请稍后重试'); setLoading(false); return; }
            const requestBody: any = { username: sanitizedUsername, email: sanitizedEmail, password, fingerprint, clientIP };
            if (turnstileConfig.siteKey && turnstileToken) requestBody.cfToken = turnstileToken;
            const res = await fetch(getApiBaseUrl() + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            const data = await res.json();
            if (data && data.needVerify) {
                setNotification({ message: data.message || '验证链接已发送到您的邮箱，请点击链接完成注册', type: 'success' });
                setError(''); setShowEmailVerify(true); setPendingEmail(sanitizedEmail);
                setTurnstileToken(''); setTurnstileVerified(false); setTurnstileKey(k => k + 1);
            } else {
                setError(data?.error || '注册失败'); setNotification({ message: data?.error || '注册失败', type: 'error' });
            }
        } catch (err: any) {
            setError(err.message || '注册失败'); setNotification({ message: err.message || '注册失败', type: 'error' });
        } finally { setLoading(false); }
    };

    useEffect(() => {
        if (!showEmailVerify || verifyResendTimer <= 0) return;
        const timer = setInterval(() => setVerifyResendTimer(t => t > 0 ? t - 1 : 0), 1000);
        return () => clearInterval(timer);
    }, [verifyResendTimer, showEmailVerify]);

    const handleResendVerifyCode = async () => {
        if (verifyResendTimer > 0) return;
        setVerifyLoading(true); setVerifyError('');
        try {
            const res = await fetch(getApiBaseUrl() + '/api/auth/send-verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail }) });
            const data = await res.json();
            if (data && data.success) { setNotification({ message: '验证码已重新发送', type: 'success' }); setVerifyResendTimer(60); }
            else { setVerifyError(data.error || '验证码发送失败'); setNotification({ message: data.error || '验证码发送失败', type: 'error' }); }
        } catch (err: any) { setVerifyError(err.message || '验证码发送失败'); setNotification({ message: err.message || '验证码发送失败', type: 'error' }); }
        finally { setVerifyLoading(false); }
    };

    const handleVerifyCode = async (code?: string) => {
        setVerifyLoading(true); setVerifyError('');
        const finalCode = code || verifyCode;
        if (!/^[0-9]{8}$/.test(finalCode)) { setVerifyError('验证码必须为8位数字'); setVerifyLoading(false); return; }
        try {
            const res = await fetch(getApiBaseUrl() + '/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pendingEmail, code: finalCode }) });
            const data = await res.json();
            if (data && data.success) { setShowEmailVerify(false); setPendingEmail(''); setVerifyCode(''); setVerifyError(''); setNotification({ message: '注册成功，请登录', type: 'success' }); navigate('/login'); }
            else { setVerifyError(data.error || '验证码错误'); setNotification({ message: data.error || '验证码错误', type: 'error' }); }
        } catch (err: any) { setVerifyError(err.message || '验证码校验失败'); setNotification({ message: err.message || '验证码校验失败', type: 'error' }); }
        finally { setVerifyLoading(false); }
    };

    const strengthLabel = passwordStrength.score >= 4 ? '很强' : passwordStrength.score >= 3 ? '强' : passwordStrength.score >= 2 ? '中等' : '弱';
    const strengthColor = passwordStrength.score >= 4 ? 'text-emerald-600' : passwordStrength.score >= 3 ? 'text-slate-700' : passwordStrength.score >= 2 ? 'text-amber-600' : 'text-rose-600';

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
                        <p className={authBrandSubtitleClassName}>Create your account</p>
                    </m.div>

                    <m.div className={authCardClassName} variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}>
                        <div className={authCardBodyClassName}>
                            <div className={authCardHeaderClassName}>
                                <div className={authHeaderBadgeClassName}>
                                    <FaUserPlus />
                                </div>
                                <div>
                                    <div className={authEyebrowClassName}>New Account</div>
                                    <h2 className={authTitleClassName}>创建账户</h2>
                                </div>
                            </div>

                            {user && (
                                <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn(authInfoPanelClassName, 'mb-5 flex items-start gap-3')}>
                                    <FaUser className="mt-1 shrink-0 text-slate-500" />
                                    <div>
                                        <p className="text-xs font-semibold text-slate-900">您已登录为 {user.username}</p>
                                        <p className="mt-1 text-[11px] leading-5 text-slate-600">注册新账号将自动添加至此设备的账号列表中，您可以随时切换。</p>
                                    </div>
                                </m.div>
                            )}

                            <form className={authFormClassName} onSubmit={handleSubmit} aria-label="注册表单">
                                {error && <div role="alert" aria-live="assertive" className={authAlertClassName}>{error}</div>}

                                <div>
                                    <label htmlFor="username" className={authLabelClassName}>用户名</label>
                                    <div className="relative">
                                        <FaUser className={authFieldIconClassName} />
                                        <input id="username" name="username" type="text" required inputMode="text" enterKeyHint="next" aria-label="用户名" aria-required="true" aria-invalid={!!error} aria-describedby="username-hint"
                                            className={authFieldClassName}
                                            placeholder="3-20个字符" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} pattern="^[a-zA-Z0-9_]{3,20}$" autoComplete="username" />
                                        <span id="username-hint" className="sr-only">用户名长度3到20个字符，只允许字母、数字和下划线</span>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="email" className={authLabelClassName}>邮箱</label>
                                    <div className="relative">
                                        <FaEnvelope className={authFieldIconClassName} />
                                        <input id="email" name="email" type="email" required inputMode="email" enterKeyHint="next" aria-label="邮箱地址" aria-required="true" aria-invalid={!!error}
                                            className={authFieldClassName}
                                            placeholder="请输入邮箱地址" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="password" className={authLabelClassName}>密码</label>
                                    <div className="relative">
                                        <FaLock className={authFieldIconClassName} />
                                        <input id="password" name="password" type={showPassword ? 'text' : 'password'} required enterKeyHint="next" aria-label="密码" aria-required="true" aria-invalid={!!error} aria-describedby="password-strength"
                                            className={authPasswordFieldClassName}
                                            placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className={authFieldActionClassName} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                                            {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {password && username && email && (
                                        <div id="password-strength" className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-5" role="status" aria-live="polite">
                                            <div className="text-slate-600">密码强度：<span className={`ml-1 font-semibold ${strengthColor}`}>{strengthLabel}</span></div>
                                            {passwordStrength.feedback && <div className="mt-1 text-slate-500">{passwordStrength.feedback}</div>}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="confirmPassword" className={authLabelClassName}>确认密码</label>
                                    <div className="relative">
                                        <FaLock className={authFieldIconClassName} />
                                        <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required enterKeyHint="done" aria-label="确认密码" aria-required="true" aria-invalid={password !== confirmPassword}
                                            className={authPasswordFieldClassName}
                                            placeholder="请再次输入密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={authFieldActionClassName} aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}>
                                            {showConfirmPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {!turnstileConfigLoading && turnstileConfig.siteKey && (
                                    <div role="group" aria-label="人机验证">
                                        <TurnstileWidget key={turnstileKey} siteKey={turnstileConfig.siteKey} onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} onError={handleTurnstileError} theme="light" size="normal" />
                                        {turnstileVerified && <p className="mt-2 text-xs text-emerald-600" role="status" aria-live="polite">人机验证通过</p>}
                                        {turnstileError && <p className="mt-2 text-xs text-rose-600" role="alert" aria-live="assertive">验证失败，请重新验证</p>}
                                    </div>
                                )}

                                <div className="flex items-start">
                                    <input id="agree" name="agree" type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} aria-label="我已阅读并同意服务条款与隐私政策" aria-required="true" className={cn(authCheckboxClassName, 'mt-0.5')} required />
                                    <label htmlFor="agree" className="ml-2 block text-xs leading-5 text-slate-600">我已阅读并同意<Link to="/policy" className={cn(authTextLinkClassName, 'ml-1')} target="_blank">服务条款与隐私政策</Link></label>
                                </div>

                                <m.button type="submit" disabled={loading || password !== confirmPassword || (!!turnstileConfig.siteKey && !turnstileVerified)} aria-label={loading ? '正在注册' : '创建账号'} aria-busy={loading}
                                    className={authPrimaryButtonClassName}
                                    whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                    {loading ? '注册中...' : '创建账户'}
                                </m.button>
                            </form>

                            <div className={authDividerClassName}>
                                <div className="absolute inset-0 flex items-center"><div className={authDividerLineClassName}></div></div>
                                <div className="relative flex justify-center"><span className={authDividerLabelClassName}>或者</span></div>
                            </div>

                            <div className="space-y-4">
                                <GoogleAuthButton
                                    intent="register"
                                    label="使用 Google 注册或登录"
                                    description="使用 Google 账号快速注册，首次登录自动创建本地账户"
                                />
                                <LinuxDoAuthButton
                                    intent="register"
                                    label="使用 Linux.do 一键注册"
                                    description="复用 Linux.do 论坛账号，首次登录自动创建本地账户"
                                />
                            </div>

                            <div className="mt-6 text-center">
                                <p className="text-sm text-slate-600">已有账户？<Link to="/login" className={authTextLinkClassName}>立即登录</Link></p>
                            </div>
                        </div>
                    </m.div>

                    <div className="mt-6 text-center">
                        <Link to="/" className={authBackLinkClassName} aria-label="返回首页">
                            <FaArrowLeft className="h-3.5 w-3.5" />返回首页
                        </Link>
                    </div>
                </div>

                <AnimatePresence>
                    {showEmailVerify && (
                        <m.div className={authModalOverlayClassName} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} role="dialog" aria-modal="true" aria-labelledby="verify-email-title" aria-describedby="verify-email-description">
                            <m.div className={authModalCardClassName}
                                initial={{ scale: 0.95, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 24 }} transition={{ duration: 0.3, type: 'spring', damping: 25, stiffness: 300 }}>
                                <div className="text-center">
                                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                                        <FaCheckCircle className="h-8 w-8 text-emerald-600" />
                                    </div>
                                    <div className={authEyebrowClassName}>Email Verification</div>
                                    <h3 id="verify-email-title" className="mt-2 text-2xl font-semibold text-slate-900">验证邮件已发送</h3>
                                    <p id="verify-email-description" className="mt-3 text-sm leading-7 text-slate-600">
                                        我们已向 <span className="font-semibold text-slate-900">{pendingEmail}</span> 发送了验证链接
                                    </p>
                                </div>

                                <div className={cn(authInfoPanelClassName, 'mt-6')}>
                                    <div className="flex items-start gap-3">
                                        <FaInfoCircle className="mt-1 shrink-0 text-slate-500" />
                                        <div className="text-sm leading-6 text-slate-600">
                                            <p className="font-semibold text-slate-900">下一步操作</p>
                                            <p className="mt-1">打开邮箱，找到来自 Synapse 的验证邮件，并使用相同设备和网络打开链接。</p>
                                        </div>
                                    </div>
                                </div>

                                <div className={cn(authWarningPanelClassName, 'mt-4')}>
                                    验证链接 10 分钟内有效，请及时验证。
                                </div>

                                {verifyError && <div className={cn(authAlertClassName, 'mt-4')}>{verifyError}</div>}
                                {verifyResendTimer > 0 && <div className={cn(authSuccessPanelClassName, 'mt-4')}>验证码已重新发送，{verifyResendTimer} 秒后可再次发送。</div>}

                                <div className="mt-6 space-y-3">
                                    <button type="button" className={authPrimaryButtonClassName}
                                        onClick={() => { setShowEmailVerify(false); navigate('/login'); }}>前往登录页面</button>
                                    <button type="button" className={authSecondaryButtonClassName} disabled={verifyLoading || verifyResendTimer > 0} onClick={() => void handleResendVerifyCode()}>
                                        {verifyLoading ? '发送中...' : '重新发送验证邮件'}
                                    </button>
                                    <button type="button" className={authSecondaryButtonClassName} onClick={() => setShowEmailVerify(false)} aria-label="返回修改邮箱地址">返回修改邮箱</button>
                                </div>
                            </m.div>
                        </m.div>
                    )}
                </AnimatePresence>
            </div>
        </LazyMotion>
    );
};
