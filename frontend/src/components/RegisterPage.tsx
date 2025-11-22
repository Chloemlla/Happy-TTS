import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import VerifyCodeInput from './VerifyCodeInput';
import { AnimatePresence, motion } from 'framer-motion';
import getApiBaseUrl from '../api';

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

            const requestBody: any = {
                username: sanitizedUsername,
                email: sanitizedEmail,
                password: password
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
                setShowEmailVerify(true);
                setPendingEmail(sanitizedEmail);
                setNotification({ message: '验证码已发送到邮箱，请查收', type: 'info' });
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                {/* Header */}
                <div className="text-center">
                    <Link to="/" className="inline-flex items-center justify-center space-x-2 mb-6" aria-label="返回首页">
                        <img 
                            src="/favicon.ico" 
                            alt="Synapse Logo" 
                            className="w-12 h-12"
                        />
                    </Link>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                        创建您的账号
                    </h2>
                    <p className="text-sm text-gray-600">
                        加入 Synapse，开始您的语音合成之旅
                    </p>
                </div>

                {/* Form */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 px-8 py-8">
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
                            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                                用户名
                            </label>
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
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="3-20个字符，只允许字母、数字、下划线"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                maxLength={20}
                                pattern="^[a-zA-Z0-9_]{3,20}$"
                                autoComplete="username"
                            />
                            <span id="username-hint" className="sr-only">用户名长度3到20个字符，只允许字母、数字和下划线</span>
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                                邮箱地址
                            </label>
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
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="your-email@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                                密码
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                enterKeyHint="next"
                                aria-label="密码"
                                aria-required="true"
                                aria-invalid={!!error}
                                aria-describedby="password-strength"
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="至少8位，包含大小写字母、数字和特殊字符"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                                autoComplete="new-password"
                            />
                            {password && username && email && (
                                <div id="password-strength" className="mt-2 p-2 text-xs bg-gray-50 border border-gray-200 rounded-md" role="status" aria-live="polite">
                                    <div className="mb-1">
                                        密码强度：
                                        <span className={`font-semibold ml-1 ${
                                            passwordStrength.score >= 4 ? 'text-green-600' :
                                            passwordStrength.score >= 3 ? 'text-blue-600' :
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
                            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                                确认密码
                            </label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                required
                                enterKeyHint="done"
                                aria-label="确认密码"
                                aria-required="true"
                                aria-invalid={password !== confirmPassword}
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="再次输入密码"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
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
                                className="h-4 w-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                required
                            />
                            <label htmlFor="agree" className="ml-2 block text-xs text-gray-600">
                                我已阅读并同意
                                <Link to="/policy" className="text-blue-600 hover:underline ml-1" target="_blank">
                                    服务条款与隐私政策
                                </Link>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || password !== confirmPassword || (!!turnstileConfig.siteKey && !turnstileVerified)}
                            aria-label={loading ? '正在注册' : '创建账号'}
                            aria-busy={loading}
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? '注册中...' : '创建账号'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center">
                    <p className="text-sm text-gray-600">
                        已有账号？{' '}
                        <Link 
                            to="/login" 
                            className="font-medium text-blue-600 hover:text-blue-800"
                        >
                            立即登录
                        </Link>
                    </p>
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
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden"
                            initial={{ scale: 0.9, opacity: 0, y: 50 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 50 }}
                            transition={{ duration: 0.3, type: "spring", damping: 25, stiffness: 300 }}
                        >
                            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>

                            <div className="p-8">
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <h3 id="verify-email-title" className="text-2xl font-bold text-gray-900 mb-2">验证邮箱</h3>
                                    <p id="verify-email-description" className="text-gray-600 leading-relaxed">
                                        请输入发送到 <br />
                                        <span className="font-semibold text-gray-900">{pendingEmail}</span> <br />
                                        的验证码
                                    </p>
                                </div>

                                <div className="mb-8">
                                    <VerifyCodeInput
                                        length={8}
                                        inputClassName="w-12 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 bg-gray-50 focus:bg-white"
                                        onComplete={async (code) => {
                                            setVerifyCode(code);
                                            if (code.length === 8 && !verifyLoading) {
                                                await handleVerifyCode(code);
                                            }
                                        }}
                                        loading={verifyLoading}
                                        error={verifyError}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        className={`w-full py-4 px-6 rounded-2xl font-semibold text-lg transition-all duration-200 ${
                                            verifyCode.length === 8 && !verifyLoading
                                                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        }`}
                                        onClick={() => handleVerifyCode()}
                                        disabled={verifyLoading || verifyCode.length !== 8}
                                        aria-label={verifyLoading ? '正在验证' : '创建账户'}
                                        aria-busy={verifyLoading}
                                    >
                                        {verifyLoading ? (
                                            <div className="flex items-center justify-center space-x-2">
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" role="status" aria-label="加载中"></div>
                                                <span>验证中...</span>
                                            </div>
                                        ) : '创建账户'}
                                    </button>

                                    <button
                                        type="button"
                                        className={`w-full py-3 px-6 rounded-2xl font-medium transition-all duration-200 ${
                                            verifyResendTimer > 0
                                                ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                        }`}
                                        onClick={handleResendVerifyCode}
                                        disabled={verifyLoading || verifyResendTimer > 0}
                                        aria-label={verifyResendTimer > 0 ? `${verifyResendTimer}秒后可重新发送` : '重新发送验证码'}
                                    >
                                        {verifyResendTimer > 0 ? `重新发送验证码 (${verifyResendTimer}s)` : '重新发送验证码'}
                                    </button>
                                </div>

                                <div className="mt-6 text-center">
                                    <p className="text-sm text-gray-500" role="status">
                                        没有收到验证码？请检查垃圾邮件文件夹
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                                        onClick={() => setShowEmailVerify(false)}
                                        disabled={verifyLoading}
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
