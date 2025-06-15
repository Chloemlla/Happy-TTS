import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';

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

            const response = await axios.get<User>('/api/auth/me', {
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
            const response = await axios.post<{ user: User; token: string }>('/api/auth/login', {
                username,
                password
            });

            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);

            // 登录成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error) {
            throw error;
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            const response = await axios.post<{ user: User; token: string }>('/api/auth/register', {
                username,
                email,
                password
            });

            const { user, token } = response.data;
            localStorage.setItem('token', token);
            setUser(user);

            // 注册成功后，让用户手动访问 / 来刷新页面
            window.location.href = '/';
        } catch (error) {
            throw error;
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