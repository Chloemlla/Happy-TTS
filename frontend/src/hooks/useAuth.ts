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
    timeout: 5000 // 5秒超时
});

api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 添加请求拦截器
api.interceptors.response.use(
    (response) => response,
    (error) => {
        return Promise.reject(error);
    }
);

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingTOTP, setPendingTOTP] = useState<{ userId: string } | null>(null);
    const [pending2FA, setPending2FA] = useState<{ userId: string; type: string[]; username?: string } | null>(null);
    
    const navigate = useNavigate();
    const location = useLocation();
    
    const checkingRef = useRef(false);
    const lastCheckRef = useRef(0);
    const lastErrorRef = useRef(0);
    const isAdminCheckedRef = useRef(false);
    const locationPathRef = useRef('');

    const CHECK_INTERVAL = 30000; 
    const ERROR_RETRY_INTERVAL = 60000;

    locationPathRef.current = location.pathname;

    // 加载保存的账号列表
    const loadSavedAccounts = useCallback(() => {
        const stored = localStorage.getItem(ACCOUNTS_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as SavedAccount[];
                const sorted = parsed.sort((a, b) => b.lastActive - a.lastActive);
                setSavedAccounts(sorted);
                return sorted;
            } catch (e) {
                return [];
            }
        }
        return [];
    }, []);

    // 保存账号到列表
    const saveAccount = useCallback((user: User, token: string) => {
        const stored = localStorage.getItem(ACCOUNTS_KEY);
        let current: SavedAccount[] = [];
        if (stored) {
            try { current = JSON.parse(stored); } catch (e) {}
        }
        const filtered = current.filter(a => a.user.id !== user.id);
        const updated = [{ user, token, lastActive: Date.now() }, ...filtered];
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
        setSavedAccounts(updated);
    }, []);

    const checkAuth = useCallback(async () => {
        if (checkingRef.current) return;

        const now = Date.now();
        if (now - lastCheckRef.current < CHECK_INTERVAL || now - lastErrorRef.current < ERROR_RETRY_INTERVAL) {
            return;
        }

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
                const data = response.data;
                setUser(data);
                saveAccount(data, token); // 同步到多账号列表
                
                if (data.role === 'admin' && !isAdminCheckedRef.current) {
                    isAdminCheckedRef.current = true;
                    const excludedPaths = ['/policy', '/welcome', '/admin/users', '/admin/store', '/admin/resources', '/admin/cdks'];
                    if (locationPathRef.current === '/' && !excludedPaths.includes(locationPathRef.current)) {
                        navigate('/', { replace: true });
                    }
                }
            } else {
                setUser(null);
                localStorage.removeItem('token');
            }
            lastCheckRef.current = now;
        } catch (error: any) {
            lastErrorRef.current = now;
            if (error.response?.status !== 429) {
                setUser(null);
                localStorage.removeItem('token');
            }
        } finally {
            setLoading(false);
            checkingRef.current = false;
        }
    }, [saveAccount, navigate]);

    useEffect(() => {
        loadSavedAccounts();
        checkAuth();
    }, [loadSavedAccounts, checkAuth]);

    // 切换账号
    const switchAccount = async (userId: string) => {
        const accounts = loadSavedAccounts();
        const target = accounts.find(a => a.user.id === userId);
        if (target) {
            localStorage.setItem('token', target.token);
            setLoading(true);
            try {
                const response = await api.get<User>('/api/auth/me', {
                    headers: { Authorization: `Bearer ${target.token}` }
                });
                setUser(response.data);
                saveAccount(response.data, target.token);
                isAdminCheckedRef.current = false;
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
            
            if (requires2FA && twoFactorType && twoFactorType.length > 0) {
                setPending2FA({ userId: user.id, type: twoFactorType, username: user.username });
                return { requires2FA: true, user, token, twoFactorType };
            }

            if (token) {
                localStorage.setItem('token', token);
                saveAccount(user, token);
                setUser(user);
                lastCheckRef.current = Date.now();
            }
            return { requires2FA: false };
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '登录失败';
            throw new Error(msg);
        }
    };

    const loginWithToken = async (token: string, user: User) => {
        localStorage.setItem('token', token);
        saveAccount(user, token);
        setUser(user);
        lastCheckRef.current = Date.now();
    };

    const verifyTOTP = async (code: string, backupCode?: string) => {
        const userId = pendingTOTP?.userId || pending2FA?.userId;
        if (!userId) throw new Error('没有待验证的请求');
        
        try {
            const token = localStorage.getItem('token');
            const response = await api.post('/api/totp/verify-token', {
                userId,
                token: backupCode ? undefined : code,
                backupCode
            }, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (response.data.verified && response.data.token) {
                const newToken = response.data.token;
                localStorage.setItem('token', newToken);
                const userRes = await api.get<User>('/api/auth/me', {
                    headers: { Authorization: `Bearer ${newToken}` }
                });
                setUser(userRes.data);
                saveAccount(userRes.data, newToken);
                setPendingTOTP(null);
                setPending2FA(null);
                return true;
            }
            throw new Error('验证失败');
        } catch (error: any) {
            throw new Error(error.response?.data?.error || '验证失败');
        }
    };

    const register = async (username: string, email: string, password: string) => {
        try {
            const response = await api.post<{ user: User; token: string }>('/api/auth/register', {
                username, email, password
            });
            const { user, token } = response.data;
            localStorage.setItem('token', token);
            saveAccount(user, token);
            setUser(user);
            lastCheckRef.current = Date.now();
        } catch (error: any) {
            throw new Error(error.response?.data?.error || '注册失败');
        }
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
        setPendingTOTP(null);
        setPending2FA(null);
        isAdminCheckedRef.current = false;

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
        isAdminCheckedRef.current = false;
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
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const response = await api.get<User>('/api/auth/me');
            if (response.data) {
                setUser(response.data);
                saveAccount(response.data, token);
            }
        } catch (e) {}
    };

    return {
        user,
        savedAccounts,
        loading,
        pendingTOTP,
        pending2FA,
        setPending2FA,
        login,
        loginWithToken,
        verifyTOTP,
        register,
        switchAccount,
        logout,
        logoutAll,
        removeAccountFromList,
        api,
        updateUserAvatar
    };
};
