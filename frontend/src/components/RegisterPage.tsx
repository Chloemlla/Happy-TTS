import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import VerifyCodeInput from './VerifyCodeInput';
import { AnimatePresence, motion } from 'framer-motion';
import getApiBaseUrl from '../api';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaUser, FaVolumeUp, FaArrowLeft, FaCheckCircle } from 'react-icons/fa';
import { getFingerprint, getClientIP } from '../utils/fingerprint';

interface PasswordStrength {
    score: number;
    feedback: string;
}

export const RegisterPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });

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

    const allowedDomains = ['gmail.com', 'outlook.com', 'qq.com', '163.com', '126.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'foxmail.com', 'hapxs.com', 'hapx.one'];
    const emailPattern = new RegExp(`^[\\w.-]+@(${allowedDomains.map(d => d.replace('.', '\\.')).join('|')})$`);
    const reservedUsernames = ['admin', 'root', 'system', 'test', 'administrator'];

    useEffect(() => { if (turnstileToken) setError(null); }, [turnstileToken]);

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

    const checkPasswordStrength = (pwd: string): PasswordStrength => {
        let score = 0;
        const feedback: string[] = [];

        if (pwd.length < 8) {
            feedback.push('密码长度至少需要8个字符');
        } else if (pwd.length >= 12) {
            score += 2;
        } else {
            score += 1;
        }

        if (/\d/.test(pwd)) score += 1; else feedback.push('需要包含数字');
        if (/[a-z]/.test(pwd)) score += 1; else feedback.push('需要包含小写字母');
        if (/[A-Z]/.test(pwd)) score += 1; else feedback.push('需要包含大写字母');
        if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 1; else feedback.push('需要包含特殊字符');

        const commonPatterns = [/^123/, /password/i, /qwerty/i, /abc/i, new RegExp(username, 'i')];
        if (commonPatterns.some(pattern => pattern.test(pwd))) {
            score = 0;
            feedback.push('请避免使用常见密码模式');
        }

        return { score, feedback: feedback.join('、') };
    };

    const validateInput = (value: string, type: 'username' | 'email' | 'password'): string | null => {
        const sanitizedValue = DOMPurify.sanitize(value).trim();

        switch (type) {
            case 'username':
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitizedValue)) {
                    return '用户名只能包含字母、数字和下划线，长度3-20个字符';
                }
                if (reservedUsernames.includes(sanitizedValue.toLowerCase())) {
                    return '该用户名为保留字段，不能注册';
                }
                if (/[';"]/.test(sanitizedValue)) {
                    return '用户名包含非法字符';
                }
                break;
            case 'email':
                if (!emailPattern.test(sanitizedValue)) {
                    return '只支持主流邮箱（如gmail、outlook、qq、163、126等）';
                }
                break;
            case 'password':
                const strength = checkPasswordStrength(sanitizedValue);
                if (strength.score < 2) {
                    return strength.feedback || '密码强度不足';
                }
                break;
        }
        return null;
    };

    useEffect(() => {
        if (!username || !email) {
            setPasswordStrength({ score: 0, feedback: '' });
            return;
        }
        if (password) {
            setPasswordStrength(checkPasswordStrength(password));
        } else {
            setPasswordStrength({ score: 0, feedback: '' });
        }
    }, [password, username, email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const usernameError = validateInput(username, 'username');
        if (usernameError) { setError(usernameError); return; }

        const emailError = validateInput(email, 'email');
        if (emailError) { setError(emailError); return; }

        const passwordError = validateInput(password, 'password');
        if (passwordError) { setError(passwordError); return; }

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        if (!agreed) {
            setNotification({ message: '请勾选服务条款与隐私政策', type: 'warning' });
            return;
        }

        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证');
            setNotification({ message: '请先完成人机验证', type: 'warning' });
            return;
        }

        setLoading(true);

        try {
            const sanitizedUsername = DOMPurify.sanitize(username).trim();
            const sanitizedEmail = DOMPurify.sanitize(email).trim();
            
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

            const requestBody: any = {
                username: sanitizedUsername,
                email: sanitizedEmail,
                password: password,
                fingerprint: fingerprint,
                clientIP: clientIP // 发送客户端获取的IP作为参考
            };

            if (turnstileConfig.siteKey && turnstileToken) {
                requestBody.cfToken = turnstileToken;
            }

            const res = await fetch(getApiBaseUrl() + '/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();

            if (data && data.needVerify) {
                // 使用验证链接方式，不再显示验证码输入框
                setNotification({ 
                    message: data.message || '验证链接已发送到您的邮箱，请点击链接完成注册', 
                    type: 'success' 
                });
                setError('');
                // 显示成功提示页面
                setShowEmailVerify(true);
                setPendingEmail(sanitizedEmail);
                setTurnstileToken('');
                setTurnstileVerified(false);
                setTurnstileKey(k => k + 1);
            } else {
                setError(data?.error || '注册失败');
                setNotification({ message: data?.error || '注册失败', type: 'error' });
            }
        } catch (err: any) {
            setError(err.message || '注册失败');
            setNotification({ message: err.message || '注册失败', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!showEmailVerify || verifyResendTimer <= 0) return;
        const timer = setInterval(() => {
            setVerifyResendTimer(t => t > 0 ? t - 1 : 0);
        }, 1000);
        return () => clearInterval(timer);
    }, [verifyResendTimer, showEmailVerify]);

    const handleResendVerifyCode = async () => {
        if (verifyResendTimer > 0) return;
        setVerifyLoading(true);
        setVerifyError('');

        try {
            const res = await fetch(getApiBaseUrl() + '/api/auth/send-verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingEmail })
            });
            const data = await res.json();

            if (data && data.success) {
                setNotification({ message: '验证码已重新发送', type: 'success' });
                setVerifyResendTimer(60);
            } else {
                setVerifyError(data.error || '验证码发送失败');
                setNotification({ message: data.error || '验证码发送失败', type: 'error' });
            }
        } catch (err: any) {
            setVerifyError(err.message || '验证码发送失败');
            setNotification({ message: err.message || '验证码发送失败', type: 'error' });
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleVerifyCode = async (code?: string) => {
        setVerifyLoading(true);
        setVerifyError('');
        const finalCode = code || verifyCode;

        if (!/^[0-9]{8}$/.test(finalCode)) {
            setVerifyError('验证码必须为8位数字');
            setVerifyLoading(false);
            return;
        }

        try {
            const res = await fetch(getApiBaseUrl() + '/api/auth/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingEmail, code: finalCode })
            });
            const data = await res.json();

            if (data && data.success) {
                setShowEmailVerify(false);
                setPendingEmail('');
                setVerifyCode('');
                setVerifyError('');
                setNotification({ message: '注册成功，请登录', type: 'success' });
                navigate('/login');
            } else {
                setVerifyError(data.error || '验证码错误');
                setNotification({ message: data.error || '验证码错误', type: 'error' });
            }
        } catch (err: any) {
            setVerifyError(err.message || '验证码校验失败');
            setNotification({ message: err.message || '验证码校验失败', type: 'error' });
        } finally {
            setVerifyLoading(false);
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
                    <p className="text-[#023047]/70">Create your account!</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-[#8ECAE6]/30 px-8 py-8 hover:shadow-2xl transition-all duration-300">
                    <form className="space-y-4" onSubmit={handleSubmit} aria-label="注册表单">
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
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                                用户名
                            </label>
                            <div className="relative">
                                <FaUser className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    inputMode="text"
                                    enterKeyHint="next"
                                    aria-label="用户名"
                                    aria-required="true"
                                    aria-invalid={!!error}
                                    aria-describedby="username-hint"
                                    className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                    placeholder="3-20个字符"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    maxLength={20}
                                    pattern="^[a-zA-Z0-9_]{3,20}$"
                                    autoComplete="username"
                                />
                                <span id="username-hint" className="sr-only">用户名长度3到20个字符，只允许字母、数字和下划线</span>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                邮箱
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    inputMode="email"
                                    enterKeyHint="next"
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
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                密码
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    enterKeyHint="next"
                                    aria-label="密码"
                                    aria-required="true"
                                    aria-invalid={!!error}
                                    aria-describedby="password-strength"
                                    className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    minLength={8}
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
                            {password && username && email && (
                                <div id="password-strength" className="mt-2 p-2 text-xs bg-gray-50 border border-gray-200 rounded-md" role="status" aria-live="polite">
                                    <div className="mb-1">
                                        密码强度：
                                        <span className={`font-semibold ml-1 ${passwordStrength.score >= 4 ? 'text-green-600' :
                                                passwordStrength.score >= 3 ? 'text-[#219EBC]' :
                                                    passwordStrength.score >= 2 ? 'text-yellow-600' :
                                                        'text-red-600'
                                            }`}>
                                            {passwordStrength.score >= 4 ? '很强' :
                                                passwordStrength.score >= 3 ? '强' :
                                                    passwordStrength.score >= 2 ? '中等' : '弱'}
                                        </span>
                                    </div>
                                    {passwordStrength.feedback && (
                                        <div className="text-gray-600">
                                            {passwordStrength.feedback}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                确认密码
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    required
                                    enterKeyHint="done"
                                    aria-label="确认密码"
                                    aria-required="true"
                                    aria-invalid={password !== confirmPassword}
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
                                    <p className="mt-2 text-xs text-green-600" role="status" aria-live="polite">人机验证通过</p>
                                )}
                                {turnstileError && (
                                    <p className="mt-2 text-xs text-red-600" role="alert" aria-live="assertive">验证失败，请重新验证</p>
                                )}
                            </div>
                        )}

                        <div className="flex items-start">
                            <input
                                id="agree"
                                name="agree"
                                type="checkbox"
                                checked={agreed}
                                onChange={e => setAgreed(e.target.checked)}
                                aria-label="我已阅读并同意服务条款与隐私政策"
                                aria-required="true"
                                className="h-4 w-4 mt-0.5 text-[#FFB703] focus:ring-[#219EBC] border-[#8ECAE6]/30 rounded"
                                required
                            />
                            <label htmlFor="agree" className="ml-2 block text-xs text-gray-600">
                                我已阅读并同意
                                <Link to="/policy" className="text-[#FFB703] hover:underline ml-1" target="_blank">
                                    服务条款与隐私政策
                                </Link>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || password !== confirmPassword || (!!turnstileConfig.siteKey && !turnstileVerified)}
                            aria-label={loading ? '正在注册' : '创建账号'}
                            aria-busy={loading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                            {loading ? '注册中...' : '创建账户'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-[#023047]/70">
                            已有账户？<Link to="/login" className="font-medium text-[#FFB703] hover:text-[#FB8500]">立即登录</Link>
                        </p>
                    </div>
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#023047]/70 hover:text-[#023047] transition-colors" aria-label="返回首页">
                        <FaArrowLeft className="h-4 w-4" />
                        返回首页
                    </Link>
                </div>
            </div>

            {/* 邮箱验证码弹窗 */}
            <AnimatePresence>
                {showEmailVerify && (
                    <motion.div
                        className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50 p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="verify-email-title"
                        aria-describedby="verify-email-description"
                    >
                        <motion.div
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden max-h-[90vh] overflow-y-auto"
                            initial={{ scale: 0.9, opacity: 0, y: 50 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 50 }}
                            transition={{ duration: 0.3, type: "spring", damping: 25, stiffness: 300 }}
                        >
                            <div className="h-1 bg-[#FFB703]"></div>

                            <div className="p-4 sm:p-6 md:p-8">
                                <div className="text-center mb-6">
                                    <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-[#8ECAE6]/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 id="verify-email-title" className="text-2xl font-bold text-[#023047] mb-4">验证邮件已发送</h3>
                                    <p id="verify-email-description" className="text-[#023047]/70 leading-relaxed">
                                        我们已向 <br />
                                        <span className="font-semibold text-[#219EBC]">{pendingEmail}</span> <br />
                                        发送了验证链接
                                    </p>
                                </div>

                                <div className="bg-[#8ECAE6]/15 border-l-4 border-[#219EBC] p-4 mb-6 rounded-r-lg">
                                    <div className="flex items-start">
                                        <svg className="w-5 h-5 text-[#219EBC] mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                        <div className="text-sm text-[#023047]">
                                            <p className="font-semibold mb-2">下一步操作：</p>
                                            <ul className="list-disc list-inside space-y-1">
                                                <li>打开您的邮箱</li>
                                                <li>找到来自 Happy-TTS 的验证邮件</li>
                                                <li>点击邮件中的验证按钮</li>
                                                <li>使用<strong>相同的设备和网络</strong>打开链接</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg">
                                    <div className="flex items-start">
                                        <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <div className="text-sm text-amber-800">
                                            <p className="font-semibold mb-1">重要提示</p>
                                            <p>验证链接<strong>10分钟</strong>内有效，请及时验证</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        className="w-full py-4 px-6 rounded-2xl font-semibold text-lg transition-all duration-200 bg-[#FFB703] text-[#023047] hover:bg-[#FB8500] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                        onClick={() => {
                                            setShowEmailVerify(false);
                                            navigate('/login');
                                        }}
                                    >
                                        前往登录页面
                                    </button>
                                </div>

                                <div className="mt-6 text-center">
                                    <p className="text-sm text-gray-500 mb-2" role="status">
                                        没有收到邮件？请检查垃圾邮件文件夹
                                    </p>
                                    <button
                                        type="button"
                                        className="text-sm text-[#219EBC] hover:text-[#023047] font-medium transition-colors"
                                        onClick={() => setShowEmailVerify(false)}
                                        aria-label="返回修改邮箱地址"
                                    >
                                        返回修改邮箱
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
