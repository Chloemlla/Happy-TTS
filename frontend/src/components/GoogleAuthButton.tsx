import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { queuePostRedirectNotification, useNotification } from "./Notification";
import { cn } from "../utils/cn";
import { authElevatedPanelClassName } from "./authStudioTheme";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface GoogleAuthButtonProps {
  intent?: "login" | "register";
  label: string;
  description?: string;
  className?: string;
}

interface GoogleAuthConfigResponse {
  enabled?: boolean;
  clientId?: string;
}

interface GoogleBindSessionResponse {
  requiresBinding?: boolean;
  session?: {
    sessionToken: string;
  };
  token?: string;
  user?: User;
  isNewUser?: boolean;
  error?: string;
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-gsi="true"]',
    );

    if (existingScript) {
      if (window.google?.accounts?.id || existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }
      if (existingScript.dataset.failed === "true") {
        existingScript.remove();
      } else {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Google script failed to load")), {
          once: true,
        });
        return;
      }
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.dataset.failed = "true";
      script.remove();
      reject(new Error("Google script failed to load"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });

  return googleScriptPromise ?? Promise.resolve();
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  intent = "login",
  label,
  description,
  className = "",
}) => {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const initializedClientIdRef = useRef<string>("");
  const notifiedLoadFailureRef = useRef(false);
  const authenticatingRef = useRef(false);
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [scriptLoadFailed, setScriptLoadFailed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const { loginWithToken } = useAuth();
  const { setNotification } = useNotification();
  const buttonText = useMemo(
    () => (intent === "register" ? "signup_with" : "signin_with"),
    [intent],
  );

  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (authenticatingRef.current) {
        return;
      }

      const idToken = typeof response.credential === "string" ? response.credential : "";
      if (!idToken) {
        setNotification({ message: "Google 登录未返回有效凭证", type: "error" });
        return;
      }

      authenticatingRef.current = true;
      setAuthenticating(true);
      try {
        const authResponse = await fetch(`${getApiBaseUrl()}/api/auth/google/bind-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ idToken }),
        });
        const data = (await authResponse.json().catch(() => null)) as GoogleBindSessionResponse | null;

        if (!authResponse.ok) {
          throw new Error(data?.error || "Google 登录失败");
        }

        if (data?.requiresBinding) {
          if (!data.session?.sessionToken) {
            throw new Error("Google 登录绑定会话创建失败");
          }
          navigate(`/auth/provider/bind?sessionToken=${encodeURIComponent(data.session.sessionToken)}`);
          return;
        }

        if (!data?.token || !data?.user) {
          throw new Error(data?.error || "Google 登录失败");
        }

        await loginWithToken(data.token, data.user as User);
        const successNotification = {
          message: data.isNewUser
            ? "Google 注册并登录成功，您的注册用户密码凭据也已发到您对应的邮箱，请及时更改密码"
            : "Google 登录成功",
          type: "success",
          duration: data.isNewUser ? 8000 : undefined,
        } as const;
        if (data.isNewUser) {
          queuePostRedirectNotification(successNotification);
        }
        setNotification(successNotification);
        window.location.replace("/");
      } catch (error) {
        authenticatingRef.current = false;
        setAuthenticating(false);
        setNotification({
          message: error instanceof Error ? error.message : "Google 登录失败",
          type: "error",
        });
      }
    },
    [loginWithToken, navigate, setNotification],
  );

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/google/config`, {
          credentials: "include",
        });
        const data = (await response.json()) as GoogleAuthConfigResponse;

        if (!cancelled) {
          setEnabled(Boolean(response.ok && data?.enabled && data?.clientId));
          setClientId(data?.clientId || "");
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
          setClientId("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !enabled || !clientId || !buttonRef.current) {
      return;
    }

    let cancelled = false;

    const renderGoogleButton = async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return;
        }

        if (initializedClientIdRef.current !== clientId) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            // GSI Web Sign-In defaults for SPA: popup credential flow + verified email
            auto_select: false,
            cancel_on_tap_outside: true,
            context: intent === "register" ? "signup" : "signin",
            ux_mode: "popup",
            use_fedcm_for_prompt: true,
            locale: "zh-CN",
          });
          initializedClientIdRef.current = clientId;
        }

        buttonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: buttonText,
          shape: "rectangular",
          width: Math.max(buttonRef.current.offsetWidth || 0, 280),
          locale: "zh-CN",
        });
        setScriptLoadFailed(false);
        notifiedLoadFailureRef.current = false;
      } catch {
        if (!cancelled) {
          setScriptLoadFailed(true);
          if (!notifiedLoadFailureRef.current) {
            setNotification({
              message: "无法加载 Google 登录模块，请检查网络配置。",
              type: "error",
            });
            notifiedLoadFailureRef.current = true;
          }
        }
      }
    };

    void renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [buttonText, clientId, enabled, handleCredentialResponse, intent, loading, setNotification]);

  if (loading || !enabled) {
    return null;
  }

  return (
    <div className={cn(authElevatedPanelClassName, "w-full px-4 py-3", className)} aria-busy={authenticating}>
      <div className="mb-3 flex items-center gap-3">
        <img
          width="48"
          height="48"
          src="https://www.gstatic.com/marketing-cms/assets/images/d5/dc/cfe9ce8b4425b410b49b7f2dd3f3/g.webp=s96-fcrop64=1,00000000ffffffff-rw"
          alt="google-logo"
          className="h-8 w-8 flex-shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div>
          <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description ? (
          <div className="text-[11px] leading-5 text-slate-500">{description}</div>
        ) : null}
        </div>
      </div>
      {scriptLoadFailed ? (
        <div className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-center text-xs text-amber-700">
          无法加载 Google 登录模块，请检查网络配置。
        </div>
      ) : (
        <div className="relative min-h-[44px]">
          <div
            ref={buttonRef}
            className={cn(
              "flex min-h-[44px] w-full items-center justify-center transition",
              authenticating && "pointer-events-none opacity-20",
            )}
          />
          {authenticating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white/95 px-3 text-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              <p className="mt-2 text-xs font-medium text-slate-700">正在完成 Google 登录...</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">如果没有自动跳转，请返回登录页重试。</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default GoogleAuthButton;
