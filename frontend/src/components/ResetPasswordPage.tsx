import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { FaEnvelope, FaLock, FaArrowLeft, FaVolumeUp, FaEye, FaEyeSlash, FaKey } from 'react-icons/fa';
import getApiBaseUrl from '../api';

export const ResetPasswordPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const location = useLocation();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileError, setTurnstileError] = useState(false);
    const [turnstileKey, setTurnstileKey] = useState(0);

    useEffect(() => {
        // Get email from navigation state if available
        if (location.state && (location.state as any).email) {
            setEmail((location.state as any).email);
        }
    }, [location]);

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
        const sanitizedCode = DOMPurify.sanitize(code).trim();

        if (!sanitizedEmail || !sanitizedCode || !newPassword) {
            setError('请填写所有字段');
            return;
        }

        // Validate code format (8 digits)
        if (!/^\d{8}$/.test(sanitizedCode)) {
            setError('验证码必须为8位数字');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        // Validate password strength
        if (newPassword.length < 8) {
            setError('密码至少需要8个字符');
            return;
        }

        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证');
            setNotification({ message: '请先完成人机验证', type: 'warning' });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(getApiBaseUrl() + '/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    email: sanitizedEmail,
                    code: sanitizedCode,
                    newPassword,
                    turnstileToken: turnstileConfig.siteKey ? turnstileToken : undefined
                }),
                credentials: 'same-origin'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccess(true);
                setNotification({ message: '密码重置成功', type: 'success' });
                // Navigate to login page after 2 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else {
                setError(data.error || '密码重置失败');
                setNotification({ message: data.error || '密码重置失败', type: 'error' });
            }
        } catch (err: any) {
            setError('网络错误，请稍后重试');
            setNotification({ message: '网络错误，请稍后重试', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-12 px-6 animate-gradient py-8 rounded-3xl">
            <div className="w-full max-w-md animate-scaleIn">
                {/* Header */}
                <div className="mb-8 text-center animate-slideInUp">
                    <div className="mb-4 inline-flex items-center gap-3">
                        <FaVolumeUp className="h-10 w-10 text-[#219EBC]" />
                        <h1 className="text-3xl font-bold text-[#023047]">Happy TTS</h1>
                    </div>
                    <p className="text-[#023047]/70">重置密码</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-[#8ECAE6]/30 px-8 py-8 hover:shadow-2xl transition-all duration-300">
                    {success ? (
                        <div className="text-center py-8">
                            <div className="mb-4 flex justify-center">
                                <div className="rounded-full bg-green-100 p-3">
                                    <svg className="h-12 w-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                            </div>
                            <h3 className="text-xl font-semibold text-[#023047] mb-2">密码重置成功！</h3>
                            <p className="text-[#023047]/70 mb-4">您的密码已成功重置</p>
                            <p className="text-sm text-[#023047]/50">正在跳转到登录页面...</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-bold text-[#023047] mb-2">输入新密码</h2>
                                <p className="text-sm text-[#023047]/70">
                                    输入发送到您邮箱的验证码和您的新密码
                                </p>
                            </div>

                            <form className="space-y-6" onSubmit={handleSubmit}>
                                {error && (
                                    <div
                                        role="alert"
                                        aria-live="assertive"
                                        className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm"
                                    >
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                        邮箱地址
                                    </label>
                                    <div className="relative">
                                        <FaEnvelope className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            required
                                            inputMode="email"
                                            aria-label="邮箱地址"
                                            aria-required="true"
                                            aria-invalid={!!error}
                                            className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="请输入邮箱地址"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                                        验证码
                                    </label>
                                    <div className="relative">
                                        <FaKey className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="code"
                                            name="code"
                                            type="text"
                                            required
                                            inputMode="numeric"
                                            pattern="[0-9]{8}"
                                            maxLength={8}
                                            aria-label="Verification code"
                                            aria-required="true"
                                            aria-invalid={!!error}
                                            className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all font-mono text-lg tracking-wider"
                                            placeholder="12345678"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                            autoComplete="one-time-code"
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-[#023047]/50">输入发送到您邮箱的8位数字验证码</p>
                                </div>

                                <div>
                                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                        新密码
                                    </label>
                                    <div className="relative">
                                        <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="newPassword"
                                            name="newPassword"
                                            type={showPassword ? "text" : "password"}
                                            required
                                            aria-label="新密码"
                                            aria-required="true"
                                            aria-invalid={!!error}
                                            className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="••••••••"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                        >
                                            {showPassword ? <FaEyeSlash className="h-5 w-5" /> : <FaEye className="h-5 w-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                        确认新密码
                                    </label>
                                    <div className="relative">
                                        <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            required
                                            aria-label="确认新密码"
                                            aria-required="true"
                                            aria-invalid={!!error}
                                            className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                                        >
                                            {showConfirmPassword ? <FaEyeSlash className="h-5 w-5" /> : <FaEye className="h-5 w-5" />}
                                        </button>
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
                                                验证通过
                                            </p>
                                        )}
                                        {turnstileError && (
                                            <p className="mt-2 text-xs text-red-600" role="alert" aria-live="assertive">
                                                验证失败，请重试
                                            </p>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)}
                                    aria-label={loading ? '重置密码中...' : '重置密码'}
                                    aria-busy={loading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    {loading ? '重置密码中...' : '重置密码'}
                                </button>
                            </form>

                            <div className="mt-6 text-center space-y-3">
                                <Link to="/forgot-password" className="block text-sm text-[#FFB703] hover:text-[#FB8500] font-medium">
                                    重新发送验证码
                                </Link>
                                <Link to="/login" className="block text-sm text-[#FFB703] hover:text-[#FB8500] font-medium">
                                    返回登录
                                </Link>
                            </div>
                        </>
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#023047]/70 hover:text-[#023047] transition-colors" aria-label="返回首页">
                        <FaArrowLeft className="h-4 w-4" />
                        返回首页
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;