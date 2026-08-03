import React, { useMemo } from "react";
import getApiBaseUrl from "../api";
import { useAuthProviderStore } from "../stores/authProviderStore";
import { cn } from "../utils/cn";
import { authElevatedPanelClassName } from "./authStudioTheme";

interface LinuxDoAuthButtonProps {
  intent?: "login" | "register";
  label: string;
  description?: string;
  className?: string;
}

const LINUXDO_ICON_URL =
  "https://img.cdn1.vip/i/6980103489944_1770000436.png";

const LinuxDoAuthButton: React.FC<LinuxDoAuthButtonProps> = ({
  intent = "login",
  label,
  description,
  className = "",
}) => {
  const { linuxdo: config, loading } = useAuthProviderStore();
  const startUrl = useMemo(
    () => `${getApiBaseUrl()}/api/auth/linuxdo/start?intent=${intent}`,
    [intent],
  );

  if (loading || !config.enabled) {
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
