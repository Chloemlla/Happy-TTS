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

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const [isChecking, setIsChecking] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);

    useEffect(() => {
        if (!isChecking && !isAdminChecked) {
            checkAuth();
        }
    }, [isChecking, isAdminChecked]);

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

            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 2000; // 2秒

            while (retryCount < maxRetries) {
                try {
                    const response = await api.get<User>('/api/auth/me', {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    
                    setUser(response.data);
                    
                    // 如果是本地 IP 访问（管理员），只跳转一次
                    if (response.data.role === 'admin' && !isAdminChecked) {
                        setIsAdminChecked(true);
                        if (location.pathname !== '/') {
                            navigate('/', { replace: true });
                        }
                    }
                    break; // 成功获取数据，跳出重试循环
                } catch (error: any) {
                    if (error.response?.status === 429 && retryCount < maxRetries - 1) {
                        // 如果是429错误且还有重试次数，等待后重试
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        retryCount++;
                        continue;
                    }
                    throw error; // 其他错误或重试次数用完，抛出错误
                }
            }
        } catch (error) {
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