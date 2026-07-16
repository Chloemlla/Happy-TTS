import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import { getApiBaseUrl } from '../api/api';
import {
    clearAuthToken,
    clearSavedAccounts,
    getAuthToken,
    readSavedAccounts,
    setAuthToken,
    writeSavedAccounts,
    ACCOUNTS_KEY as ACCOUNTS_KEY_CONST,
} from '../utils/authSession';

// 单设备多用户配置
const ACCOUNTS_KEY = ACCOUNTS_KEY_CONST;
const AUTH_TOKEN_EXPIRY_SKEW_MS = 30_000;

export interface SavedAccount {
    user: User;
    /** Optional: only for explicit non-cookie multi-account injection. */
    token?: string;
    lastActive: number;
}

const toStoredAccounts = (accounts: SavedAccount[]) => (
    accounts.map((account) => ({
        user: account.user as unknown as {
            id: string;
            username?: string;
            email?: string;
            role?: string;
        } & Record<string, unknown>,
        token: account.token,
        lastActive: account.lastActive,
    }))
);

interface LoginResponse {
    user: User;
    token: string;
    requires2FA?: boolean;
    twoFactorType?: string[];
}

type LoginResult =
    | { requires2FA: true; user: User; token: string; twoFactorType: string[] }
    | { requires2FA: false; user: User; token: string };

export interface AuthRequestError extends Error {
    status?: number;
    code?: string;
    remainingAttempts?: number;
    attemptLimit?: number;
    lockedUntil?: number;
    retryAfterSeconds?: number;
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
        return JSON.parse(window.atob(padded)) as Record<string, unknown>;
    } catch {
        return null;
    }
};

const getTokenExpiresAt = (token: string): number | null => {
    const payload = decodeJwtPayload(token);
    const exp = payload?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
};

const isTokenExpired = (token: string): boolean => {
    const expiresAt = getTokenExpiresAt(token);
    return expiresAt !== null && expiresAt <= Date.now() + AUTH_TOKEN_EXPIRY_SKEW_MS;
};

const isAuthRejectionStatus = (status?: number): boolean => status === 401 || status === 403 || status === 404;

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
    const token = getAuthToken();
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
        try {
            const parsed = readSavedAccounts().map((account) => ({
                user: account.user as unknown as User,
                token: account.token,
                lastActive: account.lastActive,
            })) as SavedAccount[];
            if (!Array.isArray(parsed)) return [];
            const validAccounts = parsed.filter(account => account?.user?.id && (!account.token || !isTokenExpired(account.token)));
            if (validAccounts.length !== parsed.length) {
                writeSavedAccounts(toStoredAccounts(validAccounts));
            }
            const sorted = validAccounts.sort((a, b) => b.lastActive - a.lastActive);
            setSavedAccounts(sorted);
            return sorted;
        } catch (e) {
            return [];
        }
    }, []);

    // 保存账号到列表
    const saveAccount = useCallback((user: User, token: string) => {
        if (token && isTokenExpired(token)) return;
        const current = loadSavedAccounts();
        const filtered = current.filter(a => a.user.id !== user.id);
        const updated = [{ user, token: token || undefined, lastActive: Date.now() }, ...filtered] as SavedAccount[];
        writeSavedAccounts(toStoredAccounts(updated));
        setSavedAccounts(updated);
    }, [loadSavedAccounts]);

    // 恢复原始代码的 getUserById
    const getUserById = useCallback(async (userId: string): Promise<User> => {
        try {
            const token = getAuthToken();
            const response = await api.get<User>(`/api/auth/me`, token ? {
                headers: { Authorization: `Bearer ${token}` }
            } : undefined);
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
            const token = getAuthToken();
            if (token && isTokenExpired(token)) {
                console.log('本地登录凭证已过期，清除本地 bearer，尝试 cookie 会话');
                clearAuthToken();
            }

            if (token) {
                const cachedAccount = loadSavedAccounts().find(account => account.token === token);
                if (cachedAccount) {
                    setUser(current => current ?? cachedAccount.user);
                }
            }

            // Cookie-first: withCredentials carries HttpOnly session when bearer is absent.
            const response = await api.get<User>('/api/auth/me', token ? {
                headers: { Authorization: `Bearer ${token}` }
            } : undefined);

            console.log('认证检查响应:', response.status);

            if (isAuthRejectionStatus(response.status)) {
                clearAuthToken();
                setUser(null);
                setLoading(false);
                return;
            }

            const data = response.data;
            if (data) {
                setUser(data);
                saveAccount(data, token || '');
                
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
                clearAuthToken();
            }
            lastCheckRef.current = now;
            setLastCheckTime(now);
        } catch (error: any) {
            lastErrorRef.current = now;
            setLastErrorTime(now);
            if (error.response?.status === 429) {
                console.warn('认证检查被限流，将在60秒后重试');
            } else if (isAuthRejectionStatus(error.response?.status)) {
                setUser(null);
                clearAuthToken();
            } else {
                console.warn('认证检查暂时失败，保留本地登录状态:', error.message);
            }
        } finally {
            setLoading(false);
            setIsChecking(false);
            checkingRef.current = false;
        }
    }, [loadSavedAccounts, saveAccount, navigate]);

    useEffect(() => {
        loadSavedAccounts();
        checkAuth();
    }, [loadSavedAccounts, checkAuth]);

    const switchAccount = async (userId: string) => {
        const accounts = loadSavedAccounts();
        const target = accounts.find(a => a.user.id === userId);
        if (target) {
            if (target.token && isTokenExpired(target.token)) {
                const updated = accounts.filter(a => a.user.id !== userId);
                writeSavedAccounts(toStoredAccounts(updated));
                setSavedAccounts(updated);
                return;
            }
            if (!target.token) {
                // Cookie-only accounts cannot silently assume another identity.
                clearAuthToken();
                setUser(null);
                navigate('/welcome');
                return;
            }
            // Explicit bearer injection path (non-cookie multi-account tooling).
            setAuthToken(target.token);
            setLoading(true);
            try {
                const response = await api.get<User>('/api/auth/me', {
                    headers: { Authorization: `Bearer ${target.token}` }
                });
                setUser(response.data);
                saveAccount(response.data, target.token);
                setIsAdminChecked(false); // 重置管理员检查状态
                navigate('/');
            } catch (e: any) {
                if (isAuthRejectionStatus(e.response?.status)) {
                    const updated = accounts.filter(a => a.user.id !== userId);
                    writeSavedAccounts(toStoredAccounts(updated));
                    setSavedAccounts(updated);
                    setUser(null);
                    clearAuthToken();
                    navigate('/welcome');
                } else {
                    setUser(target.user);
                    navigate('/');
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const login = async (username: string, password: string, cfToken?: string): Promise<LoginResult> => {
        try {
            const response = await api.post<LoginResponse>('/api/auth/login', {
                identifier: username,
                password,
                ...(cfToken && { cfToken })
            });
            const { user, token, requires2FA, twoFactorType } = response.data;
            
            if (requires2FA && twoFactorType && twoFactorType.length > 0) {
                setPending2FA({ userId: user.id, type: twoFactorType, username: user.username });
                // 同时支持旧版的 pendingTOTP
                if (twoFactorType.includes('TOTP')) setPendingTOTP({ userId: user.id });
                return { requires2FA: true, user, token, twoFactorType };
            }

            // Browser session is HttpOnly-cookie only. Do not persist access tokens in JS storage.
            clearAuthToken();
            saveAccount(user, '');
            setUser(user);
            lastCheckRef.current = Date.now();
            setLastCheckTime(Date.now());
            return { requires2FA: false, user, token };
        } catch (error: any) {
            console.error('[login error]', error);
            const errorData = error.response?.data || {};
            const msg = errorData.error || error.message || '登录失败，请检查网络或稍后重试';
            const authError = new Error(msg) as AuthRequestError;
            authError.status = error.response?.status;
            authError.code = errorData.code;
            authError.remainingAttempts = errorData.remainingAttempts;
            authError.attemptLimit = errorData.attemptLimit;
            authError.lockedUntil = errorData.lockedUntil;
            authError.retryAfterSeconds = errorData.retryAfterSeconds;
            throw authError;
        }
    };

    const loginWithToken = async (token: string, user: User) => {
        if (token) setAuthToken(token);
        saveAccount(user, token);
        setUser(user);
        lastCheckRef.current = Date.now();
        setLastCheckTime(Date.now());
    };

    // 恢复原始代码的精细化 verifyTOTP 错误处理
    const verifyTOTP = async (code: string, backupCode?: string, pendingToken?: string) => {
        const userId = pendingTOTP?.userId || pending2FA?.userId;
        if (!userId) throw new Error('没有待验证的TOTP请求');
        if (!pendingToken) throw new Error('缺少二次验证临时令牌');
        
        try {
            const response = await api.post('/api/totp/verify-token', {
                userId,
                token: backupCode ? undefined : code,
                backupCode,
                pendingToken
            });

            if (response.data.verified) {
                clearAuthToken();
                const userData = await getUserById(userId);
                setUser(userData);
                saveAccount(userData, '');
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
            const { user } = response.data;
            clearAuthToken();
            saveAccount(user, '');
            setUser(user);
            lastCheckRef.current = Date.now();
            setLastCheckTime(Date.now());
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '注册失败';
            throw new Error(msg);
        }
    };

    const logout = async () => {
        try {
            await api.post('/api/auth/logout');
        } catch {
            // ignore network failures; still clear local state
        }
        const accounts = loadSavedAccounts();
        if (user) {
            const updated = accounts.filter(a => a.user.id !== user.id);
            writeSavedAccounts(toStoredAccounts(updated));
            setSavedAccounts(updated);
        }

        clearAuthToken();
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
        void api.post('/api/auth/logout').catch(() => undefined);
        clearAuthToken();
        clearSavedAccounts();
        setUser(null);
        setSavedAccounts([]);
        setIsAdminChecked(false);
        navigate('/welcome');
    };

    const removeAccountFromList = (userId: string) => {
        const accounts = loadSavedAccounts();
        const updated = accounts.filter(a => a.user.id !== userId);
        writeSavedAccounts(toStoredAccounts(updated));
        setSavedAccounts(updated);
        
        if (user?.id === userId) {
            clearAuthToken();
            setUser(null);
            if (updated.length > 0) {
                switchAccount(updated[0].user.id);
            } else {
                navigate('/welcome');
            }
        }
    };

    const updateUserAvatar = async () => {
        try {
            const response = await api.get<User>('/api/auth/me');
            if (response.data) {
                setUser(response.data);
                saveAccount(response.data, getAuthToken() || '');
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
