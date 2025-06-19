import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';

interface AuthFormProps {
    onSuccess?: () => void;
}

interface PasswordStrength {
    score: number;
    feedback: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
    const { login, register } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, feedback: '' });

    // 密码复杂度检查
    const checkPasswordStrength = (pwd: string): PasswordStrength => {
        let score = 0;
        let feedback = [];

        // 长度检查
        if (pwd.length < 8) {
            feedback.push('密码长度至少需要8个字符');
        } else if (pwd.length >= 12) {
            score += 2;
        } else {
            score += 1;
        }

        // 包含数字
        if (/\d/.test(pwd)) {
            score += 1;
        } else {
            feedback.push('需要包含数字');
        }

        // 包含小写字母
        if (/[a-z]/.test(pwd)) {
            score += 1;
        } else {
            feedback.push('需要包含小写字母');
        }

        // 包含大写字母
        if (/[A-Z]/.test(pwd)) {
            score += 1;
        } else {
            feedback.push('需要包含大写字母');
        }

        // 包含特殊字符
        if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
            score += 1;
        } else {
            feedback.push('需要包含特殊字符');
        }

        // 防止常见密码模式
        const commonPatterns = [
            /^123/, /password/i, /qwerty/i, /abc/i,
            new RegExp(username, 'i')
        ];
        if (commonPatterns.some(pattern => pattern.test(pwd))) {
            score = 0;
            feedback.push('请避免使用常见密码模式');
        }

        return {
            score,
            feedback: feedback.join('、')
        };
    };

    // 输入验证
    const validateInput = (value: string, type: 'username' | 'email' | 'password'): string | null => {
        // 清理输入
        const sanitizedValue = DOMPurify.sanitize(value).trim();

        switch (type) {
            case 'username':
                // 用户名：3-20个字符，只允许字母、数字、下划线
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitizedValue)) {
                    return '用户名只能包含字母、数字和下划线，长度3-20个字符';
                }
                // 防止SQL注入相关字符
                if (/[';"]/.test(sanitizedValue)) {
                    return '用户名包含非法字符';
                }
                break;
            case 'email':
                // 邮箱格式验证
                if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(sanitizedValue)) {
                    return '请输入有效的邮箱地址';
                }
                break;
            case 'password':
                const strength = checkPasswordStrength(sanitizedValue);
                if (strength.score < 3) {
                    return strength.feedback || '密码强度不足';
                }
                break;
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // 输入验证
        const usernameError = validateInput(username, 'username');
        if (usernameError) {
            setError(usernameError);
            return;
        }

        if (!isLogin) {
            const emailError = validateInput(email, 'email');
            if (emailError) {
                setError(emailError);
                return;
            }
        }

        const passwordError = validateInput(password, 'password');
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (!isLogin && password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        if (!agreed) {
            setError('请阅读并同意服务条款与隐私政策');
            return;
        }

        setLoading(true);

        try {
            // 对输入进行清理
            const sanitizedUsername = DOMPurify.sanitize(username).trim();
            const sanitizedEmail = DOMPurify.sanitize(email).trim();
            const sanitizedPassword = password; // 密码不需要 sanitize，但需要在传输前加密

            if (isLogin) {
                await login(sanitizedUsername, sanitizedPassword);
            } else {
                await register(sanitizedUsername, sanitizedEmail, sanitizedPassword);
            }
            onSuccess?.();
        } catch (err: any) {
            console.error('认证操作失败:', {
                type: isLogin ? '登录' : '注册',
                error: err.message,
            });

            setError(err.message || '操作失败');
        } finally {
            setLoading(false);
        }
    };

    const handleModeSwitch = () => {
        setIsLogin(!isLogin);
        setError(null);
        setPassword('');
        setConfirmPassword('');
    };

    // 实时密码强度检查
    useEffect(() => {
        if (password) {
            const strength = checkPasswordStrength(password);
            setPasswordStrength(strength);
        } else {
            setPasswordStrength({ score: 0, feedback: '' });
        }
    }, [password, username]);

    return (
        <div className="w-full">
            <div className="max-w-md w-full space-y-6 p-6 bg-white rounded-lg shadow-lg">
                <div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">
                        {isLogin ? '登录' : '注册'}
                    </h2>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="username" className="sr-only">用户名</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="用户名 (3-20个字符，只允许字母、数字、下划线)"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                maxLength={20}
                                pattern="^[a-zA-Z0-9_]{3,20}$"
                            />
                        </div>
                        {!isLogin && (
                            <div>
                                <label htmlFor="email" className="sr-only">邮箱</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="邮箱"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        )}
                        <div>
                            <label htmlFor="password" className="sr-only">密码</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="密码 (至少8位，包含大小写字母、数字和特殊字符)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                            />
                        </div>
                        {!isLogin && (
                            <div>
                                <label htmlFor="confirmPassword" className="sr-only">确认密码</label>
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="确认密码"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* 密码强度指示器 */}
                    {password && (
                        <div className="mt-2">
                            <div className="flex justify-between mb-1">
                                <span className="text-sm text-gray-600">密码强度</span>
                                <span className="text-sm text-gray-600">
                                    {passwordStrength.score === 0 && '非常弱'}
                                    {passwordStrength.score === 1 && '弱'}
                                    {passwordStrength.score === 2 && '中等'}
                                    {passwordStrength.score === 3 && '强'}
                                    {passwordStrength.score >= 4 && '非常强'}
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full ${
                                        passwordStrength.score === 0 ? 'bg-red-500' :
                                        passwordStrength.score === 1 ? 'bg-orange-500' :
                                        passwordStrength.score === 2 ? 'bg-yellow-500' :
                                        passwordStrength.score === 3 ? 'bg-green-500' :
                                        'bg-green-600'
                                    }`}
                                    style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                                />
                            </div>
                            {passwordStrength.feedback && (
                                <p className="mt-1 text-sm text-gray-600">{passwordStrength.feedback}</p>
                            )}
                        </div>
                    )}

                    <div className="flex items-center">
                        <input
                            id="agree"
                            name="agree"
                            type="checkbox"
                            checked={agreed}
                            onChange={e => setAgreed(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            required
                        />
                        <label htmlFor="agree" className="ml-2 block text-sm text-gray-700">
                            我已阅读并同意
                            <Link to="/policy" className="text-blue-600 hover:underline ml-1" target="_blank">
                                服务条款与隐私政策
                            </Link>
                        </label>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading || (!isLogin && password !== confirmPassword)}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
                        </button>
                    </div>

                    <div className="text-sm text-center">
                        <button
                            type="button"
                            onClick={handleModeSwitch}
                            className="font-medium text-indigo-600 hover:text-indigo-500"
                        >
                            {isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};