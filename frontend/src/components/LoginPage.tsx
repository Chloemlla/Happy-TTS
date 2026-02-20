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
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaFingerprint, FaVolumeUp, FaArrowLeft, FaQuestionCircle, FaChevronDown, FaChevronUp, FaShieldAlt, FaBolt, FaMobileAlt } from 'react-icons/fa';

export const LoginPage: React.FC = () => {
    const { login, pending2FA, setPending2FA } = useAuth();
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });
    const { authenticateWithPasskey, authenticateWithDiscoverablePasskey } = usePasskey();

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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-12 px-6 animate-gradient py-8 rounded-3xl">
            <div className="w-full max-w-md animate-scaleIn">
                {/* Header */}
                <div className="mb-8 text-center animate-slideInUp">
                    <div className="mb-4 inline-flex items-center gap-3">
                        <FaVolumeUp className="h-10 w-10 text-[#219EBC]" />
                        <h1 className="text-3xl font-bold text-[#023047]">Happy TTS</h1>
                    </div>
                    <p className="text-[#023047]/70">Welcome back!</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-[#8ECAE6]/30 px-8 py-8 hover:shadow-2xl transition-all duration-300">
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
                                邮箱或用户名
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
                                    className="block w-full pl-10 pr-3 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                    placeholder="请输入邮箱或用户名"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    密码
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="text-sm text-[#FFB703] hover:text-[#FB8500] font-medium"
                                    aria-label="忘记密码"
                                >
                                    忘记密码？
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
                                    className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
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
                                    className="h-4 w-4 text-[#FFB703] focus:ring-[#219EBC] border-[#8ECAE6]/30 rounded"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                                    记住我
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
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                            {loading ? '登录中...' : '登录'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-white px-4 text-gray-500">或者使用以下方式</span>
                        </div>
                    </div>

                    {/* Passkey Login Section */}
                    <div className="space-y-4">
                        {/* Passkey Introduction */}
                        <div className="bg-[#8ECAE6]/10 rounded-lg p-4 border border-[#8ECAE6]/30">
                            <div className="flex items-start gap-3">
                                <FaFingerprint className="h-6 w-6 text-[#219EBC] flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h3 className="text-sm font-semibold text-[#023047] mb-1">
                                        通行密钥 - 无密码认证
                                    </h3>
                                    <p className="text-xs text-[#023047]/70 mb-3">
                                        使用生物识别或设备认证，更安全便捷的登录方式
                                    </p>
                                    
                                    {/* Benefits */}
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        <div className="flex flex-col items-center text-center p-2 bg-white rounded-md">
                                            <FaShieldAlt className="h-4 w-4 text-green-600 mb-1" />
                                            <span className="text-xs font-medium text-[#023047]">安全</span>
                                            <span className="text-[10px] text-[#023047]/50">防钓鱼</span>
                                        </div>
                                        <div className="flex flex-col items-center text-center p-2 bg-white rounded-md">
                                            <FaBolt className="h-4 w-4 text-[#FFB703] mb-1" />
                                            <span className="text-xs font-medium text-[#023047]">快速</span>
                                            <span className="text-[10px] text-[#023047]/50">一键登录</span>
                                        </div>
                                        <div className="flex flex-col items-center text-center p-2 bg-white rounded-md">
                                            <FaMobileAlt className="h-4 w-4 text-[#219EBC] mb-1" />
                                            <span className="text-xs font-medium text-[#023047]">简单</span>
                                            <span className="text-[10px] text-[#023047]/50">无需密码</span>
                                        </div>
                                    </div>

                                    {/* Toggle Help Button */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPasskeyHelp(!showPasskeyHelp)}
                                        className="flex items-center gap-2 text-xs text-[#219EBC] hover:text-[#023047] font-medium transition-colors"
                                    >
                                        <FaQuestionCircle className="h-3.5 w-3.5" />
                                        <span>{showPasskeyHelp ? '隐藏' : '显示'}详细指南</span>
                                        {showPasskeyHelp ? <FaChevronUp className="h-3 w-3" /> : <FaChevronDown className="h-3 w-3" />}
                                    </button>
                                </div>
                            </div>

                            {/* Collapsible Help Content */}
                            {showPasskeyHelp && (
                                <div className="mt-4 pt-4 border-t border-[#8ECAE6]/30 animate-slideInUp">
                                    <div className="space-y-3">
                                        {/* How to Use */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-[#023047] mb-2 flex items-center gap-2">
                                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#219EBC] text-white text-[10px]">1</span>
如何使用通行密钥
                                            </h4>
                                            <ul className="space-y-1.5 text-xs text-[#023047]/70 ml-7">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>点击下方“使用通行密钥登录”按钮</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>浏览器将提示您进行认证</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>使用指纹、面部识别或设备PIN码</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>验证后将自动登录</span>
                                                </li>
                                            </ul>
                                        </div>

                                        {/* Requirements */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-[#023047] mb-2 flex items-center gap-2">
                                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#219EBC] text-white text-[10px]">2</span>
前置要求
                                            </h4>
                                            <ul className="space-y-1.5 text-xs text-[#023047]/70 ml-7">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>您必须已为账户注册了通行密钥</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>您的设备必须支持生物认证或安全密钥</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span>使用现代浏览器（Chrome、Edge、Safari、Firefox）</span>
                                                </li>
                                            </ul>
                                        </div>

                                        {/* Troubleshooting */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-[#023047] mb-2 flex items-center gap-2">
                                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#219EBC] text-white text-[10px]">3</span>
问题排查
                                            </h4>
                                            <ul className="space-y-1.5 text-xs text-[#023047]/70 ml-7">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span><strong>没有通行密钥提示？</strong> 您的浏览器可能不支持或您尚未注册</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span><strong>认证失败？</strong> 尝试使用传统的用户名/密码登录</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-[#219EBC] mt-0.5">•</span>
                                                    <span><strong>首次使用？</strong> 请先注册账户，然后在设置中添加通行密钥</span>
                                                </li>
                                            </ul>
                                        </div>

                                        {/* Security Note */}
                                        <div className="bg-green-50 border border-green-200 rounded-md p-3">
                                            <div className="flex items-start gap-2">
                                                <FaShieldAlt className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-medium text-green-900 mb-1">为什么通行密钥更安全</p>
                                                    <p className="text-xs text-green-700">
                                                        通行密钥使用公钥加密，可以抵御钓鱼、凭据填充和其他常见攻击。您的生物特征数据从不离开您的设备。
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Passkey Login Button */}
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    // 使用 Discoverable Credentials - 无需输入用户名
                                    const success = await authenticateWithDiscoverablePasskey();
                                    if (success) {
                                        setNotification({ message: '通行密钥登录成功！', type: 'success' });
                                        // window.location.reload(); // 已在 authenticateWithDiscoverablePasskey 中处理
                                    }
                                } catch (err: any) {
                                    setNotification({ 
                                        message: err.message || '通行密钥登录失败。请尝试传统登录或检查是否已注册通行密钥。', 
                                        type: 'error' 
                                    });
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border-2 border-[#8ECAE6]/30 rounded-lg text-sm font-semibold text-[#023047] bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#219EBC] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                            aria-label="Sign in with Passkey - Passwordless authentication using biometrics, no username required"
                        >
                            <FaFingerprint className="h-6 w-6" />
                            <span className="flex flex-col items-start">
                                <span className="text-base">使用通行密钥登录</span>
                                <span className="text-xs font-normal text-[#219EBC]">快速、安全、无密码</span>
                            </span>
                        </button>

                        {/* Additional Tips */}
                        <p className="text-xs text-center text-[#023047]/50 px-4">
                            💡 提示：设置后，通行密钥登录比密码更快更安全
                        </p>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-[#023047]/70">
                            还没有账户？<Link to="/register" className="font-medium text-[#FFB703] hover:text-[#FB8500]">立即注册</Link>
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
