import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FaCheck,
  FaExternalLinkAlt,
  FaInfoCircle,
  FaKey,
  FaShieldAlt,
  FaSync,
  FaTimes,
  FaUserShield,
} from "react-icons/fa";
import { oauthApi, type OAuthAuthorizePreview } from "../api/oauth";
import { useNotification } from "./Notification";
import { cn } from "../utils/cn";
import { UnifiedLoadingSpinner } from "./LoadingSpinner";
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioDisplayFont,
  studioEyebrowPillClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioMetricToneClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
  studioStrongBadgeClassName,
} from "./studioTheme";

const formatScopeCategory = (category: string) => {
  const map: Record<string, string> = {
    identity: "身份",
    core: "核心",
    utility: "工具",
    content: "内容",
    system: "系统",
  };
  return map[category] || category;
};

const getErrorMessage = (error: any) => {
  const data = error?.response?.data;
  return (
    data?.error_description ||
    data?.error ||
    error?.message ||
    "授权请求无法处理"
  );
};

const buildLoginPath = (pathname: string, search: string) =>
  `/login?redirectTo=${encodeURIComponent(`${pathname}${search}`)}`;

const formatUserRole = (role: string) => {
  const map: Record<string, string> = {
    admin: "管理员",
    trusted: "信用者",
    user: "普通用户",
  };
  return map[role] || role || "未知角色";
};

const getRoleBadgeClass = (role: string) => {
  if (role === "admin") return "border-red-200 bg-red-50 text-red-700";
  if (role === "trusted")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const OAuthAuthorizePage: React.FC = () => {
  const location = useLocation();
  const { setNotification } = useNotification();
  const [preview, setPreview] = useState<OAuthAuthorizePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const queryString = useMemo(
    () => location.search.replace(/^\?/, ""),
    [location.search],
  );
  const loginPath = useMemo(
    () => buildLoginPath(location.pathname, location.search),
    [location.pathname, location.search],
  );

  const requestPayload = useCallback(
    (approve: boolean) => {
      const params = new URLSearchParams(location.search);
      const payload: Record<string, unknown> = { approve };
      params.forEach((value, key) => {
        payload[key] = value;
      });
      return payload;
    },
    [location.search],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      setStatusCode(null);

      if (!queryString) {
        setError("缺少 OAuth 授权参数");
        setLoading(false);
        return;
      }

      try {
        const data = await oauthApi.getAuthorizePreview(queryString);
        if (!cancelled) setPreview(data);
      } catch (err: any) {
        if (!cancelled) {
          setError(getErrorMessage(err));
          setStatusCode(err?.response?.status || null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const submit = async (approve: boolean) => {
    setSubmitting(approve ? "approve" : "deny");
    try {
      const result = await oauthApi.submitAuthorization(requestPayload(approve));
      window.location.assign(result.redirectUri);
    } catch (err: any) {
      const message = getErrorMessage(err);
      setError(message);
      setNotification({ message, type: "error" });
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
        <div className="flex min-h-[70vh] items-center justify-center">
          <UnifiedLoadingSpinner size="lg" text="读取 OAuth 授权请求..." />
        </div>
      </div>
    );
  }

  if (error || !preview) {
    const needsLogin = statusCode === 401;
    return (
      <div
        className={cn(studioPageClassName, "max-w-4xl")}
        style={{ fontFamily: studioPageFont }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className={cn(studioHeroCardClassName, "text-center")}
        >
          <div
            className={cn(studioAccentBlobBlueClassName, "-right-12 top-0")}
            aria-hidden
          />
          <div
            className={cn(studioAccentBlobSkyClassName, "-left-10 bottom-0")}
            aria-hidden
          />
          <div className="relative mx-auto max-w-2xl">
            <div className={cn("mx-auto mb-4 w-fit", studioEyebrowPillClassName)}>
              <FaShieldAlt />
              OAuth Authorization
            </div>
            <h1
              className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
              style={{ fontFamily: studioDisplayFont }}
            >
              OAuth 授权不可用
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">
              {error || "授权请求无效"}
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              {needsLogin ? (
                <Link
                  to={loginPath}
                  className={cn(studioPrimaryButtonClassName, "w-full sm:w-auto")}
                >
                  <FaUserShield />
                  登录授权账号
                </Link>
              ) : null}
              <Link
                to="/"
                className={cn(studioGhostButtonClassName, "w-full py-3 sm:w-auto")}
              >
                返回 Synapse
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const identityScopes = preview.scopeDetails.filter(
    (scope) => scope.identityScope,
  );
  const apiScopes = preview.scopeDetails.filter(
    (scope) => !scope.identityScope,
  );
  const roleLabel = formatUserRole(preview.user.role);
  const roleBadgeClass = getRoleBadgeClass(preview.user.role);
  const statusCards = [
    {
      label: "Client",
      value: preview.client.name,
      tone: "sky",
    },
    {
      label: "Account",
      value: roleLabel,
      tone: "emerald",
    },
    {
      label: "Scopes",
      value: `${preview.scopes.length} 项权限`,
      tone: "violet",
    },
  ] as const;

  return (
    <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
      <div className="mx-auto max-w-7xl min-w-0">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className={cn("mb-5 sm:mb-8", studioHeroCardClassName)}
        >
          <div
            className={cn(studioAccentBlobBlueClassName, "-right-12 top-0")}
            aria-hidden
          />
          <div
            className={cn(studioAccentBlobSkyClassName, "-left-10 bottom-0")}
            aria-hidden
          />
          <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl min-w-0">
              <div className={cn("mb-3", studioEyebrowPillClassName)}>
                <FaShieldAlt />
                OAuth Authorization
              </div>
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
                  {preview.client.logoUrl ? (
                    <img
                      src={preview.client.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FaKey />
                  )}
                </div>
                <div className="min-w-0">
                  <h1
                    className="break-words text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                    style={{ fontFamily: studioDisplayFont }}
                  >
                    OAuth 授权确认
                  </h1>
                  <p className="mt-3 break-words text-sm leading-7 text-slate-500">
                    {preview.client.name} 正在请求访问你的 Synapse 账号。
                  </p>
                </div>
              </div>
            </div>
            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                {statusCards.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3",
                      studioMetricToneClassName(item.tone),
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                      {item.label}
                    </div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className={studioMainSurfaceClassName}
          >
            <div className="rounded-[22px] border border-slate-200 bg-white/80 p-3 sm:p-5">
              <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Permission Review
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    授权范围
                  </h2>
                </div>
                {preview.client.homepageUrl ? (
                  <a
                    href={preview.client.homepageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={studioGhostButtonClassName}
                  >
                    <FaExternalLinkAlt />
                    应用主页
                  </a>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className={studioStrongBadgeClassName}>
                      <FaUserShield />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-slate-900">
                        授权账号
                      </div>
                      <div className="text-sm text-slate-500">
                        当前登录身份
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-w-0 flex-col gap-1 rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-500">用户名</span>
                      <span
                        className="break-all font-semibold text-slate-900"
                        title={preview.user.username}
                      >
                        {preview.user.username}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-500">邮箱</span>
                      <span
                        className="break-all font-semibold text-slate-900"
                        title={preview.user.email}
                      >
                        {preview.user.email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm">
                      <span className="text-slate-500">角色</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                          roleBadgeClass,
                        )}
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm">
                      <span className="text-slate-500">管理员权益</span>
                      <span className="font-semibold text-slate-900">
                        {preview.user.isAdmin ? "是" : "否"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className={studioStrongBadgeClassName}>
                      <FaKey />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-slate-900">
                        应用信息
                      </div>
                      <div className="text-sm text-slate-500">
                        OAuth 客户端
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm">
                      <div className="text-slate-500">应用名称</div>
                      <div className="mt-1 break-words font-semibold text-slate-900">
                        {preview.client.name}
                      </div>
                    </div>
                    {preview.client.description ? (
                      <div className="rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm">
                        <div className="text-slate-500">应用描述</div>
                        <div className="mt-1 break-words leading-7 text-slate-700">
                          {preview.client.description}
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-[20px] border border-slate-100 bg-white/80 px-3 py-3 text-sm">
                      <div className="text-slate-500">回调地址</div>
                      <code className="mt-2 block break-all text-xs text-slate-700">
                        {preview.redirectUri}
                      </code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    身份资料
                  </h3>
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {identityScopes.length} Items
                  </span>
                </div>
                {identityScopes.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {identityScopes.map((scope) => (
                      <div
                        key={scope.key}
                        className="min-w-0 rounded-[22px] border border-slate-200 bg-white/90 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-semibold text-slate-800">
                            {scope.label}
                          </span>
                          <code className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                            {scope.key}
                          </code>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          {scope.description}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-slate-400">
                    没有身份资料权限。
                  </div>
                )}
              </div>

              {apiScopes.length > 0 ? (
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      API 能力
                    </h3>
                    <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {apiScopes.length} Items
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {apiScopes.map((scope) => (
                      <div
                        key={scope.key}
                        className="min-w-0 rounded-[22px] border border-slate-200 bg-white/90 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {scope.label}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                              {formatScopeCategory(scope.category)}
                            </span>
                          </div>
                          <code className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                            {scope.key}
                          </code>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          {scope.description}
                        </p>
                        {scope.endpoints.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {scope.endpoints.map((endpoint) => (
                              <code
                                key={endpoint}
                                className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] text-slate-500"
                              >
                                {endpoint}
                              </code>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>

          <div className="min-w-0 space-y-4 sm:space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className={studioPanelClassName}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <FaCheck />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    授权操作
                  </div>
                  <div className="text-sm text-slate-500">
                    确认后将跳转回应用
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <motion.button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={Boolean(submitting)}
                  className={cn(studioPrimaryButtonClassName, "w-full")}
                  whileTap={{ scale: 0.98 }}
                >
                  {submitting === "approve" ? (
                    <FaSync className="animate-spin" />
                  ) : (
                    <FaCheck />
                  )}
                  {submitting === "approve" ? "正在同意..." : "同意授权"}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={Boolean(submitting)}
                  className={cn(
                    studioGhostButtonClassName,
                    "w-full border-rose-200 py-3 text-rose-600 hover:border-rose-300 hover:text-rose-700",
                  )}
                  whileTap={{ scale: 0.98 }}
                >
                  {submitting === "deny" ? (
                    <FaSync className="animate-spin" />
                  ) : (
                    <FaTimes />
                  )}
                  {submitting === "deny" ? "正在拒绝..." : "拒绝授权"}
                </motion.button>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className={studioPanelClassName}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <FaInfoCircle />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    当前摘要
                  </div>
                  <div className="text-sm text-slate-500">
                    OAuth 请求上下文
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-3 text-sm">
                  <span className="text-slate-500">授权码模式</span>
                  <code className="break-all text-xs font-semibold text-slate-900">
                    response_type=code
                  </code>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-3 text-sm">
                  <span className="text-slate-500">授权范围</span>
                  <code className="break-all text-xs font-semibold text-slate-900">
                    {preview.scopes.join(" ")}
                  </code>
                </div>
                <div className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-3 text-sm">
                  <span className="text-slate-500">管理员识别字段</span>
                  <code className="break-all text-xs font-semibold text-slate-900">
                    role / isAdmin / is_admin / synapseAdmin
                  </code>
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OAuthAuthorizePage;
