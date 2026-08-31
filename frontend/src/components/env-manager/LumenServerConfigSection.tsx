import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

interface LumenServerConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  disabled?: boolean;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  values: Record<string, string>;
  bools: Record<string, boolean>;
  hasSecrets: Record<string, boolean>;
  devLoginCodeConfigured: boolean;
  updatedAt?: string;
  onValueChange: (field: string, value: string) => void;
  onBoolChange: (field: string, value: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';
const hintClass = 'mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600';
const selectClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:text-base';

interface FieldMeta {
  label: string;
  hint: string;
}

const TEXT_FIELDS: Record<string, FieldMeta> = {
  adminUsername: { label: 'LUMEN_ADMIN_USERNAME', hint: '管理端用户名（默认 admin）' },
  outemailApiUrl: { label: 'LUMEN_OUTEMAIL_API_URL', hint: '对外邮件 API 地址' },
  appVersion: { label: 'LUMEN_APP_VERSION', hint: 'Lumen 客户端版本号（默认 0.1.0）' },
  outemailFrom: { label: 'LUMEN_OUTEMAIL_FROM', hint: '对外邮件发件人（默认 noreply）' },
  outemailDisplayName: { label: 'LUMEN_OUTEMAIL_DISPLAY_NAME', hint: '对外邮件显示名（默认 Project Lumen）' },
  outemailDomain: { label: 'LUMEN_OUTEMAIL_DOMAIN', hint: '对外邮件域名' },
  outemailBaseUrl: { label: 'LUMEN_OUTEMAIL_BASE_URL', hint: 'Lumen 回调基址（默认 https://tts.chloemlla.com）' },
};

const NUM_FIELDS: Record<string, FieldMeta> = {
  sessionTtlDays: { label: 'LUMEN_SESSION_TTL_DAYS', hint: '会话有效天数（默认 90）' },
  loginCodeTtlSeconds: { label: 'LUMEN_LOGIN_CODE_TTL_SECONDS', hint: '登录码有效期秒（默认 300）' },
  adminSessionTtlSeconds: { label: 'LUMEN_ADMIN_SESSION_TTL_SECONDS', hint: '管理端会话秒（默认 3600）' },
  adminRefreshTtlSeconds: { label: 'LUMEN_ADMIN_REFRESH_TTL_SECONDS', hint: '管理端刷新秒（默认 604800）' },
  accessTokenTtlSeconds: { label: 'LUMEN_ACCESS_TOKEN_TTL_SECONDS', hint: '访问令牌秒（上限 7200）' },
  refreshTokenTtlSeconds: { label: 'LUMEN_REFRESH_TOKEN_TTL_SECONDS', hint: '刷新令牌秒（上限 2592000）' },
  requestTimestampSkewSeconds: { label: 'LUMEN_REQUEST_TIMESTAMP_SKEW_SECONDS', hint: '请求时间戳容差秒（上限 300）' },
  outemailTimeoutSeconds: { label: 'LUMEN_OUTEMAIL_TIMEOUT_SECONDS', hint: '对外邮件超时秒（默认 10）' },
};

const SECRET_FIELDS: Record<string, FieldMeta & { minLen: number }> = {
  adminPassword: { label: 'LUMEN_ADMIN_PASSWORD', hint: '管理端密码，>=12 字符；留空保持现有', minLen: 12 },
  adminAutomationToken: { label: 'LUMEN_ADMIN_AUTOMATION_TOKEN', hint: '自动化令牌（可选），>=12 字符', minLen: 12 },
  requestSigningSecret: { label: 'LUMEN_REQUEST_SIGNING_SECRET', hint: '请求签名密钥，>=32 字符；留空保持现有', minLen: 32 },
  outemailApiKey: { label: 'LUMEN_OUTEMAIL_API_KEY', hint: '对外邮件 API 密钥；留空保持现有', minLen: 1 },
};

const BOOL_FIELDS: Record<string, FieldMeta> = {
  enabled: { label: '启用 Lumen 服务', hint: '控制 /api/lumen 是否对外服务；环境变量 LUMEN_ENABLED 优先级更高' },
  requireRequestSigning: { label: 'LUMEN_REQUIRE_REQUEST_SIGNING', hint: '是否强制校验请求签名（默认 false）' },
  acceptUnverifiedPurchases: { label: 'LUMEN_ACCEPT_UNVERIFIED_PURCHASES', hint: '是否接受未验证购买凭证（默认 false）' },
  allowPublicReleaseCheck: { label: 'LUMEN_ALLOW_PUBLIC_RELEASE_CHECK', hint: '是否允许公开检查更新（默认 true）' },
};

function TextField({
  field,
  value,
  meta,
  disabled,
  onChange,
}: {
  field: string;
  value: string;
  meta: FieldMeta;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{meta.label}</label>
      <input
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className={inputClass}
      />
      <div className={hintClass}>{meta.hint}</div>
    </div>
  );
}

function NumberField({
  field,
  value,
  meta,
  disabled,
  onChange,
}: {
  field: string;
  value: string;
  meta: FieldMeta;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{meta.label}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        disabled={disabled}
        className={inputClass}
      />
      <div className={hintClass}>{meta.hint}</div>
    </div>
  );
}

function SecretField({
  field,
  value,
  meta,
  current,
  disabled,
  onChange,
}: {
  field: string;
  value: string;
  meta: FieldMeta & { minLen: number };
  current: string;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{meta.label}</label>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        disabled={disabled}
        placeholder="留空表示保持现有（不回显明文）"
        autoComplete="off"
        spellCheck={false}
        className={inputClass}
      />
      <div className={hintClass}>
        {meta.hint}；当前配置：{current}
      </div>
    </div>
  );
}

function BoolField({
  field,
  value,
  meta,
  disabled,
  onChange,
}: {
  field: string;
  value: boolean;
  meta: FieldMeta;
  disabled: boolean;
  onChange: (field: string, value: boolean) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{meta.label}</label>
      <select
        value={value ? 'true' : 'false'}
        onChange={(event) => onChange(field, event.target.value === 'true')}
        disabled={disabled}
        className={selectClass}
      >
        <option value="true">true（开启）</option>
        <option value="false">false（关闭）</option>
      </select>
      <div className={hintClass}>{meta.hint}</div>
    </div>
  );
}

export default function LumenServerConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  disabled = false,
  loading,
  saving,
  deleting,
  values,
  bools,
  hasSecrets,
  devLoginCodeConfigured,
  updatedAt,
  onValueChange,
  onBoolChange,
  onRefresh,
  onSave,
  onReset,
}: LumenServerConfigSectionProps) {
  const isDisabled = saving || deleting || disabled;

  return (
    <CollapsibleSection
      title="Lumen 服务端配置"
      description="管理 Project Lumen 服务端环境变量（LUMEN_*，作用于 /api/lumen 路由与校验中间件）。保存后立即生效，无需重启。与上方「Project Lumen 配置」区分：那是客户端构建/CI 变量（PROJECT_LUMEN_*）。"
      sectionKey="lumenServer"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
        <p>
          部署环境变量 <code className="mx-1 rounded bg-white/80 px-1">LUMEN_ENABLED=true</code> 是启用 Lumen 的最高优先级开关（进程启动时即判定）。
          在下方开启「启用 Lumen 服务」可在不重启的情况下生效；但启用时管理端密码、请求签名密钥与对外邮件密钥必须满足强度要求。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BoolField field="enabled" value={bools.enabled} meta={BOOL_FIELDS.enabled} disabled={disabled} onChange={onBoolChange} />
        <div>
          <label className={labelClass}>LUMEN_DEV_LOGIN_CODE</label>
          <input
            type="password"
            value={values.devLoginCode || ''}
            onChange={(event) => onValueChange('devLoginCode', event.target.value)}
            disabled={disabled}
            placeholder="仅开发环境使用"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <div className={hintClass}>
            通用登录后门，仅开发环境允许；生产环境保存会报错。当前配置：
            {devLoginCodeConfigured ? '已配置' : '未配置'}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">管理端凭证</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField field="adminUsername" value={values.adminUsername || ''} meta={TEXT_FIELDS.adminUsername} disabled={disabled} onChange={onValueChange} />
          <SecretField field="adminPassword" value={values.adminPassword || ''} meta={SECRET_FIELDS.adminPassword} current={hasSecrets.adminPassword ? '已设置' : '未设置'} disabled={disabled} onChange={onValueChange} />
          <SecretField field="adminAutomationToken" value={values.adminAutomationToken || ''} meta={SECRET_FIELDS.adminAutomationToken} current={hasSecrets.adminAutomationToken ? '已设置' : '未设置'} disabled={disabled} onChange={onValueChange} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">请求签名校验</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SecretField field="requestSigningSecret" value={values.requestSigningSecret || ''} meta={SECRET_FIELDS.requestSigningSecret} current={hasSecrets.requestSigningSecret ? '已设置' : '未设置'} disabled={disabled} onChange={onValueChange} />
          <BoolField field="requireRequestSigning" value={bools.requireRequestSigning} meta={BOOL_FIELDS.requireRequestSigning} disabled={disabled} onChange={onBoolChange} />
          <NumberField field="requestTimestampSkewSeconds" value={values.requestTimestampSkewSeconds || ''} meta={NUM_FIELDS.requestTimestampSkewSeconds} disabled={disabled} onChange={onValueChange} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">对外邮件（outemail）</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SecretField field="outemailApiKey" value={values.outemailApiKey || ''} meta={SECRET_FIELDS.outemailApiKey} current={hasSecrets.outemailApiKey ? '已设置' : '未设置'} disabled={disabled} onChange={onValueChange} />
          <TextField field="outemailApiUrl" value={values.outemailApiUrl || ''} meta={TEXT_FIELDS.outemailApiUrl} disabled={disabled} onChange={onValueChange} />
          <TextField field="outemailFrom" value={values.outemailFrom || ''} meta={TEXT_FIELDS.outemailFrom} disabled={disabled} onChange={onValueChange} />
          <TextField field="outemailDisplayName" value={values.outemailDisplayName || ''} meta={TEXT_FIELDS.outemailDisplayName} disabled={disabled} onChange={onValueChange} />
          <TextField field="outemailDomain" value={values.outemailDomain || ''} meta={TEXT_FIELDS.outemailDomain} disabled={disabled} onChange={onValueChange} />
          <NumberField field="outemailTimeoutSeconds" value={values.outemailTimeoutSeconds || ''} meta={NUM_FIELDS.outemailTimeoutSeconds} disabled={disabled} onChange={onValueChange} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">会话与令牌 TTL</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NumberField field="sessionTtlDays" value={values.sessionTtlDays || ''} meta={NUM_FIELDS.sessionTtlDays} disabled={disabled} onChange={onValueChange} />
          <NumberField field="loginCodeTtlSeconds" value={values.loginCodeTtlSeconds || ''} meta={NUM_FIELDS.loginCodeTtlSeconds} disabled={disabled} onChange={onValueChange} />
          <NumberField field="adminSessionTtlSeconds" value={values.adminSessionTtlSeconds || ''} meta={NUM_FIELDS.adminSessionTtlSeconds} disabled={disabled} onChange={onValueChange} />
          <NumberField field="adminRefreshTtlSeconds" value={values.adminRefreshTtlSeconds || ''} meta={NUM_FIELDS.adminRefreshTtlSeconds} disabled={disabled} onChange={onValueChange} />
          <NumberField field="accessTokenTtlSeconds" value={values.accessTokenTtlSeconds || ''} meta={NUM_FIELDS.accessTokenTtlSeconds} disabled={disabled} onChange={onValueChange} />
          <NumberField field="refreshTokenTtlSeconds" value={values.refreshTokenTtlSeconds || ''} meta={NUM_FIELDS.refreshTokenTtlSeconds} disabled={disabled} onChange={onValueChange} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">其他</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField field="appVersion" value={values.appVersion || ''} meta={TEXT_FIELDS.appVersion} disabled={disabled} onChange={onValueChange} />
          <TextField field="outemailBaseUrl" value={values.outemailBaseUrl || ''} meta={TEXT_FIELDS.outemailBaseUrl} disabled={disabled} onChange={onValueChange} />
          <BoolField field="acceptUnverifiedPurchases" value={bools.acceptUnverifiedPurchases} meta={BOOL_FIELDS.acceptUnverifiedPurchases} disabled={disabled} onChange={onBoolChange} />
          <BoolField field="allowPublicReleaseCheck" value={bools.allowPublicReleaseCheck} meta={BOOL_FIELDS.allowPublicReleaseCheck} disabled={disabled} onChange={onBoolChange} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <m.button
          onClick={onReset}
          disabled={isDisabled}
          className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50 disabled:opacity-40 disabled:cursor-not-allowed sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {deleting ? '重置中...' : '重置'}
        </m.button>
        <m.button
          onClick={onSave}
          disabled={isDisabled}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:opacity-40 disabled:cursor-not-allowed sm:px-4"
          whileTap={{ scale: 0.96 }}
        >
          {saving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}
