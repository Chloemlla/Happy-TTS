import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';

// 配置axios默认值
axios.defaults.withCredentials = true;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// 获取API基础URL
const getApiBaseUrl = () => {
    // 优先使用环境变量
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    // 回退到生产环境URL
    return 'https://tts-api.hapxs.com';
};

// 创建axios实例
const api = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 1000 // 1秒超时
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
            const response = await api.get<User>('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.status === 401 || response.status === 403) {
                logout();
                return;
            }
            const data = response.data;
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
            const response = await api.post<{ user: User; token: string }>('/api/auth/login', {
                identifier: username,
                password
            });
            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);
            window.location.href = '/';
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '登录失败，请检查网络或稍后重试';
            throw new Error(msg);
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            const response = await api.post<{ user: User; token: string }>('/api/auth/register', {
                username,
                email,
                password
            });
            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);
            window.location.href = '/';
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '注册失败，请检查网络或稍后重试';
            throw new Error(msg);
        }
    };

    const logout = async () => {
        try {
            const token = localStorage.getItem('token');
            console.log('开始登出流程，token存在:', !!token);
            
            if (token) {
                const response = await api.post('/api/auth/logout', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('登出请求成功:', response.status, response.data);
            } else {
                console.log('没有找到token，直接清理本地状态');
            }
        } catch (error: any) {
            console.error('登出请求失败:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                url: error.config?.url,
                baseURL: api.defaults.baseURL
            });
            // 即使后端请求失败，也要清理本地状态
        } finally {
            console.log('清理本地状态');
            localStorage.removeItem('token');
            setUser(null);
            setIsAdminChecked(false);
            navigate('/welcome');
        }
    };

    return {
        user,
        loading,
        login,
        register,
        logout
    };
}; 