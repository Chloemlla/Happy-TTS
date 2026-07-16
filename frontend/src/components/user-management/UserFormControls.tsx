import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { startAuthentication } from '@simplewebauthn/browser';
import { passkeyApi } from '../../api/passkey';
import {
  FaUser,
  FaKey,
  FaShieldAlt,
  FaCog,
  FaSave,
  FaTimes,
  FaTrash,
  FaEdit,
  FaUserPlus,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';

interface FingerprintRecord {
  id: string;
  ts: number;
  ua?: string;
  ip?: string;
  deviceInfo?: Record<string, unknown>;
}

interface PasskeyCredential {
  id: string;
  name: string;
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  createdAt: string;
  dailyUsage?: number;
  lastUsageDate?: string;
  token?: string;
  tokenExpiresAt?: number;
  totpSecret?: string;
  totpEnabled?: boolean;
  backupCodes?: string[];
  passkeyEnabled?: boolean;
  passkeyCredentials?: PasskeyCredential[];
  pendingChallenge?: string;
  currentChallenge?: string;
  passkeyVerified?: boolean;
  avatarUrl?: string;
  authProvider?: 'local' | 'linuxdo' | 'google';
  linuxdoId?: string;
  linuxdoUsername?: string;
  linuxdoAvatarUrl?: string;
  requireFingerprint?: boolean;
  requireFingerprintAt?: number;
  fingerprintRequestDismissedOnce?: boolean;
  fingerprintRequestDismissedAt?: number;
  fingerprints?: FingerprintRecord[];
  fingerprintCount?: number;
  latestFingerprint?: FingerprintRecord | null;
  lastLoginIp?: string;
  lastLoginAt?: string;
  // 工单违规处罚相关
  ticketViolationCount?: number;
  ticketBannedUntil?: string;
  // 翻译权限与账户状态
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: 'active' | 'suspended';
}

export type UserFormChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
export type UserFormChangeHandler = (event: UserFormChangeEvent) => void;
export type MotionScaleHandler = (scale: number, enabled?: boolean) => { scale: number } | undefined;
export type CollapsibleSectionKey = 'token' | 'security' | 'fingerprint' | 'backupCodes';
export type CollapsedSectionState = Record<CollapsibleSectionKey, boolean>;

export type UserListRoleFilter = 'all' | 'user' | 'admin' | 'trusted';
export type UserListAccountStatusFilter = 'all' | 'active' | 'suspended';
export type UserListSecurityFilter = 'all' | 'totp' | 'passkey' | 'fingerprintRequired' | 'noMfa';
export type UserListTicketFilter = 'all' | 'normal' | 'violated' | 'banned';
export type UserListTranslationFilter = 'all' | 'enabled' | 'disabled' | 'limited';
export type UserListSortOrder = 'asc' | 'desc';
export type BulkUserAction =
  | 'resetDailyUsage'
  | 'requireFingerprint'
  | 'clearFingerprintRequirement'
  | 'suspend'
  | 'activate'
  | 'enableTranslation'
  | 'disableTranslation'
  | 'clearTranslationRestrictions'
  | 'clearTicketRestrictions'
  | 'resetMfa';

export interface UserListFilters {
  keyword: string;
  role: UserListRoleFilter;
  accountStatus: UserListAccountStatusFilter;
  security: UserListSecurityFilter;
  ticket: UserListTicketFilter;
  translation: UserListTranslationFilter;
  sortBy: string;
  sortOrder: UserListSortOrder;
  pageSize: number;
}

export interface UserListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserListStats {
  total: number;
  users: number;
  admins: number;
  trusted: number;
  active: number;
  suspended: number;
  totpEnabled: number;
  passkeyEnabled: number;
  fingerprintRequired: number;
  withFingerprints: number;
  ticketViolated: number;
  ticketBanned: number;
  translationDisabled: number;
  translationLimited: number;
  totalDailyUsage: number;
}

export type UserFormSectionProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  contentClassName?: string;
};

export type UserTextFieldProps = {
  label: string;
  name: keyof User;
  value: string | number;
  onChange: UserFormChangeHandler;
  type?: 'text' | 'password' | 'email' | 'number';
  placeholder?: string;
  hint?: string;
};

export type UserSelectFieldProps = {
  label: string;
  name: keyof User;
  value: string;
  onChange: UserFormChangeHandler;
  options: Array<{ value: string; label: string }>;
};

export type UserCheckboxFieldProps = {
  label: string;
  name: keyof User;
  checked: boolean;
  onChange: UserFormChangeHandler;
  hint?: string;
};

type SharedUserFormProps = {
  form: User;
  loading: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  onFieldChange: UserFormChangeHandler;
  onBackupCodesChange: (value: string) => void;
  collapsedSections: CollapsedSectionState;
  onToggleSection: (section: CollapsibleSectionKey) => void;
  hoverScale: MotionScaleHandler;
  tapScale: MotionScaleHandler;
};

const ROLE_OPTIONS = [
  { value: 'user', label: '普通用户' },
  { value: 'trusted', label: '信用者' },
  { value: 'admin', label: '管理员' },
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'active', label: '正常' },
  { value: 'suspended', label: '封停' },
];

export const DEFAULT_USER_LIST_FILTERS: UserListFilters = {
  keyword: '',
  role: 'all',
  accountStatus: 'all',
  security: 'all',
  ticket: 'all',
  translation: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  pageSize: 20,
};

export const getAdminPasskeyAuthResponse = async (username: string) => {
  const optionsResponse = await passkeyApi.startAuthentication(username);
  const options = optionsResponse?.data?.options;
  if (!options) throw new Error('无法获取 Passkey 认证选项');
  return startAuthentication({ optionsJSON: options });
};

export const DEFAULT_PAGINATION: UserListPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

export const DEFAULT_STATS: UserListStats = {
  total: 0,
  users: 0,
  admins: 0,
  trusted: 0,
  active: 0,
  suspended: 0,
  totpEnabled: 0,
  passkeyEnabled: 0,
  fingerprintRequired: 0,
  withFingerprints: 0,
  ticketViolated: 0,
  ticketBanned: 0,
  translationDisabled: 0,
  translationLimited: 0,
  totalDailyUsage: 0,
};

export const ROLE_FILTER_OPTIONS: Array<{ value: UserListRoleFilter; label: string }> = [
  { value: 'all', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'trusted', label: '信用者' },
  { value: 'user', label: '普通用户' },
];

export const ACCOUNT_STATUS_FILTER_OPTIONS: Array<{ value: UserListAccountStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'suspended', label: '封停' },
];

export const SECURITY_FILTER_OPTIONS: Array<{ value: UserListSecurityFilter; label: string }> = [
  { value: 'all', label: '全部安全状态' },
  { value: 'totp', label: 'TOTP' },
  { value: 'passkey', label: 'Passkey' },
  { value: 'fingerprintRequired', label: '需指纹上报' },
  { value: 'noMfa', label: '未启用 MFA' },
];

export const TICKET_FILTER_OPTIONS: Array<{ value: UserListTicketFilter; label: string }> = [
  { value: 'all', label: '全部工单状态' },
  { value: 'normal', label: '工单正常' },
  { value: 'violated', label: '有违规记录' },
  { value: 'banned', label: '工单封禁中' },
];

export const TRANSLATION_FILTER_OPTIONS: Array<{ value: UserListTranslationFilter; label: string }> = [
  { value: 'all', label: '全部翻译权限' },
  { value: 'enabled', label: '翻译启用' },
  { value: 'disabled', label: '翻译停用' },
  { value: 'limited', label: '翻译限制中' },
];

export const SORT_OPTIONS = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'username', label: '用户名' },
  { value: 'email', label: '邮箱' },
  { value: 'dailyUsage', label: '今日用量' },
  { value: 'lastLoginAt', label: '最后登录' },
  { value: 'ticketViolationCount', label: '工单违规' },
];

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export const BULK_ACTION_OPTIONS: Array<{ value: BulkUserAction; label: string; confirm: string }> = [
  { value: 'resetDailyUsage', label: '重置今日用量', confirm: '确定要重置所选用户今日用量吗？' },
  { value: 'requireFingerprint', label: '要求指纹上报', confirm: '确定要求所选用户下次上报指纹吗？' },
  { value: 'clearFingerprintRequirement', label: '取消指纹要求', confirm: '确定取消所选用户的指纹上报要求吗？' },
  { value: 'suspend', label: '封停账户', confirm: '确定封停所选用户吗？' },
  { value: 'activate', label: '恢复账户', confirm: '确定恢复所选用户账户吗？' },
  { value: 'enableTranslation', label: '启用翻译', confirm: '确定启用所选用户的翻译页面权限吗？' },
  { value: 'disableTranslation', label: '停用翻译', confirm: '确定停用所选用户的翻译页面权限吗？' },
  { value: 'clearTranslationRestrictions', label: '清除翻译限制', confirm: '确定清除所选用户的翻译限制吗？' },
  { value: 'clearTicketRestrictions', label: '清除工单限制', confirm: '确定清除所选用户的工单违规和封禁状态吗？' },
  { value: 'resetMfa', label: '重置 MFA', confirm: '确定重置所选用户的 TOTP、备份码和 Passkey 吗？' },
];

export const createDefaultCollapsedSections = (): CollapsedSectionState => ({
  token: true,
  security: true,
  fingerprint: true,
  backupCodes: true,
});

export const parseBackupCodes = (value: string): string[] => (
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
);

export const getLatestFingerprint = (fingerprints?: FingerprintRecord[] | null): FingerprintRecord | null => {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) return null;
  return fingerprints.reduce((latest, current) => (
    Number(current.ts || 0) > Number(latest.ts || 0) ? current : latest
  ), fingerprints[0]);
};

export const getUserFingerprintCount = (user: User): number => {
  if (typeof user.fingerprintCount === 'number') return user.fingerprintCount;
  return Array.isArray(user.fingerprints) ? user.fingerprints.length : 0;
};

export const buildFingerprintListPatch = (fingerprints: FingerprintRecord[]) => ({
  fingerprints: undefined,
  fingerprintCount: fingerprints.length,
  latestFingerprint: getLatestFingerprint(fingerprints),
});

export const UserFormSection: React.FC<UserFormSectionProps> = ({
  title,
  icon,
  children,
  collapsed = false,
  onToggle,
  contentClassName = 'px-4 pb-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border-t border-gray-100',
}) => {
  const headerContent = (
    <span className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
      {icon}
      {title}
    </span>
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {onToggle ? (
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          onClick={onToggle}
        >
          {headerContent}
          {collapsed
            ? <FaChevronDown className="text-gray-400 text-xs" />
            : <FaChevronUp className="text-gray-400 text-xs" />}
        </button>
      ) : (
        <div className="w-full flex items-center justify-between px-4 py-3 bg-white">
          {headerContent}
        </div>
      )}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={contentClassName}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const UserTextField: React.FC<UserTextFieldProps> = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}) => (
  <div>
    <label className="block text-sm font-semibold text-gray-600 mb-1">
      {label}
      {hint && <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
    <input
      type={type}
      name={String(name)}
      value={String(value ?? '')}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
    />
  </div>
);

export const UserSelectField: React.FC<UserSelectFieldProps> = ({
  label,
  name,
  value,
  onChange,
  options,
}) => (
  <div>
    <label className="block text-sm font-semibold text-gray-600 mb-1">{label}</label>
    <select
      name={String(name)}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all appearance-none bg-white text-sm"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
);

export const UserCheckboxField: React.FC<UserCheckboxFieldProps> = ({
  label,
  name,
  checked,
  onChange,
  hint,
}) => (
  <div>
    <label className="block text-sm font-semibold text-gray-600 mb-1">
      {label}
      {hint && <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        name={String(name)}
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm text-gray-600">{checked ? '是' : '否'}</span>
    </label>
  </div>
);

const IdentitySection: React.FC<{
  mode: 'create' | 'edit';
  form: User;
  onFieldChange: UserFormChangeHandler;
}> = ({ mode, form, onFieldChange }) => (
  <UserFormSection
    title="基本信息"
    icon={<FaUser className="text-blue-500" />}
  >
    <UserTextField
      label="用户名"
      name="username"
      value={form.username ?? ''}
      onChange={onFieldChange}
      placeholder="3-20位字母数字下划线"
    />
    <UserTextField
      label="邮箱"
      name="email"
      value={form.email ?? ''}
      onChange={onFieldChange}
      type="email"
      placeholder="请输入邮箱"
    />
    <UserTextField
      label="密码"
      name="password"
      value={form.password ?? ''}
      onChange={onFieldChange}
      type="password"
      placeholder={mode === 'edit' ? '留空则不修改' : '请输入初始密码'}
      hint={mode === 'edit' ? '（留空不修改）' : undefined}
    />
    <UserSelectField
      label="角色"
      name="role"
      value={String(form.role ?? 'user')}
      onChange={onFieldChange}
      options={ROLE_OPTIONS}
    />
    <UserTextField
      label="头像URL"
      name="avatarUrl"
      value={form.avatarUrl ?? ''}
      onChange={onFieldChange}
      placeholder="用户头像图片URL"
    />
    <UserTextField
      label="今日使用次数"
      name="dailyUsage"
      value={form.dailyUsage ?? 0}
      onChange={onFieldChange}
      type="number"
      placeholder="0"
    />
    <UserTextField
      label="最后使用日期"
      name="lastUsageDate"
      value={form.lastUsageDate ?? ''}
      onChange={onFieldChange}
      placeholder="ISO 日期字符串"
    />
  </UserFormSection>
);

const TokenSection: React.FC<{
  form: User;
  onFieldChange: UserFormChangeHandler;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ form, onFieldChange, collapsed, onToggle }) => (
  <UserFormSection
    title="Token 信息"
    icon={<FaKey className="text-yellow-500" />}
    collapsed={collapsed}
    onToggle={onToggle}
  >
    <UserTextField
      label="Token"
      name="token"
      value={form.token ?? ''}
      onChange={onFieldChange}
      placeholder="当前有效Token"
    />
    <UserTextField
      label="Token 过期时间戳"
      name="tokenExpiresAt"
      value={form.tokenExpiresAt ?? 0}
      onChange={onFieldChange}
      type="number"
      placeholder="毫秒时间戳，0=立即过期"
    />
  </UserFormSection>
);

const SecuritySection: React.FC<{
  form: User;
  onFieldChange: UserFormChangeHandler;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ form, onFieldChange, collapsed, onToggle }) => (
  <UserFormSection
    title="安全配置"
    icon={<FaShieldAlt className="text-green-500" />}
    collapsed={collapsed}
    onToggle={onToggle}
    contentClassName="px-4 pb-4 pt-2 bg-white border-t border-gray-100 space-y-5"
  >
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-400">TOTP 两步验证</div>
      <UserCheckboxField
        label="启用 TOTP"
        name="totpEnabled"
        checked={Boolean(form.totpEnabled)}
        onChange={onFieldChange}
      />
      <UserTextField
        label="TOTP 密钥"
        name="totpSecret"
        value={form.totpSecret ?? ''}
        onChange={onFieldChange}
        placeholder="Base32 密钥"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-5">
      <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Passkey 配置</div>
      <UserCheckboxField
        label="启用 Passkey"
        name="passkeyEnabled"
        checked={Boolean(form.passkeyEnabled)}
        onChange={onFieldChange}
      />
      <UserCheckboxField
        label="Passkey 已验证"
        name="passkeyVerified"
        checked={Boolean(form.passkeyVerified)}
        onChange={onFieldChange}
      />
      <UserTextField
        label="Pending Challenge"
        name="pendingChallenge"
        value={form.pendingChallenge ?? ''}
        onChange={onFieldChange}
        placeholder="WebAuthn 挑战"
      />
      <UserTextField
        label="Current Challenge"
        name="currentChallenge"
        value={form.currentChallenge ?? ''}
        onChange={onFieldChange}
        placeholder="WebAuthn 当前挑战"
      />
    </div>
  </UserFormSection>
);

const FingerprintSection: React.FC<{
  form: User;
  onFieldChange: UserFormChangeHandler;
  collapsed: boolean;
  onToggle: () => void;
}> = ({ form, onFieldChange, collapsed, onToggle }) => (
  <UserFormSection
    title="指纹配置"
    icon={<FaCog className="text-red-500" />}
    collapsed={collapsed}
    onToggle={onToggle}
  >
    <UserCheckboxField
      label="要求上报指纹"
      name="requireFingerprint"
      checked={Boolean(form.requireFingerprint)}
      onChange={onFieldChange}
    />
    <UserTextField
      label="指纹预约时间戳"
      name="requireFingerprintAt"
      value={form.requireFingerprintAt ?? 0}
      onChange={onFieldChange}
      type="number"
      placeholder="毫秒时间戳"
    />
    <UserCheckboxField
      label="已关闭一次指纹请求"
      name="fingerprintRequestDismissedOnce"
      checked={Boolean(form.fingerprintRequestDismissedOnce)}
      onChange={onFieldChange}
    />
    <UserTextField
      label="关闭指纹请求时间戳"
      name="fingerprintRequestDismissedAt"
      value={form.fingerprintRequestDismissedAt ?? 0}
      onChange={onFieldChange}
      type="number"
      placeholder="毫秒时间戳"
    />
  </UserFormSection>
);

const TicketRestrictionSection: React.FC<{
  form: User;
  onFieldChange: UserFormChangeHandler;
}> = ({ form, onFieldChange }) => (
  <UserFormSection
    title="工单限制管理"
    icon={<FaShieldAlt className="text-orange-500" />}
  >
    <UserTextField
      label="工单违规次数"
      name="ticketViolationCount"
      value={form.ticketViolationCount ?? 0}
      onChange={onFieldChange}
      type="number"
      placeholder="0"
    />
    <UserTextField
      label="工单封禁截止"
      name="ticketBannedUntil"
      value={form.ticketBannedUntil ?? ''}
      onChange={onFieldChange}
      placeholder="ISO 日期字符串，留空解除"
    />
  </UserFormSection>
);

const TranslationAccessSection: React.FC<{
  form: User;
  onFieldChange: UserFormChangeHandler;
}> = ({ form, onFieldChange }) => (
  <UserFormSection
    title="翻译权限管理"
    icon={<FaShieldAlt className="text-cyan-500" />}
  >
    <UserCheckboxField
      label="启用翻译页面"
      name="isTranslationEnabled"
      checked={Boolean(form.isTranslationEnabled)}
      onChange={onFieldChange}
    />
    <UserTextField
      label="翻译限制截止"
      name="translationAccessUntil"
      value={form.translationAccessUntil ?? ''}
      onChange={onFieldChange}
      placeholder="ISO 日期字符串，留空表示无限制"
    />
    <UserSelectField
      label="账户状态"
      name="accountStatus"
      value={String(form.accountStatus ?? 'active')}
      onChange={onFieldChange}
      options={ACCOUNT_STATUS_OPTIONS}
    />
  </UserFormSection>
);

const BackupCodesSection: React.FC<{
  backupCodes: string[];
  collapsed: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}> = ({ backupCodes, collapsed, onToggle, onChange }) => (
  <UserFormSection
    title="备份码（backupCodes）"
    icon={<FaKey className="text-orange-500" />}
    collapsed={collapsed}
    onToggle={onToggle}
    contentClassName="px-4 pb-4 pt-2 bg-white border-t border-gray-100"
  >
    <label className="block text-sm font-semibold text-gray-600 mb-1">
      备份码（每行一个）
    </label>
    <textarea
      rows={4}
      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm font-mono"
      value={backupCodes.join('\n')}
      onChange={event => onChange(event.target.value)}
      placeholder="每行一个备份码"
    />
  </UserFormSection>
);

export const UserFormScaffold: React.FC<{
  title: string;
  icon: React.ReactNode;
  submitLabel: string;
  loading: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  hoverScale: MotionScaleHandler;
  tapScale: MotionScaleHandler;
  children: React.ReactNode;
}> = ({
  title,
  icon,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
  hoverScale,
  tapScale,
  children,
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <h4 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
      {icon}
      {title}
    </h4>

    {children}

    <div className="flex gap-3 pt-2">
      <motion.button
        type="submit"
        disabled={loading}
        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 disabled:opacity-60"
        whileHover={hoverScale(1.02)}
        whileTap={tapScale(0.95)}
      >
        <FaSave />
        {submitLabel}
      </motion.button>
      <motion.button
        type="button"
        className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium flex items-center gap-2"
        onClick={onCancel}
        whileHover={hoverScale(1.02)}
        whileTap={tapScale(0.95)}
      >
        <FaTimes />
        取消
      </motion.button>
    </div>
  </form>
);

export const CreateUserForm: React.FC<SharedUserFormProps> = ({
  form,
  loading,
  onSubmit,
  onCancel,
  onFieldChange,
  onBackupCodesChange,
  collapsedSections,
  onToggleSection,
  hoverScale,
  tapScale,
}) => (
  <UserFormScaffold
    title="新增用户"
    icon={<FaUserPlus className="text-blue-500" />}
    submitLabel="添加用户"
    loading={loading}
    onSubmit={onSubmit}
    onCancel={onCancel}
    hoverScale={hoverScale}
    tapScale={tapScale}
  >
    <IdentitySection mode="create" form={form} onFieldChange={onFieldChange} />
    <TokenSection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.token}
      onToggle={() => onToggleSection('token')}
    />
    <SecuritySection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.security}
      onToggle={() => onToggleSection('security')}
    />
    <FingerprintSection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.fingerprint}
      onToggle={() => onToggleSection('fingerprint')}
    />
    <TicketRestrictionSection form={form} onFieldChange={onFieldChange} />
    <TranslationAccessSection form={form} onFieldChange={onFieldChange} />
    <BackupCodesSection
      backupCodes={form.backupCodes || []}
      collapsed={collapsedSections.backupCodes}
      onToggle={() => onToggleSection('backupCodes')}
      onChange={onBackupCodesChange}
    />
  </UserFormScaffold>
);

export const EditUserForm: React.FC<SharedUserFormProps & { username: string }> = ({
  username,
  form,
  loading,
  onSubmit,
  onCancel,
  onFieldChange,
  onBackupCodesChange,
  collapsedSections,
  onToggleSection,
  hoverScale,
  tapScale,
}) => (
  <UserFormScaffold
    title={`编辑用户：${username}`}
    icon={<FaEdit className="text-yellow-500" />}
    submitLabel="保存修改"
    loading={loading}
    onSubmit={onSubmit}
    onCancel={onCancel}
    hoverScale={hoverScale}
    tapScale={tapScale}
  >
    <IdentitySection mode="edit" form={form} onFieldChange={onFieldChange} />
    <TokenSection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.token}
      onToggle={() => onToggleSection('token')}
    />
    <SecuritySection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.security}
      onToggle={() => onToggleSection('security')}
    />
    <FingerprintSection
      form={form}
      onFieldChange={onFieldChange}
      collapsed={collapsedSections.fingerprint}
      onToggle={() => onToggleSection('fingerprint')}
    />
    <TicketRestrictionSection form={form} onFieldChange={onFieldChange} />
    <TranslationAccessSection form={form} onFieldChange={onFieldChange} />
    <BackupCodesSection
      backupCodes={form.backupCodes || []}
      collapsed={collapsedSections.backupCodes}
      onToggle={() => onToggleSection('backupCodes')}
      onChange={onBackupCodesChange}
    />
  </UserFormScaffold>
);

// 所有可在列表中展示的字段（除 fingerprints/passkeyCredentials/backupCodes 等复杂数组）
export const TABLE_COLUMNS = [
  { key: 'username', label: '用户名' },
  { key: 'email', label: '邮箱' },
  { key: 'role', label: '角色' },
  { key: 'accountStatus', label: '账户' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'dailyUsage', label: '用量' },
  { key: 'security', label: '安全' },
  { key: 'ticketStatus', label: '工单状态' },
  { key: 'translation', label: '翻译权限' },
];

