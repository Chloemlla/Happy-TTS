import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setUser(null);
                setLoading(false);
                return;
            }

            const response = await axios.get<User>('/api/auth/me', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            
            setUser(response.data);
            
            // 如果是本地 IP 访问（管理员），直接跳转到主页并阻止后续请求
            if (response.data.role === 'admin') {
                navigate('/', { replace: true });
                return;
            }

            // 如果是普通用户，并且是从欢迎页面来的，跳转到主页
            const from = location.state?.from;
            if (from === '/welcome') {
                navigate('/', { replace: true });
            }
        } catch (error) {
            setUser(null);
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
        }
    };

    const login = async (username: string, password: string) => {
        try {
            console.log('开始登录尝试:', {
                username,
                timestamp: new Date().toISOString()
            });

            const response = await axios.post<{ user: User; token: string }>('/api/auth/login', {
                username,
                password
            });

            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);

            console.log('登录成功:', {
                username: user.username,
                userId: user.id,
                email: user.email,
                role: user.role,
                timestamp: new Date().toISOString()
            });

            // 如果是管理员，直接跳转到主页
            if (user.role === 'admin') {
                navigate('/', { replace: true });
                return;
            }

            // 普通用户登录成功后跳转到主页
            navigate('/', { replace: true });
        } catch (error) {
            console.error('登录失败:', {
                username,
                error: error instanceof Error ? error.message : '未知错误',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            console.log('开始注册尝试:', {
                username,
                email,
                timestamp: new Date().toISOString()
            });

            const response = await axios.post<{ user: User; token: string }>('/api/auth/register', {
                username,
                email,
                password
            });

            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);

            console.log('注册成功:', {
                username: user.username,
                userId: user.id,
                email: user.email,
                timestamp: new Date().toISOString()
            });

            // 注册成功后跳转到主页
            navigate('/', { replace: true });
        } catch (error) {
            console.error('注册失败:', {
                username,
                email,
                error: error instanceof Error ? error.message : '未知错误',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        // 退出后跳转到欢迎页
        navigate('/welcome', { replace: true });
    };

    return {
        user,
        loading,
        login,
        register,
        logout
    };
}; 