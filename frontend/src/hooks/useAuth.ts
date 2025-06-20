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
            console.log('开始检查用户认证状态');
            setIsChecking(true);
            const token = localStorage.getItem('token');
            console.log('从localStorage获取token:', token ? '存在' : '不存在');
            
            if (!token) {
                console.log('没有token，设置用户为null');
                setUser(null);
                setLoading(false);
                return;
            }

            console.log('发送认证检查请求到 /api/auth/me');
            const response = await api.get<User>('/api/auth/me', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            
            console.log('认证检查响应:', response.data);
            
            if (response.data) {
                console.log('设置用户信息:', response.data);
                setUser(response.data);
                
                // 如果是本地 IP 访问（管理员），只跳转一次
                if (response.data.role === 'admin' && !isAdminChecked) {
                    console.log('检测到管理员用户，准备跳转');
                    setIsAdminChecked(true);
                    if (location.pathname !== '/') {
                        console.log('跳转到首页');
                        navigate('/', { replace: true });
                    }
                }
            } else {
                console.log('响应数据为空，清除用户状态');
                setUser(null);
                localStorage.removeItem('token');
            }
        } catch (error: any) {
            console.error('认证检查失败:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            // 只有在非429错误时才清除用户状态
            if (error.response?.status !== 429) {
                console.log('清除用户状态和token');
                setUser(null);
                localStorage.removeItem('token');
            }
        } finally {
            console.log('认证检查完成，设置loading为false');
            setLoading(false);
            setIsChecking(false);
        }
    };

    const login = async (username: string, password: string) => {
        try {
            console.log('开始登录流程，用户名:', username);
            console.log('发送登录请求到 /api/auth/login');
            
            const response = await api.post<{ user: User; token: string }>('/api/auth/login', {
                identifier: username,
                password
            });

            console.log('登录请求成功，响应:', response.data);
            
            const { user, token } = response.data;
            console.log('保存token到localStorage');
            localStorage.setItem('token', token);
            console.log('设置用户状态:', user);
            setUser(user);

            console.log('登录成功，准备跳转到首页');
            // 登录成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error: any) {
            // 记录详细的错误日志
            console.error('登录API调用失败:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                config: error.config,
            });

            if (error.response?.data?.error) {
                throw new Error(error.response.data.error);
            }
            throw new Error('登录失败，请检查网络或稍后重试');
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            console.log('开始注册流程，用户名:', username, '邮箱:', email);
            console.log('发送注册请求到 /api/auth/register');
            
            const response = await api.post<{ user: User; token: string }>('/api/auth/register', {
                username,
                email,
                password
            });

            console.log('注册请求成功，响应:', response.data);
            
            const { user, token } = response.data;
            console.log('保存token到localStorage');
            localStorage.setItem('token', token);
            console.log('设置用户状态:', user);
            setUser(user);

            console.log('注册成功，准备跳转到首页');
            // 注册成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error: any) {
            // 记录详细的错误日志
            console.error('注册API调用失败:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                config: error.config,
            });

            if (error.response?.data?.error) {
                throw new Error(error.response.data.error);
            }
            throw new Error('注册失败，请检查网络或稍后重试');
        }
    };

    const logout = () => {
        console.log('开始登出流程');
        console.log('清除localStorage中的token');
        localStorage.removeItem('token');
        console.log('清除用户状态');
        setUser(null);
        setIsAdminChecked(false);
        console.log('跳转到欢迎页面');
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