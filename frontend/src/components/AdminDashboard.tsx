import React, { useState, Suspense, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import UserManagement from "./UserManagement";
const AnnouncementManager = React.lazy(() => import("./AnnouncementManager"));
const EnvManager = React.lazy(() => import("./EnvManager"));
const MailSystemConfigManager = React.lazy(
  () => import("./MailSystemConfigManager"),
);
import { motion, AnimatePresence } from "framer-motion";
const LotteryAdmin = React.lazy(() => import("./LotteryAdmin"));
const OutEmail = React.lazy(() => import("./OutEmail"));
const ShortLinkManager = React.lazy(() => import("./ShortLinkManager"));
const ShortUrlMigrationManager = React.lazy(
  () => import("./ShortUrlMigrationManager"),
);
const CommandManager = React.lazy(() => import("./CommandManager"));
const WebhookEventsManager = React.lazy(() => import("./WebhookEventsManager"));
const LogShare = React.lazy(() => import("./LogShare"));
const FBIWantedManager = React.lazy(() => import("./FBIWantedManager"));
const DataCollectionManager = React.lazy(
  () => import("./DataCollectionManager"),
);
const EcoEnchantsAdminPage = React.lazy(() => import("./EcoEnchantsAdminPage"));
const LibreChatAdminPage = React.lazy(() => import("./LibreChatAdminPage"));
import { useAuth } from "../hooks/useAuth";
import { useNotification } from "./Notification";
import { getApiBaseUrl } from "../api/api";
import {
  FaCog,
  FaUsers,
  FaShieldAlt,
  FaSignOutAlt,
  FaCheckCircle,
} from "react-icons/fa";
import { SimpleLoadingSpinner } from "./LoadingSpinner";
import {
  InfoBadge,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  logShareSecondaryButtonClass,
} from "./LogShareStyleScaffold";
const SmartHumanCheckTraces = React.lazy(
  () => import("./SmartHumanCheckTraces"),
);
const GitHubBillingCacheManager = React.lazy(
  () => import("./GitHubBillingCacheManager"),
);
const IPBanManager = React.lazy(() => import("./IPBanManager"));
const FingerprintManager = React.lazy(() => import("./FingerprintManager"));
const SystemManager = React.lazy(() => import("./SystemManager"));
const BroadcastManager = React.lazy(() => import("./BroadcastManager"));
const ApiKeyManager = React.lazy(() => import("./ApiKeyManager"));
const OAuthClientManager = React.lazy(() => import("./OAuthClientManager"));
const AuditLogViewer = React.lazy(() => import("./AuditLogViewer"));
const TranslationAuditViewer = React.lazy(
  () => import("./TranslationAuditViewer"),
);

const LOADING_CARD_CLASS =
  "w-full rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl";
const LOADING_BADGE_CLASS =
  "mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500";
const LOADING_EYEBROW_CLASS =
  "mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400";

const AdminModuleLoadingShell: React.FC<{ label?: string }> = ({
  label = "正在加载管理模块内容...",
}) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10"
  >
    <div className={LOADING_CARD_CLASS}>
      <div className={LOADING_BADGE_CLASS}>
        <SimpleLoadingSpinner size={0.75} />
      </div>
      <div className={LOADING_EYEBROW_CLASS}>Synapse Route</div>
      <p className="mt-3 text-sm leading-7 text-slate-600">{label}</p>
    </div>
  </div>
);

const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState("users");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading, logout } = useAuth();
  const { setNotification } = useNotification();
  const navigate = useNavigate();

  const tabs = useMemo(
    () =>
      [
        { key: "users", label: "用户管理" },
        { key: "librechat", label: "LibreChat 管理" },
        { key: "ecoenchants", label: "EcoEnchants 授权" },
        { key: "announcement", label: "公告管理" },
        { key: "env", label: "环境变量" },
        { key: "mail-system", label: "邮件系统配置" },
        { key: "lottery", label: "抽奖管理" },
        { key: "outemail", label: "外部邮件" },
        { key: "shortlink", label: "短链管理" },
        { key: "shorturlmigration", label: "短链迁移" },
        { key: "command", label: "命令管理" },
        { key: "humancheck", label: "人机验证日志" },
        { key: "logshare", label: "日志分享" },
        { key: "fbiwanted", label: "FBI通缉犯管理" },
        { key: "webhookevents", label: "Webhook事件" },
        { key: "data-collection", label: "数据收集管理" },
        { key: "github-billing-cache", label: "GitHub账单缓存管理" },
        { key: "ip-ban", label: "IP封禁管理" },
        { key: "fingerprint", label: "指纹管理" },
        { key: "broadcast", label: "广播推送" },
        { key: "oauth", label: "OAuth 接入" },
        { key: "apikeys", label: "API Key 管理" },
        { key: "apikey-billing", label: "API Key 计费" },
        { key: "audit-log", label: "操作审计" },
        { key: "translation-audit", label: "翻译审计" },
        { key: "system", label: "系统管理" },
      ] as const,
    [],
  );

  // 多重权限验证
  useEffect(() => {
    const verifyAdminAccess = async () => {
      try {
        setIsLoading(true);

        if (loading) return;

        if (!user) {
          console.warn("[AdminDashboard] 未登录，重定向到登录页面");
          setNotification({ message: "请先登录", type: "warning" });
          navigate("/login");
          return;
        }

        if (user.role !== "admin") {
          console.warn("[AdminDashboard] 非管理员用户尝试访问管理后台", {
            userId: user.id,
            role: user.role,
          });
          setNotification({
            message: "权限不足，仅限管理员访问",
            type: "error",
          });
          navigate("/");
          return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
          console.warn("[AdminDashboard] Token不存在");
          setNotification({ message: "登录已过期，请重新登录", type: "error" });
          navigate("/login");
          return;
        }

        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/admin/verify-access`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                userId: user.id,
                username: user.username,
                role: user.role,
              }),
            },
          );

          if (!response.ok) throw new Error("后端权限验证失败");

          const result = await response.json();
          if (!result.success)
            throw new Error(result.message || "权限验证失败");

          console.log("[AdminDashboard] 权限验证通过", {
            userId: user.id,
            role: user.role,
          });
          setIsAuthorized(true);
        } catch (error) {
          console.error("[AdminDashboard] 后端权限验证失败:", error);
          setNotification({
            message: "权限验证失败，请重新登录",
            type: "error",
          });
          navigate("/login");
          return;
        }
      } catch (error) {
        console.error("[AdminDashboard] 权限验证过程中发生错误:", error);
        setNotification({ message: "权限验证失败", type: "error" });
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    verifyAdminAccess();
  }, [loading, user, navigate, setNotification]);

  // 定期检查权限（每5分钟）
  useEffect(() => {
    if (!isAuthorized) return;

    const interval = setInterval(
      async () => {
        try {
          const token = localStorage.getItem("token");
          if (!token) {
            console.warn("[AdminDashboard] 定期检查：Token不存在");
            setNotification({
              message: "登录已过期，请重新登录",
              type: "warning",
            });
            navigate("/login");
            return;
          }

          const response = await fetch(
            `${getApiBaseUrl()}/api/admin/verify-access`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                userId: user?.id,
                username: user?.username,
                role: user?.role,
              }),
            },
          );

          if (!response.ok) {
            console.warn("[AdminDashboard] 定期检查：权限验证失败");
            setNotification({
              message: "权限已失效，请重新登录",
              type: "warning",
            });
            navigate("/login");
          }
        } catch (error) {
          console.error("[AdminDashboard] 定期权限检查失败:", error);
        }
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [isAuthorized, user, navigate, setNotification]);

  // 加载状态
  if (isLoading) {
    return (
      <InfoQueryShell className="logshare-admin-surface">
        <InfoPanel>
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500">
                <SimpleLoadingSpinner size={0.75} />
              </div>
              <div className="mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400">
                Admin Access
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                正在验证管理员权限...
              </p>
            </div>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  // 未授权状态
  if (!isAuthorized) {
    return (
      <InfoQueryShell className="logshare-admin-surface">
        <InfoPanel className="border-rose-100">
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                <FaShieldAlt className="h-6 w-6" />
              </div>
              <div className="mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400">
                Access Denied
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                访问被拒绝
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                您没有权限访问管理后台。
              </p>
              <InfoPrimaryButton className="mt-6" onClick={() => navigate("/")}>
                返回首页
              </InfoPrimaryButton>
            </div>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  return (
    <InfoQueryShell className="logshare-admin-surface">
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Admin Console"
          title="管理后台"
          description="系统管理与配置中心，集中处理用户、权限、安全、商店、邮件、审计和运行状态。"
          icon={FaShieldAlt}
          tone="slate"
          meta={
            <>
              <InfoBadge tone="slate">管理员 {user?.username}</InfoBadge>
              <InfoBadge tone="emerald">权限已验证</InfoBadge>
              <InfoBadge tone="slate">{tabs.length} 个模块</InfoBadge>
            </>
          }
          actions={
            <button
              type="button"
              onClick={async () => {
                try {
                  await Promise.resolve(logout?.());
                } finally {
                  try {
                    localStorage.clear();
                  } catch {}
                  try {
                    (sessionStorage as any)?.clear?.();
                  } catch {}
                  navigate("/welcome", { replace: true });
                }
              }}
              className={logShareSecondaryButtonClass}
            >
              <FaSignOutAlt className="text-xs" />
              退出登录
            </button>
          }
        />

        <InfoPanel compact>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-slate-500">
                <FaUsers />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Current Admin
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {user?.username}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                ID: {user?.id}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                <FaCheckCircle className="text-[10px]" />
                Access Verified
              </span>
            </div>
          </div>
        </InfoPanel>

        {/* 管理功能区域 */}
        <motion.div
          className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-7"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div>
            <InfoSectionTitle title="管理功能" icon={FaCog} eyebrow="Modules" />
            <div
              className="mb-6 flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300/70 scrollbar-track-transparent"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {tabs.map((t) => (
                <motion.button
                  key={t.key}
                  className={`flex min-w-max items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                    tab === t.key
                      ? "bg-slate-900 text-white shadow-sm"
                      : "border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                  onClick={() => setTab(t.key)}
                  whileTap={{ scale: 0.96 }}
                  whileHover={tab !== t.key ? { y: -1 } : {}}
                >
                  <span>{t.label}</span>
                </motion.button>
              ))}
            </div>
            <div className="min-h-[400px] rounded-[26px] border border-slate-200 bg-white/60 p-3 sm:p-5">
              <AnimatePresence mode="wait">
                {tab === "users" && (
                  <motion.div
                    key="users"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <UserManagement />
                  </motion.div>
                )}
                {tab === "librechat" && (
                  <motion.div
                    key="librechat"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <LibreChatAdminPage />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "ecoenchants" && (
                  <motion.div
                    key="ecoenchants"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense
                      fallback={
                        <AdminModuleLoadingShell label="正在加载 EcoEnchants 授权管理..." />
                      }
                    >
                      <EcoEnchantsAdminPage />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "announcement" && (
                  <motion.div
                    key="announcement"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <AnnouncementManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "env" && (
                  <motion.div
                    key="env"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <EnvManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "mail-system" && (
                  <motion.div
                    key="mail-system"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense
                      fallback={
                        <AdminModuleLoadingShell label="正在加载后端邮件系统配置..." />
                      }
                    >
                      <MailSystemConfigManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "lottery" && (
                  <motion.div
                    key="lottery"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <LotteryAdmin />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "outemail" && (
                  <motion.div
                    key="outemail"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <OutEmail />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "shortlink" && (
                  <motion.div
                    key="shortlink"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <ShortLinkManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "shorturlmigration" && (
                  <motion.div
                    key="shorturlmigration"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <ShortUrlMigrationManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "webhookevents" && (
                  <motion.div
                    key="webhookevents"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <WebhookEventsManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "command" && (
                  <motion.div
                    key="command"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <CommandManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "humancheck" && (
                  <motion.div
                    key="humancheck"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <SmartHumanCheckTraces />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "logshare" && (
                  <motion.div
                    key="logshare"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <LogShare />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "fbiwanted" && (
                  <motion.div
                    key="fbiwanted"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <FBIWantedManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "data-collection" && (
                  <motion.div
                    key="data-collection"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <DataCollectionManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "github-billing-cache" && (
                  <motion.div
                    key="github-billing-cache"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <GitHubBillingCacheManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "ip-ban" && (
                  <motion.div
                    key="ip-ban"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <IPBanManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "fingerprint" && (
                  <motion.div
                    key="fingerprint"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <FingerprintManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "broadcast" && (
                  <motion.div
                    key="broadcast"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <BroadcastManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "apikeys" && (
                  <motion.div
                    key="apikeys"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <ApiKeyManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "oauth" && (
                  <motion.div
                    key="oauth"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell label="正在加载 OAuth 接入管理..." />}>
                      <OAuthClientManager />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "apikey-billing" && (
                  <motion.div
                    key="apikey-billing"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <ApiKeyManager initialView="billing" />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "audit-log" && (
                  <motion.div
                    key="audit-log"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <AuditLogViewer />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "translation-audit" && (
                  <motion.div
                    key="translation-audit"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <TranslationAuditViewer />
                    </Suspense>
                  </motion.div>
                )}
                {tab === "system" && (
                  <motion.div
                    key="system"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Suspense fallback={<AdminModuleLoadingShell />}>
                      <SystemManager />
                    </Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </InfoQueryShell>
  );
};

export default AdminDashboard;
