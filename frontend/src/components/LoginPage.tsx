import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { usePasskey } from '../hooks/usePasskey';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import PasskeyVerifyModal from './PasskeyVerifyModal';
import TOTPVerification from './TOTPVerification';
import VerificationMethodSelector from './VerificationMethodSelector';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaFingerprint, FaVolumeUp, FaArrowLeft } from 'react-icons/fa';

export const LoginPage: React.FC = () => {
    const { login, pending2FA, setPending2FA } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });
    const { authenticateWithPasskey } = usePasskey();

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

    // 加载保存的用户名
    useEffect(() => {
        const savedUsername = localStorage.getItem('rememberedUsername');
        if (savedUsername) {
            setUsername(savedUsername);
            setRememberMe(true);
        }
    }, []);

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

        const sanitizedUsername = DOMPurify.sanitize(username).trim();

        if (!sanitizedUsername || !password) {
            setError('请输入用户名和密码');
            return;
        }

        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('请先完成人机验证');
            setNotification({ message: '请先完成人机验证', type: 'warning' });
            return;
        }

        setLoading(true);

        try {
            // 保存或清除记住的用户名
            if (rememberMe) {
                localStorage.setItem('rememberedUsername', sanitizedUsername);
            } else {
                localStorage.removeItem('rememberedUsername');
            }

            const result = await login(sanitizedUsername, password, turnstileConfig.siteKey ? turnstileToken : undefined);

            if (result && result.requires2FA && result.twoFactorType) {
                setNotification({ message: '需要二次验证，请选择验证方式', type: 'info' });
                setPendingToken(result.token);

                const verificationTypes = result.twoFactorType;

                if (!verificationTypes || verificationTypes.length === 0) {
                    setNotification({ message: '未启用任何二次验证方式，请联系管理员', type: 'error' });
                    setLoading(false);
                    return;
                }

                const hasPasskey = verificationTypes.includes('Passkey');
                const hasTOTP = verificationTypes.includes('TOTP');

                if (hasPasskey && hasTOTP) {
                    setPendingVerificationData({
                        user: result.user,
                        userId: result.user.id,
                        token: result.token,
                        username: sanitizedUsername,
                        twoFactorType: result.twoFactorType
                    });
                    setShowVerificationSelector(true);
                } else if (hasPasskey) {
                    setPending2FA({ userId: result.user.id, username: sanitizedUsername, type: ['Passkey'] });
                    setShowPasskeyVerification(true);
                } else if (hasTOTP) {
                    setPending2FA({ userId: result.user.id, username: sanitizedUsername, type: ['TOTP'] });
                    setShowTOTPVerification(true);
                }
                return;
            }

            setNotification({ message: '登录成功', type: 'success' });
            window.location.reload();
        } catch (err: any) {
            setError(err.message || '登录失败');
            setNotification({ message: err.message || '登录失败', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleVerificationMethodSelect = async (method: 'passkey' | 'totp') => {
        setShowVerificationSelector(false);
        setLoading(true);

        try {
            if (method === 'passkey') {
                const success = await authenticateWithPasskey(pendingVerificationData.username);
                if (success) {
                    setPendingVerificationData(null);
                    window.location.reload();
                } else {
                    setError('Passkey 验证失败');
                    setNotification({ message: 'Passkey 验证失败', type: 'error' });
                }
            } else if (method === 'totp') {
                setPending2FA({
                    userId: pendingVerificationData.userId,
                    username: pendingVerificationData.username,
                    type: ['TOTP']
                });
                setShowTOTPVerification(true);
                setNotification({ message: '请进行 TOTP 验证', type: 'info' });
            }
        } catch (e: any) {
            setError(e.message || '验证失败');
        } finally {
            setLoading(false);
        }
    };

    const handleVerificationSelectorClose = () => {
        setShowVerificationSelector(false);
        setPendingVerificationData(null);
        setPending2FA(null);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-6 animate-gradient py-8 rounded-3xl">
            <div className="w-full max-w-md animate-scaleIn">
                {/* Header */}
                <div className="mb-8 text-center animate-slideInUp">
                    <div className="mb-4 inline-flex items-center gap-3">
                        <FaVolumeUp className="h-10 w-10 text-blue-600" />
                        <h1 className="text-3xl font-bold text-blue-600">Synapse</h1>
                    </div>
                    <p className="text-gray-600">Welcome back!</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-8 hover:shadow-2xl transition-all duration-300">
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
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                                Email or username
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    inputMode="text"
                                    enterKeyHint="next"
                                    aria-label="用户名或邮箱"
                                    aria-required="true"
                                    aria-invalid={!!error}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    placeholder="you@example.com"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Password
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    aria-label="忘记密码"
                                >
                                    Forgot?
                                </Link>
                            </div>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    enterKeyHint="done"
                                    aria-label="密码"
                                    aria-required="true"
                                    aria-invalid={!!error}
                                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
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

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="remember-me"
                                    name="remember-me"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    aria-label="Remember my username"
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                                    Remember me
                                </label>
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

                        <button
                            type="submit"
                            disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)}
                            aria-label={loading ? '正在登录' : '登录'}
                            aria-busy={loading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                            {loading ? '登录中...' : 'Login'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-white px-4 text-gray-500">Or continue with</span>
                        </div>
                    </div>

                    {/* Passkey Login */}
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const success = await authenticateWithPasskey(username);
                                if (success) {
                                    setNotification({ message: 'Passkey登录成功', type: 'success' });
                                    window.location.reload();
                                }
                            } catch (err: any) {
                                setNotification({ message: err.message || 'Passkey登录失败', type: 'error' });
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                        aria-label="使用Passkey登录"
                    >
                        <FaFingerprint className="h-5 w-5" />
                        Sign in with Passkey
                    </button>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            Don't have an account? <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700">Sign Up</Link>
                        </p>
                    </div>
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors" aria-label="返回首页">
                        <FaArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </div>

            {/* Verification Modals */}
            <PasskeyVerifyModal
                open={showPasskeyVerification || false}
                username={username}
                onSuccess={() => {
                    setShowPasskeyVerification(false);
                    setPending2FA(null);
                    setPendingVerificationData(null);
                    window.location.reload();
                }}
                onClose={() => {
                    setShowPasskeyVerification(false);
                    setPending2FA(null);
                    setPendingVerificationData(null);
                }}
            />

            {showTOTPVerification && (
                <TOTPVerification
                    isOpen={showTOTPVerification}
                    onClose={() => {
                        setShowTOTPVerification(false);
                        setPending2FA(null);
                        setPendingVerificationData(null);
                    }}
                    onSuccess={() => {
                        setShowTOTPVerification(false);
                        setPending2FA(null);
                        setPendingVerificationData(null);
                        window.location.reload();
                    }}
                    userId={pending2FA?.userId || ''}
                    token={pendingToken || ''}
                />
            )}

            {showVerificationSelector && pendingVerificationData && (
                <VerificationMethodSelector
                    isOpen={showVerificationSelector}
                    onClose={handleVerificationSelectorClose}
                    onSelectMethod={handleVerificationMethodSelect}
                    username={pendingVerificationData.username}
                    loading={loading}
                    availableMethods={pendingVerificationData.twoFactorType?.map((type: string) =>
                        type === 'Passkey' ? 'passkey' : type === 'TOTP' ? 'totp' : null
                    ).filter(Boolean) as ('passkey' | 'totp')[] || []}
                />
            )}
        </div>
    );
};
