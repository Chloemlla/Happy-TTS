import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../api/api';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';
import { useNotification } from './Notification';
import {
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaSave,
  FaTimes,
  FaUser,
  FaKey,
  FaList,
  FaShieldAlt,
  FaCog,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';

interface FingerprintRecord {
  id: string;
  ts: number;
  ua?: string;
  ip?: string;
  deviceInfo?: any;
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
  requireFingerprint?: boolean;
  requireFingerprintAt?: number;
  fingerprintRequestDismissedOnce?: boolean;
  fingerprintRequestDismissedAt?: number;
  fingerprints?: FingerprintRecord[];
  // 工单违规处罚相关
  ticketViolationCount?: number;
  ticketBannedUntil?: string;
  // 翻译权限与账户状态
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: 'active' | 'suspended';
}

const emptyUser: User = {
  id: '',
  username: '',
  email: '',
  password: '',
  role: 'user',
  createdAt: '',
  dailyUsage: 0,
  lastUsageDate: '',
  token: '',
  tokenExpiresAt: 0,
  totpSecret: '',
  totpEnabled: false,
  backupCodes: [],
  passkeyEnabled: false,
  pendingChallenge: '',
  currentChallenge: '',
  passkeyVerified: false,
  avatarUrl: '',
  requireFingerprint: false,
  requireFingerprintAt: 0,
  fingerprintRequestDismissedOnce: false,
  fingerprintRequestDismissedAt: 0,
  ticketViolationCount: 0,
  ticketBannedUntil: '',
  isTranslationEnabled: true,
  translationAccessUntil: '',
  accountStatus: 'active',
};

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('❌ AES-256解密失败:', error);
    throw new Error('解密失败');
  }
}

const ROW_INITIAL = { opacity: 0, x: -20 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;

type UserFormChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
type UserFormChangeHandler = (event: UserFormChangeEvent) => void;
type MotionScaleHandler = (scale: number, enabled?: boolean) => { scale: number } | undefined;
type CollapsibleSectionKey = 'token' | 'security' | 'fingerprint' | 'backupCodes';
type CollapsedSectionState = Record<CollapsibleSectionKey, boolean>;

type UserFormSectionProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  contentClassName?: string;
};

type UserTextFieldProps = {
  label: string;
  name: keyof User;
  value: string | number;
  onChange: UserFormChangeHandler;
  type?: 'text' | 'password' | 'email' | 'number';
  placeholder?: string;
  hint?: string;
};

type UserSelectFieldProps = {
  label: string;
  name: keyof User;
  value: string;
  onChange: UserFormChangeHandler;
  options: Array<{ value: string; label: string }>;
};

type UserCheckboxFieldProps = {
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
  { value: 'admin', label: '管理员' },
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'active', label: '正常' },
  { value: 'suspended', label: '封停' },
];

const createDefaultCollapsedSections = (): CollapsedSectionState => ({
  token: true,
  security: true,
  fingerprint: true,
  backupCodes: true,
});

const parseBackupCodes = (value: string): string[] => (
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
);

const UserFormSection: React.FC<UserFormSectionProps> = ({
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

const UserTextField: React.FC<UserTextFieldProps> = ({
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

const UserSelectField: React.FC<UserSelectFieldProps> = ({
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

const UserCheckboxField: React.FC<UserCheckboxFieldProps> = ({
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

const UserFormScaffold: React.FC<{
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

const CreateUserForm: React.FC<SharedUserFormProps> = ({
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

const EditUserForm: React.FC<SharedUserFormProps & { username: string }> = ({
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
const TABLE_COLUMNS = [
  { key: 'username', label: '用户名' },
  { key: 'email', label: '邮箱' },
  { key: 'role', label: '角色' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'dailyUsage', label: '用量' },
  { key: 'totpEnabled', label: 'TOTP' },
  { key: 'passkeyEnabled', label: 'Passkey' },
  { key: 'ticketStatus', label: '工单状态' },
];

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<User>(emptyUser);
  const [showForm, setShowForm] = useState(false);
  const [fpUser, setFpUser] = useState<User | null>(null);
  const [showFpModal, setShowFpModal] = useState(false);
  const [fpRequireMap, setFpRequireMap] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSectionState>(createDefaultCollapsedSections);
  const navigate = useNavigate();
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();
  const hoverScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);
  const tapScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  const toggleSection = useCallback((section: CollapsibleSectionKey) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingUser(null);
    setForm(emptyUser);
    setCollapsedSections(createDefaultCollapsedSections());
  }, []);

  const openCreate = useCallback(() => {
    setShowForm(true);
    setEditingUser(null);
    setForm(emptyUser);
    setCollapsedSections(createDefaultCollapsedSections());
  }, []);

  // 获取工单封禁剩余时间描述
  const getBanRemainingText = (bannedUntil?: string) => {
    if (!bannedUntil) return null;
    const banTime = new Date(bannedUntil);
    const now = new Date();
    if (banTime <= now) return null;

    const diffMs = banTime.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours > 24 * 365) return '永久封禁';
    if (diffHours >= 1) return `剩余 ${diffHours} 小时`;
    const diffMins = Math.ceil(diffMs / (1000 * 60));
    return `剩余 ${diffMins} 分钟`;
  };

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      if (!token) {
        setError('未找到有效的认证令牌，请重新登录');
        setNotification({ type: 'warning', message: '未找到认证令牌，请重新登录后重试' });
        return;
      }

      const res = await api.get('/api/admin/users', { params: { includeFingerprints: 1 } });

      if (res.data.data && res.data.iv && typeof res.data.data === 'string' && typeof res.data.iv === 'string') {
        try {
          const decryptedJson = decryptAES256(res.data.data, res.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);

          if (Array.isArray(decryptedData)) {
            setUsers(decryptedData);
            const initMap: Record<string, number> = {};
            for (const u of decryptedData) {
              const ts = Number((u as any).requireFingerprintAt || 0);
              if (ts > 0) initMap[(u as any).id] = ts;
            }
            setFpRequireMap(initMap);
            setNotification({ type: 'success', message: `已获取 ${decryptedData.length} 个用户` });
          } else {
            setError('解密数据格式错误');
            setNotification({ type: 'error', message: '解密数据格式错误' });
          }
        } catch (decryptError) {
          setError('数据解密失败，请检查登录状态');
          setNotification({ type: 'error', message: '数据解密失败，请检查登录状态' });
        }
      } else {
        setUsers(res.data);
        const count = Array.isArray(res.data) ? res.data.length : 0;
        if (count) setNotification({ type: 'success', message: `已获取 ${count} 个用户` });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '获取用户列表失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // 表单变更 — 支持 checkbox 和 number
  const handleChange: UserFormChangeHandler = (e) => {
    const target = e.target as HTMLInputElement;
    const name = target.name as keyof User;
    let value: any = target.value;
    if (target.type === 'checkbox') value = target.checked;
    if (target.type === 'number') value = target.value === '' ? '' : Number(target.value);
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleBackupCodesChange = useCallback((value: string) => {
    setForm(prev => ({
      ...prev,
      backupCodes: value ? parseBackupCodes(value) : [],
    }));
  }, []);

  // 添加或编辑用户
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const method = editingUser ? 'put' : 'post';
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      // 构建提交数据，过滤掉空字符串密码（编辑时）
      const submitData: any = { ...form };
      if (editingUser && !submitData.password) {
        delete submitData.password;
      }
      // 移除只读/不必要字段
      delete submitData.fingerprints;
      delete submitData.passkeyCredentials;
      await api.request({ url, method, data: submitData });
      closeForm();
      setNotification({ type: 'success', message: editingUser ? '用户信息已更新' : '用户已创建' });
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '操作失败');
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '操作失败' });
    } finally {
      setLoading(false);
    }
  };

  // 删除用户
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/admin/users/${id}`);
      setNotification({ type: 'success', message: '用户已删除' });
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '删除失败');
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除失败' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const openEdit = useCallback((u: User) => {
    setEditingUser(u);
    setForm({ ...emptyUser, ...u, password: '' });
    setCollapsedSections(createDefaultCollapsedSections());
    setShowForm(true);
  }, []);
  const openFp = useCallback((u: User) => { setFpUser(u); setShowFpModal(true); }, []);

  if (!user || user.role !== 'admin') {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2">
            🔒
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              用户管理仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          👥
          用户管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理系统用户账户，支持查看与修改 user_datas 集合的所有字段。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>查看所有用户账户的完整信息（基本信息、Token、TOTP、Passkey、指纹配置）</li>
                <li>添加 / 编辑 / 删除用户</li>
                <li>直接修改 dailyUsage、requireFingerprint 等运营字段</li>
                <li>管理用户指纹记录（查看 / 删除 / 清空）</li>
                <li>数据加密传输保护</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="bg-red-50 border border-red-200 rounded-xl p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
            {error.includes('认证失败') && (
              <div className="mt-3">
                <motion.button
                  onClick={() => navigate('/welcome')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  whileHover={hoverScale(1.02)}
                  whileTap={tapScale(0.95)}
                >
                  重新登录
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 用户列表 + 添加按钮 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            用户列表
          </h3>
          <motion.button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
            whileHover={hoverScale(1.02)}
            whileTap={tapScale(0.95)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            添加用户
          </motion.button>
        </div>

        {/* 添加/编辑用户表单 */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200"
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              {editingUser ? (
                <EditUserForm
                  username={editingUser.username}
                  form={form}
                  loading={loading}
                  onSubmit={handleSubmit}
                  onCancel={closeForm}
                  onFieldChange={handleChange}
                  onBackupCodesChange={handleBackupCodesChange}
                  collapsedSections={collapsedSections}
                  onToggleSection={toggleSection}
                  hoverScale={hoverScale}
                  tapScale={tapScale}
                />
              ) : (
                <CreateUserForm
                  form={form}
                  loading={loading}
                  onSubmit={handleSubmit}
                  onCancel={closeForm}
                  onFieldChange={handleChange}
                  onBackupCodesChange={handleBackupCodesChange}
                  collapsedSections={collapsedSections}
                  onToggleSection={toggleSection}
                  hoverScale={hoverScale}
                  tapScale={tapScale}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 用户列表 */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  {TABLE_COLUMNS.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{col.label}</th>
                  ))}
                  <th className="px-4 py-3 text-left font-semibold">指纹</th>
                  <th className="px-4 py-3 text-left font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <motion.tr
                    key={u.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    initial={ROW_INITIAL}
                    animate={ROW_ANIMATE}
                    transition={{ duration: 0.3, delay: 0.05 * idx }}
                    whileHover={{ backgroundColor: '#f0f9ff' }}
                  >
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">管理员</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">普通用户</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3">
                      {u.totpEnabled
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">已开启</span>
                        : <span className="text-gray-400 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u.passkeyEnabled
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">已开启</span>
                        : <span className="text-gray-400 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.dailyUsage ?? 0}</td>
                    {/* 工单状态列 */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {u.ticketViolationCount && u.ticketViolationCount > 0 ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${u.ticketViolationCount >= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            违规: {u.ticketViolationCount} 次
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                            正常
                          </span>
                        )}
                        {getBanRemainingText(u.ticketBannedUntil) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium bg-red-50 text-red-600 border border-red-100 italic">
                            🚫 {getBanRemainingText(u.ticketBannedUntil)}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* 指纹列 */}
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {u.fingerprints && u.fingerprints.length > 0 ? (
                        <div className="space-y-1">
                          <div>
                            最新: <span className="font-mono" title={u.fingerprints[0].id}>{u.fingerprints[0].id.slice(0, 12)}{u.fingerprints[0].id.length > 12 ? '…' : ''}</span>
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {new Date(u.fingerprints[0].ts).toLocaleString()} · {u.fingerprints.length} 条
                          </div>
                          <motion.button
                            className="text-blue-600 hover:underline text-[11px]"
                            onClick={() => openFp(u)}
                            whileHover={hoverScale(1.02)}
                            whileTap={tapScale(0.95)}
                          >查看全部</motion.button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {fpRequireMap[u.id] ? (
                            <>
                              <div className="text-blue-600 text-[12px]">已在预约列表</div>
                              <div className="text-[10px] text-gray-500">上次预约：{new Date(fpRequireMap[u.id]).toLocaleString()}</div>
                              <motion.button
                                className="text-blue-600 hover:underline text-[11px]"
                                onClick={async () => {
                                  try {
                                    await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                    setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                    setNotification({ type: 'success', message: '已再次请求该用户下次上报指纹' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                                  }
                                }}
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.95)}
                              >再次请求</motion.button>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400">暂无</span>
                              <motion.button
                                className="text-blue-600 hover:underline text-[11px] block"
                                onClick={async () => {
                                  try {
                                    await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                    setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                    setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                                  }
                                }}
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.95)}
                              >请求上报</motion.button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <motion.button
                          className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition"
                          onClick={() => openEdit(u)}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >
                          编辑
                        </motion.button>
                        <motion.button
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition"
                          onClick={() => handleDelete(u.id)}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >
                          删除
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                暂无用户数据
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 指纹详情弹窗 */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {showFpModal && fpUser && (
            <motion.div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6"
                initial={{ scale: 0.95, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 20, opacity: 0 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">指纹详情 - {fpUser.username}</h3>
                  <div className="flex items-center gap-2">
                    <motion.button
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      onClick={async () => {
                        if (!fpUser) return;
                        try {
                          await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                          setFpRequireMap(prev => ({ ...prev, [fpUser.id]: Date.now() }));
                          setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
                        } catch (e: any) {
                          setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                        }
                      }}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >请求下次上报</motion.button>
                    <motion.button
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      onClick={async () => {
                        if (!fpUser) return;
                        if (!window.confirm('确定要清空该用户的全部指纹记录吗？此操作不可撤销')) return;
                        try {
                          const res = await api.delete(`/api/admin/users/${fpUser.id}/fingerprints`);
                          const next = res?.data?.fingerprints || [];
                          setFpUser({ ...fpUser, fingerprints: next });
                          setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, fingerprints: next } : u));
                          setNotification({ type: 'success', message: '已清空全部指纹记录' });
                        } catch (e: any) {
                          setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '清空指纹失败' });
                        }
                      }}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >清空全部</motion.button>
                    <motion.button className="text-gray-500 hover:text-gray-700" onClick={() => setShowFpModal(false)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.95)}>✕</motion.button>
                  </div>
                </div>
                {fpUser.fingerprints && fpUser.fingerprints.length > 0 ? (
                  <div className="max-h-96 overflow-auto space-y-3">
                    {fpUser.fingerprints.map((fp, i) => (
                      <div key={i} className="p-3 border border-gray-200 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">{new Date(fp.ts).toLocaleString()} · IP {fp.ip || '-'} </div>
                        <div className="font-mono break-all text-sm">{fp.id}</div>
                        {fp.ua && <div className="text-[11px] text-gray-500 mt-1 break-all">{fp.ua}</div>}
                        {fp.deviceInfo && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            <div className="font-medium text-gray-700 mb-1">设备特征:</div>
                            <div className="grid grid-cols-2 gap-1 text-gray-600">
                              {fp.deviceInfo?.screen && (
                                <div>屏幕: {fp.deviceInfo.screen.w}×{fp.deviceInfo.screen.h}</div>
                              )}
                              {fp.deviceInfo?.timezone?.tz && (
                                <div>时区: {fp.deviceInfo.timezone.tz}</div>
                              )}
                              {fp.deviceInfo?.navigator?.userAgent && (
                                <div className="col-span-2 truncate">
                                  浏览器: {fp.deviceInfo.navigator.userAgent.split(' ').slice(-2).join(' ')}
                                </div>
                              )}
                            </div>
                            <details className="mt-1">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">详细信息</summary>
                              <pre className="mt-1 text-xs bg-white p-1 rounded border overflow-auto max-h-32">
                                {JSON.stringify(fp.deviceInfo, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        <div className="mt-2">
                          <motion.button
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                            onClick={async () => {
                              try {
                                await navigator.clipboard?.writeText(fp.id);
                                setNotification({ type: 'success', message: '指纹ID已复制到剪贴板' });
                              } catch {
                                setNotification({ type: 'error', message: '复制失败，请手动复制' });
                              }
                            }}
                            whileHover={hoverScale(1.02)}
                            whileTap={tapScale(0.95)}
                          >复制ID</motion.button>
                          <motion.button
                            className="ml-2 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            onClick={async () => {
                              if (!fpUser) return;
                              if (!window.confirm('确定要删除该指纹记录吗？')) return;
                              try {
                                const res = await api.delete(`/api/admin/users/${fpUser.id}/fingerprints/${encodeURIComponent(fp.id)}`, {
                                  params: { ts: fp.ts }
                                });
                                const next = res?.data?.fingerprints || [];
                                setFpUser({ ...fpUser, fingerprints: next });
                                setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, fingerprints: next } : u));
                                setNotification({ type: 'success', message: '已删除指纹记录' });
                              } catch (e: any) {
                                setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除指纹失败' });
                              }
                            }}
                            whileHover={hoverScale(1.02)}
                            whileTap={tapScale(0.95)}
                          >删除</motion.button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    暂无指纹记录
                  </div>
                )}
                {fpRequireMap[fpUser.id] ? (
                  <div className="mt-2">
                    <div className="text-blue-600 text-sm">已在预约列表</div>
                    <div className="text-[12px] text-gray-500">上次预约：{new Date(fpRequireMap[fpUser.id]).toLocaleString()}</div>
                    <motion.button
                      className="mt-2 text-blue-600 hover:underline text-[12px]"
                      onClick={async () => {
                        if (!fpUser) return;
                        try {
                          const r = await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                          const ts = Number(r?.data?.requireFingerprintAt || Date.now());
                          setFpRequireMap(prev => ({ ...prev, [fpUser.id]: ts }));
                          setNotification({ type: 'success', message: `已再次请求该用户下次上报指纹` });
                        } catch (e: any) {
                          setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                        }
                      }}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >再次请求</motion.button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <motion.button
                      className="text-blue-600 hover:underline text-[12px]"
                      onClick={async () => {
                        if (!fpUser) return;
                        try {
                          const r = await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                          const ts = Number(r?.data?.requireFingerprintAt || Date.now());
                          setFpRequireMap(prev => ({ ...prev, [fpUser.id]: ts }));
                          setNotification({ type: 'success', message: `已请求该用户下次上报指纹` });
                        } catch (e: any) {
                          setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                        }
                      }}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >请求上报</motion.button>
                  </div>
                )}
                <div className="mt-4 text-right">
                  <motion.button className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600" onClick={() => setShowFpModal(false)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.95)}>关闭</motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        , document.body)}
    </motion.div>
  );
};

export default UserManagement;
