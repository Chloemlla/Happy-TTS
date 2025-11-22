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
                        登录 Synapse
                    </h2>
                    <p className="text-sm text-gray-600">
                        输入您的账户信息
                    </p>
                </div>

                {/* Form */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 px-8 py-8">
                    <form className="space-y-4" onSubmit={handleSubmit}>
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
                                用户名或邮箱
                            </label>
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
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="请输入用户名或邮箱"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                                    密码
                                </label>
                                <Link 
                                    to="/forgot-password" 
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                    aria-label="忘记密码"
                                >
                                    忘记密码？
                                </Link>
                            </div>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                enterKeyHint="done"
                                aria-label="密码"
                                aria-required="true"
                                aria-invalid={!!error}
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="请输入密码"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                aria-label="记住我的用户名"
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                                记住我
                            </label>
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
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? '登录中...' : '登录'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center">
                    <p className="text-sm text-gray-600">
                        还没有账号？{' '}
                        <Link 
                            to="/register" 
                            className="font-medium text-blue-600 hover:text-blue-800"
                        >
                            创建账号
                        </Link>
                    </p>
                </div>

                {/* Terms */}
                <div className="text-center">
                    <p className="text-xs text-gray-500">
                        登录即表示您同意我们的{' '}
                        <Link to="/policy" className="text-blue-600 hover:underline" target="_blank">
                            服务条款
                        </Link>
                        {' '}和{' '}
                        <Link to="/policy" className="text-blue-600 hover:underline" target="_blank">
                            隐私政策
                        </Link>
                    </p>
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
