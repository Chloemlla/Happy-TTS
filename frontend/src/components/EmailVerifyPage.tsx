import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useNotification } from './Notification';
import { FaVolumeUp, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint } from '../utils/fingerprint';

export const EmailVerifyPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const verifyEmail = async () => {
            const token = searchParams.get('token');

            if (!token) {
                setError('验证链接无效：缺少验证令牌');
                setLoading(false);
                return;
            }

            try {
                // 获取设备指纹
                const fingerprint = await getFingerprint();
                if (!fingerprint) {
                    setError('无法获取设备信息，请刷新页面重试');
                    setLoading(false);
                    return;
                }

                const response = await fetch(getApiBaseUrl() + '/api/auth/verify-email-link', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token,
                        fingerprint
                    }),
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    setSuccess(true);
                    setNotification({ message: data.message || '邮箱验证成功！', type: 'success' });
                    // 3秒后跳转到登录页面
                    setTimeout(() => {
                        navigate('/login');
                    }, 3000);
                } else {
                    setError(data.error || '验证失败，请重试');
                    setNotification({ message: data.error || '验证失败', type: 'error' });
                }
            } catch (err: any) {
                setError('网络错误，请稍后重试');
                setNotification({ message: '网络错误，请稍后重试', type: 'error' });
            } finally {
                setLoading(false);
            }
        };

        verifyEmail();
    }, [searchParams, navigate, setNotification]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-6 animate-gradient py-8 rounded-3xl">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="mb-8 text-center animate-slideInUp">
                    <div className="mb-4 inline-flex items-center gap-3">
                        <FaVolumeUp className="h-10 w-10 text-blue-600" />
                        <h1 className="text-3xl font-bold text-blue-600">Synapse</h1>
                    </div>
                    <p className="text-gray-600">邮箱验证</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-12 hover:shadow-2xl transition-all duration-300">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">验证中...</h3>
                            <p className="text-gray-600">请稍候，正在验证您的邮箱</p>
                        </div>
                    ) : success ? (
                        <div className="text-center py-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FaCheckCircle className="text-green-600 text-5xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">验证成功！</h3>
                            <p className="text-gray-600 mb-6">您的邮箱已成功验证，账户创建完成</p>

                            <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded-r-lg text-left">
                                <div className="flex items-start">
                                    <svg className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <div className="text-sm text-green-800">
                                        <p className="font-semibold mb-1">下一步</p>
                                        <p>即将自动跳转到登录页面，请使用您的账号登录</p>
                                    </div>
                                </div>
                            </div>

                            <Link
                                to="/login"
                                className="inline-block w-full py-3 px-4 text-center border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                            >
                                立即登录
                            </Link>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FaTimesCircle className="text-red-600 text-5xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">验证失败</h3>
                            <p className="text-gray-600 mb-6">{error}</p>

                            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg text-left">
                                <div className="flex items-start">
                                    <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <div className="text-sm text-red-800">
                                        <p className="font-semibold mb-2">可能的原因：</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>验证链接已过期（10分钟有效期）</li>
                                            <li>验证链接已被使用</li>
                                            <li>使用了不同的设备或网络</li>
                                            <li>链接无效或已损坏</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Link
                                    to="/register"
                                    className="block w-full py-3 px-4 text-center border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    重新注册
                                </Link>
                                <Link
                                    to="/login"
                                    className="block w-full py-3 px-4 text-center border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                                >
                                    返回登录
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                        返回首页
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default EmailVerifyPage;
