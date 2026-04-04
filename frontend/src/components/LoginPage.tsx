import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { usePasskey } from '../hooks/usePasskey';
import { useNotification } from './Notification';
import LinuxDoAuthButton from './LinuxDoAuthButton';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import PasskeyVerifyModal from './PasskeyVerifyModal';
import TOTPVerification from './TOTPVerification';
import VerificationMethodSelector from './VerificationMethodSelector';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaFingerprint, FaVolumeUp, FaArrowLeft, FaQuestionCircle, FaChevronDown, FaChevronUp, FaShieldAlt, FaBolt, FaMobileAlt, FaUser } from 'react-icons/fa';

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const CARD_TRANSITION = { duration: 0.55, type: 'spring', stiffness: 130 } as const;
const ITEM_HOVER = { scale: 1.04 } as const;
const BUTTON_TAP = { scale: 0.96 } as const;

export const LoginPage: React.FC = () => {
    const { user, login, pending2FA, setPending2FA } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
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

    const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
    const effectiveCardTransition = React.useMemo(() => prefersReducedMotion ? NO_TRANSITION : CARD_TRANSITION, [prefersReducedMotion]);
    const effectiveItemHover = React.useMemo(() => prefersReducedMotion ? undefined : ITEM_HOVER, [prefersReducedMotion]);
    const effectiveButtonTap = React.useMemo(() => prefersReducedMotion ? undefined : BUTTON_TAP, [prefersReducedMotion]);

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
            setNotification({ message: '登录成功', type: 'success' }); window.location.reload();
        } catch (err: any) {
            setError(err.message || '登录失败'); setNotification({ message: err.message || '登录失败', type: 'error' });
        } finally { setLoading(false); }
    };

    const handleVerificationMethodSelect = async (method: 'passkey' | 'totp') => {
        setShowVerificationSelector(false); setLoading(true);
        try {
            if (method === 'passkey') {
                // authenticateWithPasskey throws on failure (including "not enabled" 400 errors)
                const success = await authenticateWithPasskey(pendingVerificationData.username);
                if (success) { setPendingVerificationData(null); window.location.reload(); }
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-6 rounded-3xl">
                <div className="w-full max-w-md">
                    <m.div className="mb-8 text-center" variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5 }}>
                        <div className="mb-3 inline-flex items-center gap-3">
                            <FaVolumeUp className="h-10 w-10 text-[#219EBC]" />
                            <h1 className="text-3xl font-bold font-songti text-[#023047]">Synapse</h1>
                        </div>
                        <p className="text-[#023047]/60 text-sm tracking-wide">Welcome back!</p>
                    </m.div>

                    <m.div
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden hover:shadow-2xl transition-shadow duration-300"
                        variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}
                    >
                        <div className="bg-[#023047] px-8 py-5 text-white">
                            <h2 className="text-lg font-songti font-semibold">登录账户</h2>
                            <p className="text-[#8ECAE6] text-xs mt-1">使用您的账户信息安全登录</p>
                        </div>

                        <div className="px-8 py-8">
                            {user && (
                                <m.div 
                                    initial={{ opacity: 0, y: -10 }} 
                                    animate={{ opacity: 1, y: 0 }} 
                                    className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3"
                                >
                                    <FaUser className="text-indigo-500 mt-1 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-indigo-700">您已登录为 {user.username}</p>
                                        <p className="text-[11px] text-indigo-600/80 mt-0.5">继续登录将在此设备上添加新账号，您可以在菜单中随时切换。</p>
                                    </div>
                                </m.div>
                            )}
                            <form className="space-y-5" onSubmit={handleSubmit}>
                                {error && (
                                    <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
                                )}
                                <div>
                                    <label htmlFor="username" className="block text-sm font-medium text-[#023047]/80 mb-2">邮箱或用户名</label>
                                    <div className="relative">
                                        <FaEnvelope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ECAE6]" />
                                        <input id="username" name="username" type="text" required inputMode="text" enterKeyHint="next" aria-label="用户名或邮箱" aria-required="true" aria-invalid={!!error}
                                            className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/40 rounded-lg bg-white/60 placeholder-[#023047]/30 text-[#023047] focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="请输入邮箱或用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label htmlFor="password" className="block text-sm font-medium text-[#023047]/80">密码</label>
                                        <Link to="/forgot-password" className="text-xs text-[#FFB703] hover:text-[#FB8500] font-medium transition-colors" aria-label="忘记密码">忘记密码？</Link>
                                    </div>
                                    <div className="relative">
                                        <FaLock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ECAE6]" />
                                        <input id="password" name="password" type={showPassword ? "text" : "password"} required enterKeyHint="done" aria-label="密码" aria-required="true" aria-invalid={!!error}
                                            className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/40 rounded-lg bg-white/60 placeholder-[#023047]/30 text-[#023047] focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8ECAE6] hover:text-[#219EBC] transition-colors" aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                                            {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} aria-label="Remember my username" className="h-4 w-4 text-[#FFB703] focus:ring-[#219EBC] border-[#8ECAE6]/40 rounded" />
                                    <label htmlFor="remember-me" className="ml-2 block text-sm text-[#023047]/70">记住我</label>
                                </div>
                                {!turnstileConfigLoading && turnstileConfig.siteKey && (
                                    <div role="group" aria-label="人机验证">
                                        <TurnstileWidget key={turnstileKey} siteKey={turnstileConfig.siteKey} onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} onError={handleTurnstileError} theme="light" size="normal" />
                                        {turnstileVerified && <p className="mt-2 text-xs text-green-600" role="status" aria-live="polite">人机验证通过</p>}
                                        {turnstileError && <p className="mt-2 text-xs text-red-600" role="alert" aria-live="assertive">验证失败，请重新验证</p>}
                                    </div>
                                )}
                                <m.button type="submit" disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)} aria-label={loading ? '正在登录' : '登录'} aria-busy={loading}
                                    className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] shadow-lg shadow-[#FFB703]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                    whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                    {loading ? '登录中...' : '登录'}
                                </m.button>
                            </form>

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#8ECAE6]/30"></div></div>
                                <div className="relative flex justify-center text-xs"><span className="bg-white px-4 text-[#023047]/40">或者使用以下方式</span></div>
                            </div>

                            <div className="space-y-4">
                                <LinuxDoAuthButton
                                    intent="login"
                                    label="使用 Linux.do 登录或注册"
                                    description="复用 Linux.do 论坛账号，首次登录自动创建本地账户"
                                />
                                <div className="bg-[#8ECAE6]/10 rounded-xl p-4 border border-[#8ECAE6]/30">
                                    <div className="flex items-start gap-3">
                                        <FaFingerprint className="h-5 w-5 text-[#219EBC] flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <h3 className="text-sm font-semibold text-[#023047] mb-1">通行密钥 — 无密码认证</h3>
                                            <p className="text-xs text-[#023047]/60 mb-3">使用生物识别或设备认证，更安全便捷的登录方式</p>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                {[{ Icon: FaShieldAlt, color: 'text-green-600', label: '安全', sub: '防钓鱼' }, { Icon: FaBolt, color: 'text-[#FFB703]', label: '快速', sub: '一键登录' }, { Icon: FaMobileAlt, color: 'text-[#219EBC]', label: '简单', sub: '无需密码' }].map(({ Icon, color, label, sub }) => (
                                                    <div key={label} className="flex flex-col items-center text-center p-2 bg-white/80 rounded-lg">
                                                        <Icon className={`h-4 w-4 ${color} mb-1`} /><span className="text-xs font-medium text-[#023047]">{label}</span><span className="text-[10px] text-[#023047]/50">{sub}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <button type="button" onClick={() => setShowPasskeyHelp(!showPasskeyHelp)} className="flex items-center gap-1.5 text-xs text-[#219EBC] hover:text-[#023047] font-medium transition-colors">
                                                <FaQuestionCircle className="h-3 w-3" /><span>{showPasskeyHelp ? '隐藏' : '显示'}详细指南</span>
                                                {showPasskeyHelp ? <FaChevronUp className="h-2.5 w-2.5" /> : <FaChevronDown className="h-2.5 w-2.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    {showPasskeyHelp && (
                                        <div className="mt-4 pt-4 border-t border-[#8ECAE6]/30 space-y-3">
                                            {[
                                                { num: '1', title: '如何使用通行密钥', items: ['点击下方"使用通行密钥登录"按钮', '浏览器将提示您进行认证', '使用指纹、面部识别或设备PIN码', '验证后将自动登录'] },
                                                { num: '2', title: '前置要求', items: ['您必须已为账户注册了通行密钥', '您的设备必须支持生物认证或安全密钥', '使用现代浏览器（Chrome、Edge、Safari、Firefox）'] },
                                            ].map(({ num, title, items }) => (
                                                <div key={num}>
                                                    <h4 className="text-xs font-semibold text-[#023047] mb-2 flex items-center gap-2">
                                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#219EBC] text-white text-[10px]">{num}</span>{title}
                                                    </h4>
                                                    <ul className="space-y-1.5 text-xs text-[#023047]/60 ml-7">
                                                        {items.map(item => <li key={item} className="flex items-start gap-2"><span className="text-[#219EBC] mt-0.5">•</span><span>{item}</span></li>)}
                                                    </ul>
                                                </div>
                                            ))}
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                                <div className="flex items-start gap-2">
                                                    <FaShieldAlt className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                                    <div><p className="text-xs font-medium text-green-900 mb-1">为什么通行密钥更安全</p><p className="text-xs text-green-700">通行密钥使用公钥加密，可以抵御钓鱼、凭据填充和其他常见攻击。您的生物特征数据从不离开您的设备。</p></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <m.button type="button" onClick={async () => { try { setLoading(true); const success = await authenticateWithDiscoverablePasskey(); if (success) setNotification({ message: '通行密钥登录成功！', type: 'success' }); } catch (err: any) { setNotification({ message: err.message || '通行密钥登录失败', type: 'error' }); } finally { setLoading(false); } }} disabled={loading}
                                    className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border-2 border-[#8ECAE6]/30 rounded-xl text-sm font-semibold text-[#023047] bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                                    aria-label="Sign in with Passkey" whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                                    <FaFingerprint className="h-5 w-5" />
                                    <span className="flex flex-col items-start"><span>使用通行密钥登录</span><span className="text-[11px] font-normal text-[#219EBC]">快速、安全、无密码</span></span>
                                </m.button>
                                <p className="text-xs text-center text-[#023047]/40 px-4">💡 提示：设置后，通行密钥登录比密码更快更安全</p>
                            </div>

                            <div className="mt-6 text-center">
                                <p className="text-sm text-[#023047]/60">还没有账户？<Link to="/register" className="font-medium text-[#FFB703] hover:text-[#FB8500] transition-colors">立即注册</Link></p>
                            </div>
                        </div>
                    </m.div>

                    <div className="mt-6 text-center">
                        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#023047]/50 hover:text-[#023047] transition-colors" aria-label="返回首页">
                            <FaArrowLeft className="h-3.5 w-3.5" />返回首页
                        </Link>
                    </div>
                </div>

                <PasskeyVerifyModal open={showPasskeyVerification || false} username={username} onSuccess={() => { setShowPasskeyVerification(false); setPending2FA(null); setPendingVerificationData(null); window.location.reload(); }} onClose={() => { setShowPasskeyVerification(false); setPending2FA(null); setPendingVerificationData(null); }} />
                {showTOTPVerification && (<TOTPVerification isOpen={showTOTPVerification} onClose={() => { setShowTOTPVerification(false); setPending2FA(null); setPendingVerificationData(null); }} onSuccess={() => { setShowTOTPVerification(false); setPending2FA(null); setPendingVerificationData(null); window.location.reload(); }} userId={pending2FA?.userId || ''} token={pendingToken || ''} />)}
                {showVerificationSelector && pendingVerificationData && (<VerificationMethodSelector isOpen={showVerificationSelector} onClose={handleVerificationSelectorClose} onSelectMethod={handleVerificationMethodSelect} username={pendingVerificationData.username} loading={loading} availableMethods={pendingVerificationData.twoFactorType?.map((type: string) => type === 'Passkey' ? 'passkey' : type === 'TOTP' ? 'totp' : null).filter(Boolean) as ('passkey' | 'totp')[] || []} />)}
            </div>
        </LazyMotion>
    );
};
