import React, { useEffect, useMemo, useState } from "react";
import getApiBaseUrl from "../api";
import { cn } from "../utils/cn";
import { authElevatedPanelClassName } from "./authStudioTheme";

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
  "https://img.cdn1.vip/i/6980103489944_1770000436.png";

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
      className={cn(
        authElevatedPanelClassName,
        "flex w-full items-center justify-center gap-3 px-4 py-3.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-white",
        className,
      )}
    >
      <img
        src={LINUXDO_ICON_URL}
        alt="Linux.do"
        className="h-8 w-8 rounded-full border border-slate-200 object-cover shadow-sm"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className="flex flex-col items-start">
        <span>{label}</span>
        {description ? (
          <span className="text-[11px] font-normal leading-5 text-slate-500">{description}</span>
        ) : null}
      </span>
    </button>
  );
};

export default LinuxDoAuthButton;
