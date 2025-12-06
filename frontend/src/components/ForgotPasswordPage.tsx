import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useNotification } from './Notification';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { FaEnvelope, FaArrowLeft, FaVolumeUp } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { getFingerprint, getClientIP } from '../utils/fingerprint';

export const ForgotPasswordPage: React.FC = () => {
    const { setNotification } = useNotification();
    const navigate = useNavigate();
    const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig({ usePublicConfig: true });

    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string>('');
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileError, setTurnstileError] = useState(false);
    const [turnstileKey, setTurnstileKey] = useState(0);

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
            setError('Please enter your email address');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        if (turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
            setError('Please complete human verification first');
            setNotification({ message: 'Please complete human verification first', type: 'warning' });
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
            setError('Network error, please try again');
            setNotification({ message: 'Network error, please try again', type: 'error' });
        } finally {
            setLoading(false);
        }
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
                    <p className="text-gray-600">Forgot Your Password?</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-8 hover:shadow-2xl transition-all duration-300">
                    {success ? (
                        <div className="py-6">
                            <div className="text-center mb-6">
                                <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-3">Reset Link Sent!</h3>
                                <p className="text-gray-600 mb-2">We've sent a password reset link to</p>
                                <p className="font-semibold text-blue-600">{email}</p>
                            </div>

                            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg">
                                <div className="flex items-start">
                                    <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                    <div className="text-sm text-blue-800">
                                        <p className="font-semibold mb-2">Next Steps:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Check your email inbox</li>
                                            <li>Find the email from Synapse</li>
                                            <li>Click the "Reset Password" button</li>
                                            <li>Use the <strong>same device and network</strong> to open the link</li>
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
                                        <p className="font-semibold mb-1">Important Notice</p>
                                        <p>The reset link is valid for <strong>10 minutes</strong></p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-gray-500 text-center mb-4">
                                Didn't receive the email? Check your spam folder
                            </p>
                            
                            <Link 
                                to="/login" 
                                className="block w-full py-3 px-4 text-center border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                            >
                                Back to Login
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Reset Password</h2>
                                <p className="text-sm text-gray-600">
                                    Enter your email address and we'll send you a reset link
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
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <FaEnvelope className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            required
                                            inputMode="email"
                                            enterKeyHint="send"
                                            aria-label="Email address"
                                            aria-required="true"
                                            aria-invalid={!!error}
                                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                        />
                                    </div>
                                </div>

                                {!turnstileConfigLoading && turnstileConfig.siteKey && (
                                    <div role="group" aria-label="Human verification">
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
                                                Verification passed
                                            </p>
                                        )}
                                        {turnstileError && (
                                            <p className="mt-2 text-xs text-red-600" role="alert" aria-live="assertive">
                                                Verification failed, please try again
                                            </p>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || (!!turnstileConfig.siteKey && !turnstileVerified)}
                                    aria-label={loading ? 'Sending...' : 'Send reset link'}
                                    aria-busy={loading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    {loading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </form>

                            <div className="mt-6 text-center space-y-3">
                                <Link to="/login" className="block text-sm text-blue-600 hover:text-blue-700 font-medium">
                                    Back to Login
                                </Link>
                                <p className="text-sm text-gray-600">
                                    Don't have an account? <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700">Sign Up</Link>
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-6 text-center">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors" aria-label="Back to home">
                        <FaArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;