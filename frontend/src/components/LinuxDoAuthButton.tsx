import React, { useEffect, useMemo, useState } from "react";
import getApiBaseUrl from "../api";

interface LinuxDoAuthButtonProps {
  intent?: "login" | "register";
  label: string;
  description?: string;
  className?: string;
}

interface LinuxDoConfigResponse {
  enabled?: boolean;
}

const LINUXDO_ICON_URL =
  "https://picui.ogmua.cn/s1/2026/01/28/697a1026ce2ea.webp";

const LinuxDoAuthButton: React.FC<LinuxDoAuthButtonProps> = ({
  intent = "login",
  label,
  description,
  className = "",
}) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const startUrl = useMemo(
    () => `${getApiBaseUrl()}/api/auth/linuxdo/start?intent=${intent}`,
    [intent],
  );

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/linuxdo/config`, {
          credentials: "same-origin",
        });
        const data = (await response.json()) as LinuxDoConfigResponse;
        if (!cancelled) {
          setEnabled(Boolean(response.ok && data?.enabled));
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
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

  if (loading || !enabled) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.location.assign(startUrl)}
      className={`w-full flex items-center justify-center gap-3 py-3.5 px-4 border-2 border-[#8ECAE6]/30 rounded-xl text-sm font-semibold text-[#023047] bg-white hover:bg-[#8ECAE6]/10 transition-all duration-200 shadow-sm ${className}`}
    >
      <img
        src={LINUXDO_ICON_URL}
        alt="Linux.do"
        className="h-8 w-8 rounded-full object-cover shadow-sm"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className="flex flex-col items-start">
        <span>{label}</span>
        {description ? (
          <span className="text-[11px] font-normal text-[#219EBC]">{description}</span>
        ) : null}
      </span>
    </button>
  );
};

export default LinuxDoAuthButton;
