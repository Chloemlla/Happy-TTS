import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { FaEnvelope, FaArrowLeft, FaVolumeUp } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint, getClientIP } from '../utils/fingerprint';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const CARD_TRANSITION = { duration: 0.55, type: 'spring', stiffness: 130 } as const;
const ITEM_HOVER = { scale: 1.04 } as const;
const BUTTON_TAP = { scale: 0.96 } as const;

export const ForgotPasswordPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
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

        // Basic email validation
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
            // 获取设备指纹和客户端IP
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
                    clientIP: clientIP, // 发送客户端获取的IP作为参考
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
                // 不再自动跳转，显示友好提示
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-6 rounded-3xl">
                <div className="w-full max-w-md">
                    <m.div className="mb-8 text-center" variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5 }}>
                        <div className="mb-3 inline-flex items-center gap-3">
                            <FaVolumeUp className="h-10 w-10 text-[#219EBC]" />
                            <h1 className="text-3xl font-bold font-songti text-[#023047]">Synapse</h1>
                        </div>
                        <p className="text-[#023047]/60 text-sm tracking-wide">找回密码</p>
                    </m.div>

                    <m.div
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden hover:shadow-2xl transition-shadow duration-300"
                        variants={effectiveCardVariants} initial="hidden" animate="visible" transition={effectiveCardTransition}
                    >
                        {success ? (
                            <>
                                <div className="bg-[#023047] px-8 py-5 text-white">
                                    <h2 className="text-lg font-songti font-semibold">链接已发送</h2>
                                    <p className="text-[#8ECAE6] text-xs mt-1">请查收您的重置密码邮件</p>
                                </div>
                                <div className="px-8 py-8">
                                    <div className="text-center mb-6">
                                        <div className="w-20 h-20 bg-[#8ECAE6]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <svg className="w-10 h-10 text-[#219EBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-[#023047] mb-3">重置链接已发送！</h3>
                                        <p className="text-[#023047]/70 text-sm mb-2">我们已将密码重置链接发送至</p>
                                        <p className="font-semibold text-[#023047]">{email}</p>
                                    </div>

                                    <div className="bg-[#8ECAE6]/10 border-l-4 border-[#219EBC] p-4 mb-6 rounded-r-lg">
                                        <div className="flex items-start">
                                            <svg className="w-5 h-5 text-[#219EBC] mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            <div className="text-sm text-[#023047]/80">
                                                <p className="font-semibold mb-2 text-[#023047]">后续步骤：</p>
                                                <ul className="list-disc list-inside space-y-1 text-xs">
                                                    <li>检查您的邮箱收件箱</li>
                                                    <li>找到发自 Synapse 的邮件</li>
                                                    <li>点击 "重置密码" 按钮</li>
                                                    <li>请在<strong>相同设备和网络</strong>下打开链接</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-[#FFB703]/10 border-l-4 border-[#FFB703] p-4 mb-6 rounded-r-lg">
                                        <div className="flex items-start">
                                            <svg className="w-5 h-5 text-[#FFB703] mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                            <div className="text-sm text-[#023047]/80">
                                                <p className="font-semibold mb-1 text-[#023047]">重要提示</p>
                                                <p className="text-xs">重置链接有效期为 <strong>10 分钟</strong></p>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-xs text-[#023047]/50 text-center mb-6">
                                        没有收到邮件？请检查垃圾邮件文件夹
                                    </p>

                                    <Link
                                        to="/login"
                                        className="block w-full py-3 px-4 text-center rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] shadow-lg shadow-[#FFB703]/20 transition-all duration-200"
                                    >
                                        返回登录
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-[#023047] px-8 py-5 text-white">
                                    <h2 className="text-lg font-songti font-semibold">重置密码</h2>
                                    <p className="text-[#8ECAE6] text-xs mt-1">输入您的邮箱地址，我们将向您发送重置链接</p>
                                </div>

                                <div className="px-8 py-8">
                                    <form className="space-y-5" onSubmit={handleSubmit}>
                                        {error && (
                                            <div
                                                role="alert"
                                                aria-live="assertive"
                                                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
                                            >
                                                {error}
                                            </div>
                                        )}

                                        <div>
                                            <label htmlFor="email" className="block text-sm font-medium text-[#023047]/80 mb-2">
                                                邮箱地址
                                            </label>
                                            <div className="relative">
                                                <FaEnvelope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ECAE6]" />
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
                                                    className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/40 rounded-lg bg-white/60 placeholder-[#023047]/30 text-[#023047] focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
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
                                                {turnstileVerified && (
                                                    <p className="mt-2 text-xs text-green-600" role="status" aria-live="polite">
                                                        人机验证通过
                                                    </p>
                                                )}
                                                {turnstileError && (
                                                    <p className="mt-2 text-xs text-red-600" role="alert" aria-live="assertive">
                                                        验证失败，请重新验证
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <m.button
                                            type="submit"
                                            disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)}
                                            aria-label={loading ? '发送中...' : '发送重置链接'}
                                            aria-busy={loading}
                                            className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] shadow-lg shadow-[#FFB703]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                            whileHover={effectiveItemHover}
                                            whileTap={effectiveButtonTap}
                                        >
                                            {loading ? '发送中...' : '发送重置链接'}
                                        </m.button>
                                    </form>

                                    <div className="mt-6 flex flex-col items-center gap-3">
                                        <Link to="/login" className="text-sm text-[#219EBC] hover:text-[#023047] font-medium transition-colors">
                                            返回登录
                                        </Link>
                                    </div>
                                </div>
                            </>
                        )}
                    </m.div>

                    {/* Back to Home */}
                    <div className="mt-6 text-center">
                        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#023047]/50 hover:text-[#023047] transition-colors" aria-label="返回首页">
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