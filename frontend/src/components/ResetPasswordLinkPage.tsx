import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useNotification } from './Notification';
import { FaVolumeUp, FaLock, FaEye, FaEyeSlash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint } from '../utils/fingerprint';
import DOMPurify from 'dompurify';

export const ResetPasswordLinkPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [token, setToken] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const validateToken = async () => {
            const tokenParam = searchParams.get('token');

            if (!tokenParam) {
                setError('重置链接无效：缺少令牌');
                setTokenValid(false);
                setVerifying(false);
                return;
            }

            setToken(tokenParam);
            // 简单验证token格式存在即可，实际验证在提交时进行
            setTokenValid(true);
            setVerifying(false);
        };

        validateToken();
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!token) {
            setError('无效的重置令牌');
            return;
        }

        const sanitizedPassword = DOMPurify.sanitize(newPassword).trim();
        const sanitizedConfirmPassword = DOMPurify.sanitize(confirmPassword).trim();

        if (!sanitizedPassword || !sanitizedConfirmPassword) {
            setError('请填写所有字段');
            return;
        }

        if (sanitizedPassword !== sanitizedConfirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        if (sanitizedPassword.length < 6) {
            setError('密码长度至少为6位');
            return;
        }

        setLoading(true);

        try {
            // 获取设备指纹
            const fingerprint = await getFingerprint();
            if (!fingerprint) {
                setError('无法获取设备信息，请刷新页面重试');
                setLoading(false);
                return;
            }

            const response = await fetch(getApiBaseUrl() + '/api/auth/reset-password-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token,
                    fingerprint,
                    newPassword: sanitizedPassword
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccess(true);
                setNotification({ message: data.message || '密码重置成功！', type: 'success' });
                // 3秒后跳转到登录页面
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            } else {
                setError(data.error || '密码重置失败，请重试');
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
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="mb-8 text-center animate-slideInUp">
                    <div className="mb-4 inline-flex items-center gap-3">
                        <FaVolumeUp className="h-10 w-10 text-[#219EBC]" />
                        <h1 className="text-3xl font-bold text-[#023047]">Happy TTS</h1>
                    </div>
                    <p className="text-[#023047]/70">重置密码</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-[#8ECAE6]/30 px-8 py-8 hover:shadow-2xl transition-all duration-300">
                    {verifying ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 border-4 border-[#219EBC] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-[#023047] mb-2">验证中...</h3>
                            <p className="text-[#023047]/70">正在验证重置链接</p>
                        </div>
                    ) : !tokenValid ? (
                        <div className="text-center py-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FaTimesCircle className="text-red-600 text-5xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-[#023047] mb-4">链接无效</h3>
                            <p className="text-[#023047]/70 mb-6">{error}</p>

                            <div className="space-y-3">
                                <Link
                                    to="/forgot-password"
                                    className="block w-full py-3 px-4 text-center border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    重新获取重置链接
                                </Link>
                                <Link
                                    to="/login"
                                    className="block w-full py-3 px-4 text-center border border-[#8ECAE6]/30 rounded-lg text-sm font-semibold text-[#023047]/70 bg-white hover:bg-[#8ECAE6]/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#219EBC] transition-all duration-200"
                                >
                                    返回登录
                                </Link>
                            </div>
                        </div>
                    ) : success ? (
                        <div className="text-center py-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-[#8ECAE6]/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FaCheckCircle className="text-green-600 text-5xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-[#023047] mb-4">密码重置成功！</h3>
                            <p className="text-[#023047]/70 mb-6">您的密码已成功重置</p>

                            <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded-r-lg text-left">
                                <div className="flex items-start">
                                    <svg className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <div className="text-sm text-green-800">
                                        <p className="font-semibold mb-1">下一步</p>
                                        <p>即将自动跳转到登录页面，请使用新密码登录</p>
                                    </div>
                                </div>
                            </div>

                            <Link
                                to="/login"
                                className="inline-block w-full py-3 px-4 text-center border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                            >
                                立即登录
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-bold text-[#023047] mb-2">设置新密码</h2>
                                <p className="text-sm text-[#023047]/70">
                                    请输入您的新密码
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
                                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                        新密码
                                    </label>
                                    <div className="relative">
                                        <FaLock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="newPassword"
                                            name="newPassword"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            minLength={6}
                                            aria-label="新密码"
                                            aria-required="true"
                                            className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="请输入新密码（至少6位）"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? <FaEyeSlash className="h-5 w-5" /> : <FaEye className="h-5 w-5" />}
                                        </button>
                                    </div>
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
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            required
                                            minLength={6}
                                            aria-label="确认密码"
                                            aria-required="true"
                                            className="block w-full pl-10 pr-10 py-3 border border-[#8ECAE6]/30 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#219EBC] focus:border-[#219EBC] transition-all"
                                            placeholder="请再次输入新密码"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showConfirmPassword ? <FaEyeSlash className="h-5 w-5" /> : <FaEye className="h-5 w-5" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    aria-label={loading ? '重置中...' : '重置密码'}
                                    aria-busy={loading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-[#023047] bg-[#FFB703] hover:bg-[#FB8500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFB703] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    {loading ? (
                                        <div className="flex items-center space-x-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            <span>重置中...</span>
                                        </div>
                                    ) : '重置密码'}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <Link to="/login" className="text-sm text-[#FFB703] hover:text-[#FB8500] font-medium">
                                    返回登录
                                </Link>
                            </div>
                        </>
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="text-sm text-[#023047]/70 hover:text-[#023047] transition-colors">
                        返回首页
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordLinkPage;
