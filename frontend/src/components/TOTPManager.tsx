import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import axios from "axios";
import {
  FaCheckCircle,
  FaClock,
  FaEye,
  FaKey,
  FaLock,
  FaShieldAlt,
} from "react-icons/fa";
import type { TOTPStatus } from "../types/auth";
import { passkeyApi } from "../api/passkey";
import {
  cleanTOTPToken,
  handleTOTPError,
  validateTOTPToken,
} from "../utils/totpUtils";
import BackupCodesModal from "./BackupCodesModal";
import { PasskeySetup } from "./PasskeySetup";
import {
  studioFieldClassName,
  studioGhostButtonClassName,
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
} from "./studioTheme";
import TOTPSetup from "./TOTPSetup";
import { getApiBaseUrl } from "../api/api";

interface TOTPManagerProps {
  onStatusChange?: (status: TOTPStatus) => void;
}

const TOTPManager: React.FC<TOTPManagerProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<TOTPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [disabling, setDisabling] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const api = useMemo(
    () =>
      axios.create({
        baseURL: getApiBaseUrl(),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }),
    [],
  );

  const fetchStatus = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    const isInitial = mode === "initial";

    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setStatusError("");

      const [totpResult, passkeyResult] = await Promise.allSettled([
        api.get<TOTPStatus>("/api/totp/status"),
        passkeyApi.getCredentials(),
      ]);

      if (totpResult.status === "fulfilled") {
        const nextStatus = {
          ...totpResult.value.data,
          type: [
            totpResult.value.data.enabled ? "TOTP" : null,
            passkeyResult.status === "fulfilled" && passkeyResult.value.data.length > 0
              ? "Passkey"
              : null,
          ].filter(Boolean) as string[],
        };
        setStatus(nextStatus);
        onStatusChange?.(nextStatus);
      } else if (isInitial) {
        setStatusError("无法获取账户安全状态，请稍后重试。");
        setStatus({ enabled: false, hasBackupCodes: false, type: [] });
      } else {
        setStatusError("状态刷新失败，页面仍显示上一次结果。");
      }

      if (passkeyResult.status === "fulfilled") {
        setPasskeyEnabled(passkeyResult.value.data.length > 0);
      } else if (isInitial) {
        setPasskeyEnabled(false);
      }
    } catch (err) {
      console.error("获取 TOTP 状态失败:", err);
      setStatusError("无法获取账户安全状态，请稍后重试。");
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [api, onStatusChange]);

  useEffect(() => {
    void fetchStatus("initial");
  }, [fetchStatus]);

  const handleDisable = async () => {
    if (disabling) return;

    const cleanCode = cleanTOTPToken(disableCode);
    if (!cleanCode.trim()) {
      setError("请输入验证码");
      return;
    }
    if (!validateTOTPToken(cleanCode)) {
      setError("验证码必须是 6 位数字");
      return;
    }

    try {
      setError("");
      setDisabling(true);
      await api.post("/api/totp/disable", { token: cleanCode });
      setShowDisable(false);
      setDisableCode("");
      void fetchStatus("refresh");
    } catch (err: any) {
      setError(handleTOTPError(err));
    } finally {
      setDisabling(false);
    }
  };

  const totpEnabled = Boolean(status?.enabled);
  const hasPasskey = passkeyEnabled;
  const methodLabel = [
    totpEnabled ? "TOTP" : null,
    hasPasskey ? "Passkey" : null,
  ]
    .filter(Boolean)
    .join(" / ");

  const summaryItems = [
    {
      label: "验证方式",
      value: methodLabel || "仅密码",
    },
    {
      label: "恢复码",
      value: totpEnabled
        ? status?.hasBackupCodes
          ? "已生成"
          : "未确认"
        : "启用后可用",
    },
    {
      label: "Passkey",
      value: hasPasskey ? "已配置" : "未配置",
    },
  ];
  const motionProps = prefersReducedMotion
    ? { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } }
    : undefined;

  if (loading) {
    return (
      <div
        className="mx-auto flex min-h-[360px] max-w-2xl items-center justify-center py-12"
        style={{ fontFamily: studioPageFont }}
      >
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-2xl space-y-4"
      style={{ fontFamily: studioPageFont }}
    >
      <motion.section
        initial={motionProps?.initial ?? { opacity: 0, y: 12 }}
        animate={motionProps?.animate ?? { opacity: 1, y: 0 }}
        transition={motionProps?.transition ?? { duration: 0.24 }}
        className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              {totpEnabled ? <FaCheckCircle /> : <FaShieldAlt />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900">
                登录保护
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {totpEnabled
                  ? "动态验证码已开启，登录时会要求额外验证。"
                  : "当前仍可仅凭密码登录，建议启用动态验证码。"}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
              totpEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {totpEnabled ? "已开启" : "未开启"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3"
            >
              <div className="text-xs text-slate-400">{item.label}</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-800">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {statusError || refreshing ? (
          <div
            className={`mt-3 rounded-2xl border px-4 py-3 text-xs leading-5 ${
              statusError
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white/80 text-slate-500"
            }`}
          >
            {statusError || "正在同步账户安全状态..."}
          </div>
        ) : null}
      </motion.section>

      <motion.section
        initial={motionProps?.initial ?? { opacity: 0, y: 12 }}
        animate={motionProps?.animate ?? { opacity: 1, y: 0 }}
        transition={motionProps?.transition ?? { duration: 0.24, delay: 0.04 }}
        className="space-y-3"
      >
        <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
              <FaLock />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  动态验证码
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    totpEnabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {totpEnabled ? "已启用" : "未启用"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                使用认证器应用生成 6 位验证码，保护登录过程。
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {totpEnabled ? (
              <>
                {status?.hasBackupCodes ? (
                  <button
                    type="button"
                    onClick={() => setShowBackupCodes(true)}
                    className={`${studioGhostButtonClassName} sm:w-auto`}
                  >
                    <FaEye />
                    查看恢复码
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowDisable(true)}
                  className={`${studioGhostButtonClassName} border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700 sm:w-auto`}
                >
                  关闭 TOTP
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                className={`${studioPrimaryButtonClassName} sm:w-auto`}
              >
                <FaLock />
                启用 TOTP
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
              <FaKey />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Passkey
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    hasPasskey
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {hasPasskey ? "已配置" : "可选"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                使用设备密钥或生物识别完成更快的身份验证。
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPasskeySetup(true)}
              className={`${studioGhostButtonClassName} w-full sm:w-auto`}
            >
              <FaKey />
              管理 Passkey
            </button>
          </div>
        </div>
      </motion.section>

      <TOTPSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSuccess={() => void fetchStatus("refresh")}
      />
      <BackupCodesModal
        isOpen={showBackupCodes}
        onClose={() => setShowBackupCodes(false)}
      />

      <AnimatePresence>
        {showDisable ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={studioModalOverlayClassName}
            onClick={() => {
              if (!disabling) setShowDisable(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className={`${studioModalCardClassName} max-w-md`}
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl font-semibold text-slate-900">
                关闭 TOTP
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                输入当前 6 位验证码后关闭动态验证码。
              </p>
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  value={disableCode}
                  onChange={(event) =>
                    setDisableCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && disableCode.length === 6 && !disabling) {
                      void handleDisable();
                    }
                  }}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${studioFieldClassName} text-center font-mono sm:rounded-[18px]`}
                />
                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDisable(false)}
                    disabled={disabling}
                    className={`${studioGhostButtonClassName} w-full sm:w-auto`}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDisable}
                    disabled={disableCode.length !== 6 || disabling}
                    className={`${studioPrimaryButtonClassName} w-full bg-rose-600 shadow-rose-600/20 hover:bg-rose-700 sm:w-auto`}
                  >
                    {disabling ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    ) : (
                      <FaClock />
                    )}
                    确认关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showPasskeySetup ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={studioModalOverlayClassName}
            onClick={() => {
              setShowPasskeySetup(false);
              void fetchStatus("refresh");
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              className={`${studioModalCardClassName} max-w-4xl`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="max-h-[80vh] overflow-y-auto overscroll-contain pr-1">
                <PasskeySetup
                  onClose={() => {
                    setShowPasskeySetup(false);
                    void fetchStatus("refresh");
                  }}
                  onChanged={() => void fetchStatus("refresh")}
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default TOTPManager;
