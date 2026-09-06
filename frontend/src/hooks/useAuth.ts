import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { isAdminRole } from '../utils/rbac';
import { resetAdminVerifyCache } from '../utils/adminVerifyCache';

export type { AuthRequestError, LoginResult };

// 单设备多用户配置
const ACCOUNTS_KEY = ACCOUNTS_KEY_CONST;

export interface SavedAccount {
    user: User;
    /**
     * 已废弃：cookie 会话下 JS 读不到 token，writeSavedAccounts 始终不写该字段。
     * 保留类型声明仅用于与账号切换 UI（G10）兼容，实际恒为 undefined。
     */
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

const isAuthRejectionStatus = (status?: number): boolean => status === 401 || status === 403;

// ===== 模块级节流单例（G9-03） =====
// 最近一次 /api/auth/me 检查时间与进行中标志在全部 useAuth 实例间共享。
// 之前节流状态存在每个 hook 实例闭包里，88 个文件数百调用点可对后端形成并发风暴；
// 提升到模块级后，一个页面 20+ 组件同时挂载也只会发出一轮检查请求。
const CHECK_INTERVAL = 30000;
const ERROR_RETRY_INTERVAL = 60000;
let moduleLastCheckRef = 0;
let moduleLastErrorRef = 0;
let moduleCheckingRef = false;

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

    const isAdminCheckedRef = useRef(false);
    const locationPathRef = useRef('');

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

    // 保存账号到列表（G9-10：writeSavedAccounts 从不落 token，token 参数仅用于与账号切换 UI 类型兼容）
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
        const now = Date.now();
        if (moduleCheckingRef
            || now - moduleLastCheckRef < CHECK_INTERVAL
            || now - moduleLastErrorRef < ERROR_RETRY_INTERVAL) {
            // 模块级检查正在执行或 30s 内刚完成：认证态已(即将)写入 store。
            // 若不在此复位本实例 loading，节流窗口内新挂载的消费方(AdminGuard 等)会
            // 永久卡在 "正在验证管理员权限..."——loading 只在真正发请求的 finally 里复位。
            setLoading(false);
            setIsChecking(false);
            setIsLoading(false);
            return;
        }

        moduleCheckingRef = true;
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
                if (isAdminRole(data.role) && !isAdminCheckedRef.current) {
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
            moduleLastCheckRef = now;
            setLastCheckTime(now);
        } catch (error: any) {
            moduleLastErrorRef = now;
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
            moduleCheckingRef = false;
        }
    }, [loadSavedAccounts, saveAccount, navigate]);

    useEffect(() => {
        loadSavedAccounts();
        checkAuth();
    }, [loadSavedAccounts, checkAuth]);

    const switchAccount = useCallback(async (userId: string) => {
        const accounts = loadSavedAccounts();
        const target = accounts.find(a => a.user.id === userId);
        if (!target) return;

        // cookie 会话下 JS 读不到 token（writeSavedAccounts 从不落 token，见 G9-10），
        // 无法静默切换会话，统一重定向到登录页重新认证。
        setUser(null);
        resetAdminVerifyCache(); // G11-17: 切换账号视为登出，清空 AdminGuard 软缓存
        setIsAdminChecked(false);
        navigate('/welcome');
    }, [loadSavedAccounts, navigate, setUser]);

    const login = useCallback(async (username: string, password: string, cfToken?: string): Promise<LoginResult> => {
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
            moduleLastCheckRef = Date.now();
            setLastCheckTime(Date.now());
            return result;
        } catch (error: any) {
            console.error('[login error]', error);
            maybeEmitPenaltyAppealFromError(error, 'login');
            throw error;
        }
    }, [saveAccount, storeLogin]);

    const loginWithToken = useCallback(async (token: string, user: User) => {
        if (!token) throw new Error('缺少登录令牌');
        // 将 Bearer token 转换为 cookie 会话
        await api.post('/api/auth/session', undefined, {
            headers: { Authorization: `Bearer ${token}` }
        });
        saveAccount(user, token);
        setUser(user);
        moduleLastCheckRef = Date.now();
        setLastCheckTime(Date.now());
    }, [saveAccount, setUser]);

    // 恢复原始代码的精细化 verifyTOTP 错误处理
    const verifyTOTP = useCallback(async (code: string, backupCode?: string, pendingToken?: string) => {
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
                moduleLastCheckRef = Date.now();
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
    }, [getCurrentUser, pending2FA, pendingTOTP, saveAccount, setUser]);

    const register = useCallback(async (username: string, email: string, password: string) => {
        try {
            const response = await api.post<{ user: User; token: string }>('/api/auth/register', {
                username, email, password
            });
            const { user, token } = response.data;
            saveAccount(user, token);
            setUser(user);
            moduleLastCheckRef = Date.now();
            setLastCheckTime(Date.now());
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || '注册失败';
            throw new Error(msg);
        }
    }, [saveAccount, setUser]);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        } catch (error) {
            // ignore network failures; still clear local state
            console.warn('登出请求失败，仍会清理本地状态:', error);
        }
        const accounts = loadSavedAccounts();
        if (user) {
            const updated = accounts.filter(a => a.user.id !== user.id);
            writeSavedAccounts(toStoredAccounts(updated));
            setSavedAccounts(updated);
        }

        storeLogout();
        resetAdminVerifyCache(); // G11-17: 登出即清空 AdminGuard 软缓存，避免降权账号会话内继续吃缓存
        setPendingTOTP(null);
        setPending2FA(null);
        setIsAdminChecked(false);

        const remaining = loadSavedAccounts();
        if (remaining.length > 0) {
            void switchAccount(remaining[0].user.id);
        } else {
            navigate('/welcome');
        }
    }, [loadSavedAccounts, navigate, storeLogout, switchAccount, user]);

    const logoutAll = useCallback(() => {
        void api.post('/api/auth/logout').catch(() => undefined);
        resetAdminVerifyCache(); // G11-17: 登出即清空 AdminGuard 软缓存
        clearSavedAccounts();
        storeLogout();
        setSavedAccounts([]);
        setIsAdminChecked(false);
        navigate('/welcome');
    }, [navigate, storeLogout]);

    const removeAccountFromList = useCallback((userId: string) => {
        const accounts = loadSavedAccounts();
        const updated = accounts.filter(a => a.user.id !== userId);
        writeSavedAccounts(toStoredAccounts(updated));
        setSavedAccounts(updated);

        if (user?.id === userId) {
            setUser(null);
            if (updated.length > 0) {
                void switchAccount(updated[0].user.id);
            } else {
                navigate('/welcome');
            }
        }
    }, [loadSavedAccounts, navigate, switchAccount, user]);

    const updateUserAvatar = useCallback(async () => {
        try {
            const response = await api.get<User>('/api/auth/me');
            if (response.data) {
                setUser(response.data);
                const accounts = loadSavedAccounts();
                const existing = accounts.find(a => a.user.id === response.data.id);
                saveAccount(response.data, existing?.token);
            }
        } catch (error) {
            console.warn('刷新用户头像信息失败:', error);
        }
    }, [loadSavedAccounts, saveAccount, setUser]);

    // 2FA 完成后的会话刷新：login() 在需要二次验证时会提前返回而不写入 store，
    // 此时 HttpOnly Cookie 已建立，需重新拉取用户信息，否则 AdminRoute 会因
    // user 为空把管理员弹回 /login。
    const refreshUser = useCallback(async (): Promise<User | null> => {
        try {
            const response = await api.get<User>('/api/auth/me');
            if (response.data) {
                setUser(response.data);
                const accounts = loadSavedAccounts();
                const existing = accounts.find(a => a.user.id === response.data.id);
                saveAccount(response.data, existing?.token);
                return response.data;
            }
            return null;
        } catch {
            return null;
        }
    }, [loadSavedAccounts, saveAccount, setUser]);

    // G9-32：用 useMemo 稳定返回对象，避免每个 useAuth() 调用都返回一组新函数引用，
    // 从而让 84 个消费组件的 useMemo/useCallback 依赖数组真正生效。
    return useMemo(() => ({
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
        updateUserAvatar,
        refreshUser
    }), [
        user,
        isAuthenticated,
        savedAccounts,
        loading,
        error,
        isChecking,
        lastCheckTime,
        pendingTOTP,
        pending2FA,
        login,
        loginWithToken,
        verifyTOTP,
        register,
        switchAccount,
        logout,
        logoutAll,
        removeAccountFromList,
        updateUserAvatar,
        refreshUser,
    ]);
};