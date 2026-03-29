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
        // 保持原始代码的调试日志
        console.log('设置Authorization头:', `Bearer ${token}`);
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
    
    // 恢复原始代码的状态变量
    const [isChecking, setIsChecking] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useState(0);
    const [lastErrorTime, setLastErrorTime] = useState(0);

    const checkingRef = useRef(false);
    const lastCheckRef = useRef(0);
    const lastErrorRef = useRef(0);
    const isAdminCheckedRef = useRef(false);
    const locationPathRef = useRef('');

    const CHECK_INTERVAL = 30000; 
    const ERROR_RETRY_INTERVAL = 60000;

    isAdminCheckedRef.current = isAdminChecked;
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
        const current = loadSavedAccounts();
        const filtered = current.filter(a => a.user.id !== user.id);
        const updated = [{ user, token, lastActive: Date.now() }, ...filtered];
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
        setSavedAccounts(updated);
    }, [loadSavedAccounts]);

    // 恢复原始代码的 getUserById
    const getUserById = useCallback(async (userId: string): Promise<User> => {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('没有有效的认证token');
            const response = await api.get<User>(`/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error: any) {
            throw new Error('获取用户信息失败');
        }
    }, []);

    const checkAuth = useCallback(async () => {
        if (checkingRef.current) return;

        const now = Date.now();
        if (now - lastCheckRef.current < CHECK_INTERVAL || now - lastErrorRef.current < ERROR_RETRY_INTERVAL) {
            return;
        }

        checkingRef.current = true;
        setIsChecking(true);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.log('没有找到token，设置用户为null');
                setUser(null);
                setLoading(false);
                return;
            }

            console.log('检查认证状态，token:', token);
            const response = await api.get<User>('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });

            console.log('认证检查响应:', response.status, response.data);

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                setUser(null);
                setLoading(false);
                return;
            }

            const data = response.data;
            if (data) {
                setUser(data);
                saveAccount(data, token);
                
                // 恢复原始重定向逻辑
                if (data.role === 'admin' && !isAdminCheckedRef.current) {
                    console.log('检测到管理员用户，当前路径:', locationPathRef.current);
                    setIsAdminChecked(true);
                    const excludedPaths = ['/policy', '/welcome', '/admin/users', '/admin/store', '/admin/resources', '/admin/cdks'];
                    if (locationPathRef.current === '/' && !excludedPaths.includes(locationPathRef.current)) {
                        console.log('重定向到首页');
                        navigate('/', { replace: true });
                    }
                }
            } else {
                console.log('认证检查返回空数据，清除用户状态');
                setUser(null);
                localStorage.removeItem('token');
            }
            lastCheckRef.current = now;
            setLastCheckTime(now);
        } catch (error: any) {
            lastErrorRef.current = now;
            setLastErrorTime(now);
            if (error.response?.status === 429) {
                console.warn('认证检查被限流，将在60秒后重试');
            } else {
                setUser(null);
                localStorage.removeItem('token');
            }
        } finally {
            setLoading(false);
            setIsChecking(false);
            checkingRef.current = false;
        }
    }, [saveAccount, navigate]);

    useEffect(() => {
        loadSavedAccounts();
        checkAuth();
    }, [loadSavedAccounts, checkAuth]);

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
                setIsAdminChecked(false); // 重置管理员检查状态
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
                // 同时支持旧版的 pendingTOTP
                if (twoFactorType.includes('totp')) setPendingTOTP({ userId: user.id });
                return { requires2FA: true, user, token, twoFactorType };
            }

            if (token) {
                localStorage.setItem('token', token);
                saveAccount(user, token);
                setUser(user);
                lastCheckRef.current = Date.now();
                setLastCheckTime(Date.now());
            }
            return { requires2FA: false };
        } catch (error: any) {
            console.error('[login error]', error);
            const msg = error.response?.data?.error || error.message || '登录失败，请检查网络或稍后重试';
            throw new Error(msg);
        }
    };

    const loginWithToken = async (token: string, user: User) => {
        if (token) localStorage.setItem('token', token);
        saveAccount(user, token);
        setUser(user);
        lastCheckRef.current = Date.now();
        setLastCheckTime(Date.now());
    };

    // 恢复原始代码的精细化 verifyTOTP 错误处理
    const verifyTOTP = async (code: string, backupCode?: string) => {
        const userId = pendingTOTP?.userId || pending2FA?.userId;
        if (!userId) throw new Error('没有待验证的TOTP请求');
        
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
                const userData = await getUserById(userId);
                setUser(userData);
                saveAccount(userData, newToken);
                setPendingTOTP(null);
                setPending2FA(null);
                lastCheckRef.current = Date.now();
                setLastCheckTime(Date.now());
                return true;
            }
            throw new Error('TOTP验证失败');
        } catch (error: any) {
            setPendingTOTP(null);
            const errorData = error.response?.data;
            if (error.response?.status === 429) {
                const remainingTime = Math.ceil((errorData.lockedUntil - Date.now()) / 1000 / 60);
                throw new Error(`验证尝试次数过多，请${remainingTime}分钟后再试`);
            } else if (errorData?.remainingAttempts !== undefined) {
                const remainingAttempts = errorData.remainingAttempts;
                if (remainingAttempts === 0) {
                    const remainingTime = Math.ceil((errorData.lockedUntil - Date.now()) / 1000 / 60);
                    throw new Error(`验证码错误，账户已被锁定，请${remainingTime}分钟后再试`);
                } else {
                    throw new Error(`验证码错误，还剩${remainingAttempts}次尝试机会`);
                }
            } else {
                throw new Error(errorData?.error || error.message || 'TOTP验证失败');
            }
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
            setLastCheckTime(Date.now());
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '注册失败';
            throw new Error(msg);
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
        setIsAdminChecked(false);

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
        setIsAdminChecked(false);
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
        isChecking,
        lastCheckTime,
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
