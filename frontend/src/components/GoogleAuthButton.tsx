import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { useNotification } from "./Notification";

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

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-gsi="true"]',
    );

    if (existingScript) {
      if (window.google?.accounts?.id || existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google script failed to load")), {
        once: true,
      });
      return;
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
    script.onerror = () => reject(new Error("Google script failed to load"));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  intent = "login",
  label,
  description,
  className = "",
}) => {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const initializedClientIdRef = useRef<string>("");
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const { loginWithToken } = useAuth();
  const { setNotification } = useNotification();
  const buttonText = useMemo(
    () => (intent === "register" ? "signup_with" : "signin_with"),
    [intent],
  );

  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      const idToken = typeof response.credential === "string" ? response.credential : "";
      if (!idToken) {
        setNotification({ message: "Google 登录未返回有效凭证", type: "error" });
        return;
      }

      try {
        const authResponse = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ idToken }),
        });
        const data = await authResponse.json().catch(() => null);

        if (!authResponse.ok || !data?.token || !data?.user) {
          throw new Error(data?.error || "Google 登录失败");
        }

        await loginWithToken(data.token, data.user as User);
        setNotification({
          message: data.isNewUser ? "Google 注册并登录成功" : "Google 登录成功",
          type: "success",
        });
        window.location.replace("/");
      } catch (error) {
        setNotification({
          message: error instanceof Error ? error.message : "Google 登录失败",
          type: "error",
        });
      }
    },
    [loginWithToken, setNotification],
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
        });
      } catch {
        if (!cancelled) {
          setNotification({ message: "Google 登录按钮加载失败", type: "error" });
        }
      }
    };

    void renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [buttonText, clientId, enabled, handleCredentialResponse, loading, setNotification]);

  if (loading || !enabled) {
    return null;
  }

  return (
    <div
      className={`w-full rounded-xl border-2 border-[#8ECAE6]/30 bg-white px-4 py-3 shadow-sm ${className}`}
    >
      <div className="mb-3 flex items-center gap-3">
        <img
          width="48"
          height="48"
          src="https://img.icons8.com/color/48/google-logo.png"
          alt="google-logo"
          className="h-10 w-10 flex-shrink-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div>
          <div className="text-sm font-semibold text-[#023047]">{label}</div>
        {description ? (
          <div className="text-[11px] text-[#219EBC]">{description}</div>
        ) : null}
        </div>
      </div>
      <div ref={buttonRef} className="flex min-h-[44px] w-full items-center justify-center" />
    </div>
  );
};

export default GoogleAuthButton;
