import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types/auth";
import { api } from "../api/api";

/**
 * Enriched error thrown by auth actions so UI can surface lockout / retry hints.
 */
export interface AuthRequestError extends Error {
  status?: number;
  code?: string;
  remainingAttempts?: number;
  attemptLimit?: number;
  lockedUntil?: number;
  retryAfterSeconds?: number;
}

interface LoginResponse {
  user: User;
  token: string;
  requires2FA?: boolean;
  twoFactorType?: string[];
}

export type LoginResult =
  | { requires2FA: true; user: User; token: string; twoFactorType: string[] }
  | { requires2FA: false; user: User; token: string };

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** true until the initial session check has settled. */
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string, cfToken?: string) => Promise<LoginResult>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const isAuthRejectionStatus = (status?: number): boolean => status === 401 || status === 403 || status === 404;

const buildAuthError = (error: any): AuthRequestError => {
  const errorData = error.response?.data || {};
  const msg = errorData.error || error.message || "登录失败，请检查网络或稍后重试";
  const authError = new Error(msg) as AuthRequestError;
  authError.status = error.response?.status;
  authError.code = errorData.code;
  authError.remainingAttempts = errorData.remainingAttempts;
  authError.attemptLimit = errorData.attemptLimit;
  authError.lockedUntil = errorData.lockedUntil;
  authError.retryAfterSeconds = errorData.retryAfterSeconds;
  return authError;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (username, password, cfToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<LoginResponse>("/api/auth/login", {
            identifier: username,
            password,
            ...(cfToken ? { cfToken } : {}),
          });
          const { user, token, requires2FA, twoFactorType } = response.data;
          // 2FA required: keep the session pending — do NOT mark authenticated yet.
          if (requires2FA && twoFactorType && twoFactorType.length > 0) {
            set({ isLoading: false });
            return { requires2FA: true, user, token, twoFactorType };
          }
          set({ user, token, isAuthenticated: true, isLoading: false, error: null });
          return { requires2FA: false, user, token };
        } catch (error: any) {
          const authError = buildAuthError(error);
          set({ isLoading: false, error: authError.message });
          throw authError;
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, error: null });
      },

      checkAuth: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.get<User>("/api/auth/me");
          const data = response.data;
          if (data) {
            set({ user: data, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (error: any) {
          if (isAuthRejectionStatus(error.response?.status)) {
            set({ user: null, isAuthenticated: false, isLoading: false, error: "登录状态已失效，请重新登录" });
          } else {
            set({ isLoading: false });
          }
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: user !== null });
      },

      setToken: (token) => {
        set({ token });
      },

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      reset: () => {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
      },
    }),
    {
      name: "auth-storage",
      // Browser sessions are HttpOnly-cookie only — never persist access tokens.
      partialize: (state) => ({ user: state.user }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<{ user: User | null }>;
        const user = p.user ?? null;
        return {
          ...current,
          user,
          isAuthenticated: user !== null,
        };
      },
    },
  ),
);
