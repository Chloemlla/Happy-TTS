import { m } from "framer-motion";
import type { LinkedAccount, TotpStatus, UserProfileData } from "./profileHelpers";
import {
  formatDateTime,
  formatRelativeTime,
  getAuthProviderLabel,
  getLinkedAccountStatusLabel,
} from "./profileHelpers";
import {
  studioPanelClassName,
} from "../studioTheme";

interface ProfileSidebarSummaryProps {
  profile: UserProfileData | null;
  totpStatus: TotpStatus | null;
  linkedAccounts: LinkedAccount[];
}

export function ProfileSidebarSummary({
  profile,
  totpStatus,
  linkedAccounts,
}: ProfileSidebarSummaryProps) {
  return (
    <>
      {/* Account info */}
      <m.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className={studioPanelClassName}
      >
        <div className="mb-4">
          <div className="text-lg font-semibold text-slate-900">账户信息</div>
          <div className="text-sm text-slate-500">基础身份与登录轨迹</div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">用户名</span>
            <span className="font-medium text-slate-900">{profile?.username || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">邮箱</span>
            <span className="font-medium text-slate-900 break-all text-right">{profile?.email || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">角色</span>
            <span className="font-medium text-slate-900">{profile?.role || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">登录方式</span>
            <span className="font-medium text-slate-900">{getAuthProviderLabel(profile?.authProvider)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">注册时间</span>
            <span className="font-medium text-slate-900">{formatDateTime(profile?.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">最近登录</span>
            <span className="font-medium text-slate-900">{formatRelativeTime(profile?.lastLoginAt)}</span>
          </div>
        </div>
      </m.section>

      {/* Security status */}
      <m.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18 }}
        className={studioPanelClassName}
      >
        <div className="mb-4">
          <div className="text-lg font-semibold text-slate-900">安全状态</div>
          <div className="text-sm text-slate-500">当前账户安全配置</div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">账户状态</span>
            <span className="font-medium text-slate-900">{profile?.accountStatus || "active"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">TOTP</span>
            <span className="font-medium text-slate-900">{totpStatus?.enabled ? "已启用" : "未启用"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">Passkey</span>
            <span className="font-medium text-slate-900">{totpStatus?.hasPasskey ? "已配置" : "未配置"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">绑定账号数</span>
            <span className="font-medium text-slate-900">{linkedAccounts.length}</span>
          </div>
          {linkedAccounts.slice(0, 3).map((account) => (
            <div key={`${account.provider}-${account.providerUserId || account.label}`} className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{account.label}</span>
              <span className="font-medium text-slate-900">{getLinkedAccountStatusLabel(account.status)}</span>
            </div>
          ))}
        </div>
      </m.section>
    </>
  );
}
