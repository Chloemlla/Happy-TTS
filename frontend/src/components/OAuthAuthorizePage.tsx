import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FaCheck,
  FaExternalLinkAlt,
  FaInfoCircle,
  FaKey,
  FaShieldAlt,
  FaTimes,
  FaUserShield,
} from "react-icons/fa";
import { oauthApi, type OAuthAuthorizePreview } from "../api/oauth";
import { useNotification } from "./Notification";
import { SimpleLoadingSpinner } from "./LoadingSpinner";

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
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
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
      const result = await oauthApi.submitAuthorization(
        requestPayload(approve),
      );
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
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-10">
        <div className="w-full rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-sm">
          <SimpleLoadingSpinner size={0.75} />
          <p className="mt-4 text-sm text-slate-500">
            正在读取 OAuth 授权请求...
          </p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    const needsLogin = statusCode === 401;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <FaShieldAlt />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-slate-900">
                OAuth 授权不可用
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {error || "授权请求无效"}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {needsLogin && (
                  <Link
                    to={loginPath}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <FaUserShield /> 登录授权账号
                  </Link>
                )}
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  返回 Synapse
                </Link>
              </div>
            </div>
          </div>
        </div>
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
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
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  OAuth Authorization
                </div>
                <h1 className="mt-2 break-words text-2xl font-semibold text-slate-900 sm:text-3xl">
                  {preview.client.name}
                </h1>
                {preview.client.description && (
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {preview.client.description}
                  </p>
                )}
              </div>
            </div>
            {preview.client.homepageUrl && (
              <a
                href={preview.client.homepageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <FaExternalLinkAlt /> 应用主页
              </a>
            )}
          </div>

          <div className="mt-6 grid gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-400">
                回调地址
              </div>
              <code className="mt-2 block break-all text-slate-700">
                {preview.redirectUri}
              </code>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-800">
                <FaUserShield /> 授权账号
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadgeClass}`}
                >
                  {roleLabel}
                </span>
              </div>
              <div className="mt-2 grid min-w-0 gap-1 text-sm text-emerald-900 sm:grid-cols-2">
                <span
                  className="min-w-0 max-w-full break-all"
                  title={preview.user.username}
                >
                  {preview.user.username}
                </span>
                <span
                  className="min-w-0 max-w-full break-all"
                  title={preview.user.email}
                >
                  {preview.user.email}
                </span>
                <span className="min-w-0 max-w-full break-words">
                  角色: {roleLabel}
                </span>
                <span className="min-w-0 max-w-full break-words">
                  管理员权益: {preview.user.isAdmin ? "是" : "否"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">身份资料</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {identityScopes.map((scope) => (
                <div
                  key={scope.key}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-800">
                      {scope.label}
                    </span>
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                      {scope.key}
                    </code>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    {scope.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {apiScopes.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-slate-900">API 能力</h2>
              <div className="mt-3 grid gap-3">
                {apiScopes.map((scope) => (
                  <div
                    key={scope.key}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {scope.label}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">
                          {formatScopeCategory(scope.category)}
                        </span>
                      </div>
                      <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        {scope.key}
                      </code>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-slate-500">
                      {scope.description}
                    </p>
                    {scope.endpoints.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {scope.endpoints.map((endpoint) => (
                          <code
                            key={endpoint}
                            className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500"
                          >
                            {endpoint}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={() => submit(true)}
              disabled={Boolean(submitting)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.98 }}
            >
              {submitting === "approve" ? (
                <SimpleLoadingSpinner size={0.5} />
              ) : (
                <FaCheck />
              )}
              同意授权
            </motion.button>
            <motion.button
              type="button"
              onClick={() => submit(false)}
              disabled={Boolean(submitting)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.98 }}
            >
              {submitting === "deny" ? (
                <SimpleLoadingSpinner size={0.5} />
              ) : (
                <FaTimes />
              )}
              拒绝
            </motion.button>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FaInfoCircle className="text-slate-500" /> 授权结果
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-400">
                  授权码模式
                </div>
                <code className="mt-2 block break-all text-xs text-slate-700">
                  response_type=code
                </code>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-400">
                  授权范围
                </div>
                <code className="mt-2 block break-all text-xs text-slate-700">
                  {preview.scopes.join(" ")}
                </code>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-400">
                  管理员识别字段
                </div>
                <code className="mt-2 block break-all text-xs text-slate-700">
                  role / isAdmin / is_admin / synapseAdmin
                </code>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default OAuthAuthorizePage;
