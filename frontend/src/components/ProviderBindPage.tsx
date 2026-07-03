import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaCheck, FaClock, FaEnvelope, FaImage, FaLock, FaUser } from "react-icons/fa";
import getApiBaseUrl from "../api";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types/auth";
import { cn } from "../utils/cn";
import {
  authBackLinkClassName,
  authBrandBlockClassName,
  authBrandPillClassName,
  authBrandSubtitleClassName,
  authBrandTitleClassName,
  authCardBodyClassName,
  authCardClassName,
  authCheckboxClassName,
  authFieldClassName,
  authFieldIconClassName,
  authFrameClassName,
  authInfoPanelClassName,
  authLabelClassName,
  authPageShellClassName,
  authPasswordFieldClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
  authTextLinkClassName,
  authTitleClassName,
  authWideFrameClassName,
  studioPageFont,
} from "./authStudioTheme";
import { useNotification } from "./Notification";

type Provider = "google" | "linuxdo";

interface ProviderBindSession {
  sessionToken: string;
  provider: Provider;
  providerLabel: string;
  providerEmail: string | null;
  providerUsername: string | null;
  avatarUrl: string | null;
  expiresAt: string;
}

interface SessionResponse {
  success?: boolean;
  session?: ProviderBindSession;
  error?: string;
}

interface ConfirmResponse {
  success?: boolean;
  status?: "bound" | "refreshed" | "merge_required" | "conflict";
  token?: string;
  user?: User;
  provider?: Provider;
  mergeToken?: string;
  conflictReason?: string;
  error?: string;
}

const TERMS = [
  { key: "tos", label: "服务条款" },
  { key: "usage", label: "使用政策" },
  { key: "specific", label: "服务专项条款" },
  { key: "regions", label: "支持地区" },
] as const;

type TermKey = (typeof TERMS)[number]["key"];

const initialTerms = TERMS.reduce(
  (acc, item) => ({ ...acc, [item.key]: false }),
  {} as Record<TermKey, boolean>,
);

function formatRemainingTime(totalSeconds: number): string {
  const boundedSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = boundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const ProviderBindPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const { setNotification } = useNotification();
  const sessionToken = searchParams.get("sessionToken") || "";
  const [session, setSession] = useState<ProviderBindSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [syncUsername, setSyncUsername] = useState(true);
  const [syncAvatar, setSyncAvatar] = useState(true);
  const [terms, setTerms] = useState<Record<TermKey, boolean>>(initialTerms);
  const [now, setNow] = useState(Date.now());

  const allTermsAccepted = useMemo(
    () => TERMS.every((item) => terms[item.key]),
    [terms],
  );
  const acceptedTermCount = useMemo(
    () => TERMS.filter((item) => terms[item.key]).length,
    [terms],
  );
  const remainingSeconds = useMemo(() => {
    if (!session?.expiresAt) {
      return 0;
    }
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return 0;
    }
    return Math.max(0, Math.ceil((expiresAt - now) / 1000));
  }, [now, session?.expiresAt]);
  const sessionExpired = Boolean(session) && remainingSeconds <= 0;
  const providerEmailLabel = session?.provider === "linuxdo" ? "Linux.do 返回邮箱" : "Google 返回邮箱";

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!sessionToken) {
        setError("缺少第三方登录绑定会话，请返回登录页重试。");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/provider-bind/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ sessionToken }),
        });
        const data = (await response.json().catch(() => null)) as SessionResponse | null;

        if (!response.ok || !data?.session) {
          throw new Error(data?.error || "第三方登录绑定会话无效，请返回登录页重试。");
        }

        if (cancelled) {
          return;
        }

        setSession(data.session);
        setIdentifier(data.session.providerEmail || "");
        setEmailLocked(Boolean(data.session.providerEmail));
        setSyncUsername(Boolean(data.session.providerUsername));
        setSyncAvatar(Boolean(data.session.avatarUrl));
      } catch (sessionError) {
        if (!cancelled) {
          setError(sessionError instanceof Error ? sessionError.message : "第三方登录绑定会话加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.expiresAt]);

  const toggleTerm = (key: TermKey) => {
    setTerms((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleAllTerms = () => {
    const nextValue = !allTermsAccepted;
    setTerms(
      TERMS.reduce(
        (acc, item) => ({ ...acc, [item.key]: nextValue }),
        {} as Record<TermKey, boolean>,
      ),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) {
      return;
    }
    if (!allTermsAccepted) {
      setNotification({ message: "请先勾选全部服务条款确认项", type: "warning" });
      return;
    }
    if (sessionExpired) {
      setError("绑定会话已过期，请返回登录页重新发起第三方登录。");
      return;
    }
    if (!identifier.trim() || !password) {
      setError("请输入已有账号邮箱/用户名和密码。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/provider-bind/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          sessionToken: session.sessionToken,
          identifier: identifier.trim(),
          password,
          acceptedTerms: allTermsAccepted,
          syncProfile: {
            username: syncUsername,
            avatar: syncAvatar,
          },
        }),
      });
      const data = (await response.json().catch(() => null)) as ConfirmResponse | null;

      if (!response.ok || data?.status === "conflict") {
        throw new Error(data?.conflictReason || data?.error || "第三方登录绑定失败。");
      }
      if (!data?.token || !data?.user) {
        throw new Error(data?.error || "绑定完成后未返回登录凭证。");
      }

      await loginWithToken(data.token, data.user);
      setNotification({
        message:
          data.status === "merge_required"
            ? "已登录，需先处理账号合并预览"
            : `${session.providerLabel} 绑定并登录成功`,
        type: data.status === "merge_required" ? "warning" : "success",
      });

      if (data.status === "merge_required" && data.mergeToken) {
        navigate(`/profile?mergeToken=${encodeURIComponent(data.mergeToken)}`, { replace: true });
        return;
      }

      window.location.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "第三方登录绑定失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const renderLoading = () => (
    <div className={authCardClassName}>
      <div className={cn(authCardBodyClassName, "text-center")}>
        <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <h1 className="text-2xl font-semibold text-slate-900">正在登录</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          正在读取第三方登录资料。如果没有自动跳转，请返回登录页重试。
        </p>
        <Link to="/login" className={cn(authBackLinkClassName, "mt-6 justify-center")}>
          <FaArrowLeft className="h-3.5 w-3.5" />
          返回登录页
        </Link>
      </div>
    </div>
  );

  const renderError = () => (
    <div className={authCardClassName}>
      <div className={cn(authCardBodyClassName, "text-center")}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <FaLock className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900">无法继续绑定</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
        <Link to="/login" className={cn(authSecondaryButtonClassName, "mt-6 inline-flex justify-center")}>
          返回登录页
        </Link>
      </div>
    </div>
  );

  if (loading) {
    return <main className={cn(studioPageFont, authPageShellClassName)}><div className={authFrameClassName}>{renderLoading()}</div></main>;
  }

  if (!session) {
    return <main className={cn(studioPageFont, authPageShellClassName)}><div className={authFrameClassName}>{renderError()}</div></main>;
  }

  return (
    <main className={cn(studioPageFont, authPageShellClassName)}>
      <section className={authWideFrameClassName}>
        <div className={authBrandBlockClassName}>
          <div className={authBrandPillClassName}>{session.providerLabel} 登录</div>
          <h1 className={authBrandTitleClassName}>绑定已有账号</h1>
          <p className={authBrandSubtitleClassName}>
            需要登录一个已有账号，才能绑定这次 {session.providerLabel} 登录。
          </p>
        </div>

        <form className={authCardClassName} onSubmit={handleSubmit}>
          <div className={authCardBodyClassName}>
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {session.avatarUrl ? (
                    <img
                      src={session.avatarUrl}
                      alt={`${session.providerLabel} 头像`}
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                      <FaUser className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className={authTitleClassName}>{session.providerLabel} 资料</h2>
                    <p className="mt-1 truncate text-sm font-medium text-slate-700">
                      {session.providerUsername || "未返回昵称"}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold sm:self-center",
                    sessionExpired
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  <FaClock className="h-3.5 w-3.5" />
                  {sessionExpired ? "会话已过期" : `剩余 ${formatRemainingTime(remainingSeconds)}`}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">{providerEmailLabel}</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">
                  {session.providerEmail || "未返回邮箱"}
                </p>
              </div>
            </div>

            <div className={cn(authInfoPanelClassName, "space-y-3")}>
              <p className="text-sm font-semibold text-slate-900">
                是否将 {session.providerLabel} 资料同步到当前账号
              </p>
              {session.providerUsername ? (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 transition",
                    syncUsername ? "border-slate-900 bg-white text-slate-900" : "border-slate-200 bg-white/70 text-slate-700",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={syncUsername}
                    onChange={(event) => setSyncUsername(event.target.checked)}
                    className={cn(authCheckboxClassName, "mt-1")}
                  />
                  <span>使用 {session.providerLabel} 昵称：{session.providerUsername}</span>
                </label>
              ) : null}
              {session.avatarUrl ? (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 transition",
                    syncAvatar ? "border-slate-900 bg-white text-slate-900" : "border-slate-200 bg-white/70 text-slate-700",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={syncAvatar}
                    onChange={(event) => setSyncAvatar(event.target.checked)}
                    className={cn(authCheckboxClassName, "mt-1")}
                  />
                  <span className="inline-flex items-center gap-2">
                    <FaImage className="h-3.5 w-3.5 text-slate-400" />
                    使用 {session.providerLabel} 头像
                  </span>
                </label>
              ) : null}
              {!session.providerUsername && !session.avatarUrl ? (
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-600">
                  第三方账号未返回可同步的昵称或头像。
                </div>
              ) : null}
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="provider-bind-identifier" className={authLabelClassName}>
                  已有账号邮箱或用户名
                </label>
                <div className="relative">
                  <FaEnvelope className={authFieldIconClassName} />
                  <input
                    id="provider-bind-identifier"
                    type="text"
                    value={identifier}
                    readOnly={emailLocked}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className={cn(authFieldClassName, emailLocked && "bg-slate-50 text-slate-500")}
                    autoComplete="username"
                    autoFocus={!emailLocked}
                    required
                  />
                </div>
                {emailLocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifier("");
                      setEmailLocked(false);
                    }}
                    className={cn(authTextLinkClassName, "mt-2 text-xs")}
                  >
                    使用其他邮箱
                  </button>
                ) : null}
              </div>

              <div>
                <label htmlFor="provider-bind-password" className={authLabelClassName}>
                  账号密码
                </label>
                <div className="relative">
                  <FaLock className={authFieldIconClassName} />
                  <input
                    id="provider-bind-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={authPasswordFieldClassName}
                    autoComplete="current-password"
                    autoFocus={emailLocked}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">条款确认</p>
                  <p className="mt-1 text-xs text-slate-500">已勾选 {acceptedTermCount}/{TERMS.length}</p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllTerms}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  {allTermsAccepted ? "取消全选" : "全部勾选"}
                </button>
              </div>
              <div className="space-y-3">
                {TERMS.map((item) => (
                  <label key={item.key} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                    <input
                      type="checkbox"
                      checked={terms[item.key]}
                      onChange={() => toggleTerm(item.key)}
                      className={cn(authCheckboxClassName, "mt-1")}
                    />
                    <span>
                      我已阅读并同意
                      <Link to="/policy" className={cn(authTextLinkClassName, "ml-1")} target="_blank">
                        {item.label}
                      </Link>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || sessionExpired || !allTermsAccepted || !identifier.trim() || !password}
              className={cn(authPrimaryButtonClassName, "mt-6 inline-flex items-center justify-center gap-2")}
            >
              {sessionExpired ? "绑定会话已过期" : submitting ? "正在绑定..." : (
                <>
                  <FaCheck className="h-3.5 w-3.5" />
                  登录并绑定
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-5 text-center">
          <Link to="/login" className={authBackLinkClassName}>
            <FaArrowLeft className="h-3.5 w-3.5" />
            返回登录页
          </Link>
        </div>
      </section>
    </main>
  );
};

export default ProviderBindPage;
