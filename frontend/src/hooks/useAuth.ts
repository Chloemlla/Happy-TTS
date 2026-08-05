import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import { useAuthStore } from '../stores/authStore';
import type { AuthRequestError, LoginResult } from '../stores/authStore';
import { getApiBaseUrl } from '../api/api';
import {
    clearSavedAccounts,
    readSavedAccounts,
    writeSavedAccounts,
    ACCOUNTS_KEY as ACCOUNTS_KEY_CONST,
} from '../utils/authSession';
import { maybeEmitPenaltyAppealFromError } from '../utils/penaltyAppeal';

export type { AuthRequestError, LoginResult };

// 单设备多用户配置
const ACCOUNTS_KEY = ACCOUNTS_KEY_CONST;

export interface SavedAccount {
    user: User;
    /** 账号切换令牌，仅在调用 /api/auth/session 时使用，不用于常规认证检查 */
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

const isAuthRejectionStatus = (status?: number): boolean => status === 401 || status === 403 || status === 404;

// 创建axios实例（仅用于 auth 相关请求，cookie 自动携带认证）
const api = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    timeout: 5000
});

export const useAuth = () => {
    // Auth identity state is owned by the Zustand authStore (single source of truth).
    const user = useAuthStore((state) => state.user);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const error = useAuthStore((state) => state.error);
    const setUser = useAuthStore((state) => state.setUser);
    const setIsLoading = useAuthStore((state) => state.setIsLoading);
    const storeLogin = useAuthStore((state) => state.login);
    const storeLogout = useAuthStore((state) => state.logout);
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
            const validAccounts = parsed.filter(account => account?.user?.id);
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

    // 保存账号到列表（保留 token 用于账号切换，不用于常规认证检查）
    const saveAccount = useCallback((user: User, token?: string) => {
        const current = loadSavedAccounts();
        const filtered = current.filter(a => a.user.id !== user.id);
        const updated = [{ user, token, lastActive: Date.now() }, ...filtered] as SavedAccount[];
        writeSavedAccounts(toStoredAccounts(updated));
        setSavedAccounts(updated);
    }, [loadSavedAccounts]);

    // 获取当前登录用户信息
    const getCurrentUser = useCallback(async (): Promise<User> => {
        try {
            const response = await api.get<User>(`/api/auth/me`);
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
            // 认证由 HttpOnly Cookie 自动携带，无需手动读取 token
            const response = await api.get<User>('/api/auth/me');

            console.log('认证检查响应:', response.status);

            if (isAuthRejectionStatus(response.status)) {
                setUser(null);
                setLoading(false);
                return;
            }

            const data = response.data;
            if (data) {
                setUser(data);
                const accounts = loadSavedAccounts();
                const existing = accounts.find(a => a.user.id === data.id);
                saveAccount(data, existing?.token);

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
            }
            lastCheckRef.current = now;
            setLastCheckTime(now);
        } catch (error: any) {
            lastErrorRef.current = now;
            setLastErrorTime(now);
            if (error.response?.status === 429) {
                console.warn('认证检查被限流，将在60秒后重试');
            } else if (isAuthRejectionStatus(error.response?.status)) {
                maybeEmitPenaltyAppealFromError(error, 'auth-check');
                setUser(null);
            } else {
                console.warn('认证检查暂时失败，保留本地登录状态:', error.message);
            }
        } finally {
            setLoading(false);
            // Keep the store's auth-operation flag coherent with the app's session check.
            setIsLoading(false);
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
        if (!target) return;

        // 无 token 的 cookie 会话账号无法静默切换，需重新登录
        if (!target.token) {
            setUser(null);
            navigate('/welcome');
            return;
        }

        setLoading(true);
        try {
            // 用保存的 token 调用会话转换接口，后端设置新 cookie
            await api.post('/api/auth/session', undefined, {
                headers: { Authorization: `Bearer ${target.token}` }
            });
            const response = await api.get<User>('/api/auth/me');
            setUser(response.data);
            saveAccount(response.data, target.token);
            setIsAdminChecked(false);
            navigate('/');
        } catch (e: any) {
            if (isAuthRejectionStatus(e.response?.status)) {
                // token 失效，移除该账号
                const updated = accounts.filter(a => a.user.id !== userId);
                writeSavedAccounts(toStoredAccounts(updated));
                setSavedAccounts(updated);
                setUser(null);
                navigate('/welcome');
            } else {
                // 网络错误，保留本地状态
                setUser(target.user);
                navigate('/');
            }
        } finally {
            setLoading(false);
            setIsLoading(false);
        }
    };

    const login = async (username: string, password: string, cfToken?: string): Promise<LoginResult> => {
        try {
            // Delegate the actual API call + auth state mutation to the Zustand store.
            const result = await storeLogin(username, password, cfToken);

            if (result.requires2FA && result.twoFactorType && result.twoFactorType.length > 0) {
                setPending2FA({ userId: result.user.id, type: result.twoFactorType, username: result.user.username });
                // 同时支持旧版的 pendingTOTP
                if (result.twoFactorType.includes('TOTP')) setPendingTOTP({ userId: result.user.id });
                return result;
            }

            // Browser session is HttpOnly-cookie only. Do not persist access tokens in JS storage.
            saveAccount(result.user, result.token);
            lastCheckRef.current = Date.now();
            setLastCheckTime(Date.now());
            return result;
        } catch (error: any) {
            console.error('[login error]', error);
            maybeEmitPenaltyAppealFromError(error, 'login');
            throw error;
        }
    };

    const loginWithToken = async (token: string, user: User) => {
        if (!token) throw new Error('缺少登录令牌');
        // 将 Bearer token 转换为 cookie 会话
        await api.post('/api/auth/session', undefined, {
            headers: { Authorization: `Bearer ${token}` }
        });
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
                const userData = await getCurrentUser();
                setUser(userData);
                saveAccount(userData);
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

        storeLogout();
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
        clearSavedAccounts();
        storeLogout();
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
                const accounts = loadSavedAccounts();
                const existing = accounts.find(a => a.user.id === response.data.id);
                saveAccount(response.data, existing?.token);
            }
        } catch (e) {}
    };

    return {
        user,
        isAuthenticated,
        savedAccounts,
        loading,
        error,
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