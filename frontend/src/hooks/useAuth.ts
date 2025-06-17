import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';

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

            const response = await api.get<User>('/api/auth/me', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            
            if (response.data) {
                setUser(response.data);
                
                // 如果是本地 IP 访问（管理员），只跳转一次
                if (response.data.role === 'admin' && !isAdminChecked) {
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
            // 只有在非429错误时才清除用户状态
            if (error.response?.status !== 429) {
                setUser(null);
                localStorage.removeItem('token');
            }
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

            // 登录成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error: any) {
            if (error.response?.data?.error) {
                throw new Error(error.response.data.error);
            }
            throw new Error('登录失败，请稍后重试');
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

            // 注册成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error: any) {
            if (error.response?.data?.error) {
                throw new Error(error.response.data.error);
            }
            throw new Error('注册失败，请稍后重试');
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setIsAdminChecked(false);
        window.location.href = '/welcome';
    };

    return {
        user,
        loading,
        login,
        register,
        logout
    };
}; 