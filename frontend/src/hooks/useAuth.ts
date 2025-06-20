import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import { fetchWithFallback } from '../utils/fetchWithFallback';

// 配置axios默认值
axios.defaults.withCredentials = true;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// 创建axios实例
const api = axios.create({
    baseURL: 'https://tts-api.hapxs.com',  // 直接连接到后端服务
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// 添加请求拦截器
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 429) {
            // 如果是429错误，等待一段时间后重试
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(api(error.config));
                }, 2000); // 等待2秒后重试
            });
        }
        return Promise.reject(error);
    }
);

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const [isChecking, setIsChecking] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useState(0);
    const CHECK_INTERVAL = 30000; // 30秒检查一次

    useEffect(() => {
        if (!isChecking && !isAdminChecked) {
            const now = Date.now();
            if (now - lastCheckTime >= CHECK_INTERVAL) {
                checkAuth();
                setLastCheckTime(now);
            }
        }
    }, [isChecking, isAdminChecked, lastCheckTime]);

    const checkAuth = async () => {
        if (isChecking) return;
        try {
            setIsChecking(true);
            const token = localStorage.getItem('token');
            if (!token) {
                setUser(null);
                setLoading(false);
                return;
            }
            // 用 fetchWithFallback 兼容 dev
            const res = await fetchWithFallback('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'include'
            });
            if (res.status === 401 || res.status === 403) {
                // token 过期或无效
                logout();
                return;
            }
            const data = await res.json();
            if (data) {
                setUser(data);
                if (data.role === 'admin' && !isAdminChecked) {
                    setIsAdminChecked(true);
                    if (location.pathname !== '/') {
                        navigate('/', { replace: true });
                    }
                }
            } else {
                setUser(null);
                localStorage.removeItem('token');
            }
        } catch (error: any) {
            setUser(null);
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
            setIsChecking(false);
        }
    };

    const login = async (username: string, password: string) => {
        try {
            const res = await fetchWithFallback('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: username, password }),
                credentials: 'include'
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || '登录失败');
            }
            const { user, token } = await res.json();
            localStorage.setItem('token', token);
            setUser(user);
            window.location.href = '/';
        } catch (error: any) {
            throw new Error(error.message || '登录失败，请检查网络或稍后重试');
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            const res = await fetchWithFallback('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
                credentials: 'include'
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || '注册失败');
            }
            const { user, token } = await res.json();
            localStorage.setItem('token', token);
            setUser(user);
            window.location.href = '/';
        } catch (error: any) {
            throw new Error(error.message || '注册失败，请检查网络或稍后重试');
        }
    };

    const logout = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            await fetchWithFallback('/api/auth/logout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'include'
            });
        }
        localStorage.removeItem('token');
        setUser(null);
        setIsAdminChecked(false);
        navigate('/welcome');
    };

    return {
        user,
        loading,
        login,
        register,
        logout
    };
}; 