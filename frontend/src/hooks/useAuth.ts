import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import { getApiBaseUrl } from '../api/api';

// 单设备多用户配置
const ACCOUNTS_KEY = 'synapse_saved_accounts';

export interface SavedAccount {
    user: User;
    token: string;
    lastActive: number;
}

// 创建axios实例
const api = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    timeout: 5000
});

api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending2FA, setPending2FA] = useState<{ userId: string; type: string[]; username?: string } | null>(null);
    
    const navigate = useNavigate();
    const location = useLocation();
    
    const checkingRef = useRef(false);

    // 加载保存的账号列表
    const loadSavedAccounts = useCallback(() => {
        const stored = localStorage.getItem(ACCOUNTS_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as SavedAccount[];
                setSavedAccounts(parsed.sort((a, b) => b.lastActive - a.lastActive));
                return parsed;
            } catch (e) {
                return [];
            }
        }
        return [];
    }, []);

    // 保存账号到列表
    const saveAccount = useCallback((user: User, token: string) => {
        const current = loadSavedAccounts();
        const filtered = current.filter(a => a.user.id !== user.id);
        const updated = [{ user, token, lastActive: Date.now() }, ...filtered];
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
        setSavedAccounts(updated);
    }, [loadSavedAccounts]);

    const checkAuth = useCallback(async () => {
        if (checkingRef.current) return;
        checkingRef.current = true;

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setUser(null);
                setLoading(false);
                return;
            }

            const response = await api.get<User>('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data) {
                setUser(response.data);
                // 更新当前账号在列表中的最后活跃时间
                saveAccount(response.data, token);
            } else {
                setUser(null);
                localStorage.removeItem('token');
            }
        } catch (error: any) {
            if (error.response?.status === 401) {
                setUser(null);
                localStorage.removeItem('token');
            }
        } finally {
            setLoading(false);
            checkingRef.current = false;
        }
    }, [saveAccount]);

    useEffect(() => {
        loadSavedAccounts();
        checkAuth();
    }, []);

    // 切换账号
    const switchAccount = async (userId: string) => {
        const accounts = loadSavedAccounts();
        const target = accounts.find(a => a.user.id === userId);
        if (target) {
            localStorage.setItem('token', target.token);
            setLoading(true);
            try {
                const res = await api.get<User>('/api/auth/me', {
                    headers: { Authorization: `Bearer ${target.token}` }
                });
                setUser(res.data);
                saveAccount(res.data, target.token);
                navigate('/');
            } catch (e) {
                const updated = accounts.filter(a => a.user.id !== userId);
                localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
                setSavedAccounts(updated);
                setUser(null);
                localStorage.removeItem('token');
                navigate('/welcome');
            } finally {
                setLoading(false);
            }
        }
    };

    const login = async (username: string, password: string, cfToken?: string) => {
        try {
            const response = await api.post<{ user: User; token: string; requires2FA?: boolean; twoFactorType?: string[] }>('/api/auth/login', {
                identifier: username,
                password,
                ...(cfToken && { cfToken })
            });
            const { user, token, requires2FA, twoFactorType } = response.data;
            
            if (requires2FA && twoFactorType) {
                setPending2FA({ userId: user.id, type: twoFactorType, username: user.username });
                return { requires2FA: true, user, token, twoFactorType };
            }

            if (token) {
                localStorage.setItem('token', token);
                saveAccount(user, token);
                setUser(user);
            }
            return { requires2FA: false };
        } catch (error: any) {
            throw new Error(error.response?.data?.error || '登录失败');
        }
    };

    const register = async (username: string, email: string, password: string, cfToken?: string) => {
        try {
            const response = await api.post<{ user: User; token: string }>('/api/auth/register', {
                username,
                email,
                password,
                ...(cfToken && { cfToken })
            });
            const { user, token } = response.data;
            if (token) {
                localStorage.setItem('token', token);
                saveAccount(user, token);
                setUser(user);
            }
            return response.data;
        } catch (error: any) {
            throw new Error(error.response?.data?.error || '注册失败');
        }
    };

    const verifyTOTP = async (userId: string, code: string) => {
        try {
            const response = await api.post<{ user: User; token: string }>('/api/auth/verify-totp', {
                userId,
                code
            });
            const { user, token } = response.data;
            if (token) {
                localStorage.setItem('token', token);
                saveAccount(user, token);
                setUser(user);
                setPending2FA(null);
            }
            return response.data;
        } catch (error: any) {
            throw new Error(error.response?.data?.error || '验证失败');
        }
    };

    const loginWithToken = async (token: string, user: User) => {
        localStorage.setItem('token', token);
        saveAccount(user, token);
        setUser(user);
    };

    const logout = async () => {
        const accounts = loadSavedAccounts();
        if (user) {
            const updated = accounts.filter(a => a.user.id !== user.id);
            localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
            setSavedAccounts(updated);
        }

        localStorage.removeItem('token');
        setUser(null);
        setPending2FA(null);

        const remaining = loadSavedAccounts();
        if (remaining.length > 0) {
            switchAccount(remaining[0].user.id);
        } else {
            navigate('/welcome');
        }
    };

    const logoutAll = () => {
        localStorage.removeItem('token');
        localStorage.removeItem(ACCOUNTS_KEY);
        setUser(null);
        setSavedAccounts([]);
        navigate('/welcome');
    };

    const removeAccountFromList = (userId: string) => {
        const accounts = loadSavedAccounts();
        const updated = accounts.filter(a => a.user.id !== userId);
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
        setSavedAccounts(updated);
        
        if (user?.id === userId) {
            localStorage.removeItem('token');
            setUser(null);
            if (updated.length > 0) {
                switchAccount(updated[0].user.id);
            } else {
                navigate('/welcome');
            }
        }
    };

    const updateUserAvatar = async () => {
        await checkAuth();
    };

    return {
        user,
        savedAccounts,
        loading,
        pending2FA,
        setPending2FA,
        login,
        register,
        verifyTOTP,
        loginWithToken,
        switchAccount,
        logout,
        logoutAll,
        removeAccountFromList,
        api,
        updateUserAvatar
    };
};
