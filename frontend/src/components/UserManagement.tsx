import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../api/api';
import { getClientOrigin, passkeyApi } from '../api/passkey';
import { getSignHeaders } from '../utils/requestSigner';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
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
  FaSearch,
  FaSyncAlt,
} from 'react-icons/fa';


const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { response?: { data?: { error?: string } }; message?: string };
    return maybe.response?.data?.error || maybe.message || fallback;
  }
  return fallback;
};

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

type RevealPasswordMethod = 'password' | 'totp' | 'passkey';

interface RevealPasswordState {
  open: boolean;
  targetUser: User | null;
  reason: string;
  method: RevealPasswordMethod;
  password: string;
  verificationCode: string;
  verificationToken: string;
  revealedPassword: string;
  loading: boolean;
}

type UserListRoleFilter = 'all' | 'user' | 'admin' | 'trusted';
type UserListAccountStatusFilter = 'all' | 'active' | 'suspended';
type UserListSecurityFilter = 'all' | 'totp' | 'passkey' | 'fingerprintRequired' | 'noMfa';
type UserListTicketFilter = 'all' | 'normal' | 'violated' | 'banned';
type UserListTranslationFilter = 'all' | 'enabled' | 'disabled' | 'limited';
type UserListSortOrder = 'asc' | 'desc';
type BulkUserAction =
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

interface UserListFilters {
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

interface UserListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UserListStats {
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

interface UserListEnvelope {
  users: User[];
  pagination: UserListPagination;
  stats?: UserListStats;
  filteredStats?: UserListStats;
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

const emptyRevealPasswordState: RevealPasswordState = {
  open: false,
  targetUser: null,
  reason: '',
  method: 'password',
  password: '',
  verificationCode: '',
  verificationToken: '',
  revealedPassword: '',
  loading: false,
};

const ROW_INITIAL = { opacity: 0, x: -20 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;

type UserFormChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
type UserFormChangeHandler = (event: UserFormChangeEvent) => void;
type MotionScaleHandler = (scale: number, enabled?: boolean) => { scale: number } | undefined;
type CollapsibleSectionKey = 'token' | 'security' | 'fingerprint' | 'backupCodes';
type CollapsedSectionState = Record<CollapsibleSectionKey, boolean>;

import { UserFormScaffold } from './user-management/UserFormControls';
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
  const [fpLoading, setFpLoading] = useState(false);
  const [revealPasswordState, setRevealPasswordState] = useState<RevealPasswordState>(emptyRevealPasswordState);
  const [fpRequireMap, setFpRequireMap] = useState<Record<string, number>>({});
  const [pendingFilters, setPendingFilters] = useState<UserListFilters>(DEFAULT_USER_LIST_FILTERS);
  const [activeFilters, setActiveFilters] = useState<UserListFilters>(DEFAULT_USER_LIST_FILTERS);
  const [pagination, setPagination] = useState<UserListPagination>(DEFAULT_PAGINATION);
  const [stats, setStats] = useState<UserListStats>(DEFAULT_STATS);
  const [filteredStats, setFilteredStats] = useState<UserListStats>(DEFAULT_STATS);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkUserAction | ''>('');
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
  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const currentPageUserIds = useMemo(() => users.map(item => item.id), [users]);
  const allCurrentPageSelected = users.length > 0 && users.every(item => selectedUserIdSet.has(item.id));

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

  const updatePendingFilter = useCallback(<K extends keyof UserListFilters,>(key: K, value: UserListFilters[K]) => {
    setPendingFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const applyFilters = useCallback(() => {
    setSelectedUserIds([]);
    setPagination(prev => ({ ...prev, page: 1 }));
    setActiveFilters(pendingFilters);
  }, [pendingFilters]);

  const resetFilters = useCallback(() => {
    setPendingFilters(DEFAULT_USER_LIST_FILTERS);
    setActiveFilters(DEFAULT_USER_LIST_FILTERS);
    setPagination(DEFAULT_PAGINATION);
    setSelectedUserIds([]);
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, Math.min(prev.totalPages || 1, page)),
    }));
  }, []);

  const toggleUserSelection = useCallback((id: string) => {
    setSelectedUserIds(prev => (
      prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id]
    ));
  }, []);

  const toggleCurrentPageSelection = useCallback(() => {
    setSelectedUserIds(prev => {
      const pageIds = currentPageUserIds.filter(Boolean);
      if (pageIds.length === 0) return prev;
      const allSelected = pageIds.every(id => prev.includes(id));
      if (allSelected) return prev.filter(id => !pageIds.includes(id));
      return Array.from(new Set([...prev, ...pageIds]));
    });
  }, [currentPageUserIds]);

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

  const getFutureRemainingText = (value?: string) => {
    if (!value) return null;
    const ts = Date.parse(value);
    if (!Number.isFinite(ts) || ts <= Date.now()) return null;
    return new Date(ts).toLocaleString();
  };

  const getTranslationStatus = (u: User) => {
    const limitedUntil = getFutureRemainingText(u.translationAccessUntil);
    if (u.isTranslationEnabled === false) {
      return { label: '已停用', className: 'bg-gray-100 text-gray-600' };
    }
    if (limitedUntil) {
      return { label: `限制至 ${limitedUntil}`, className: 'bg-orange-100 text-orange-700' };
    }
    return { label: '正常', className: 'bg-green-100 text-green-700' };
  };

  const applyUserListPayload = useCallback((payload: User[] | UserListEnvelope, showTip: boolean) => {
    const envelope = Array.isArray(payload) ? null : payload;
    const nextUsers = Array.isArray(payload) ? payload : (payload.users || []);
    setUsers(nextUsers);
    setPagination(envelope?.pagination || {
      page: 1,
      pageSize: activeFilters.pageSize,
      total: nextUsers.length,
      totalPages: Math.max(1, Math.ceil(nextUsers.length / activeFilters.pageSize)),
    });
    setStats({ ...DEFAULT_STATS, ...(envelope?.stats || {}) });
    setFilteredStats({ ...DEFAULT_STATS, ...(envelope?.filteredStats || envelope?.stats || {}) });

    const initMap: Record<string, number> = {};
    for (const u of nextUsers) {
      const ts = Number((u as any).requireFingerprintAt || 0);
      if (ts > 0) initMap[(u as any).id] = ts;
    }
    setFpRequireMap(initMap);
    setSelectedUserIds(prev => prev.filter(id => nextUsers.some(item => item.id === id)));

    if (showTip) {
      const total = envelope?.pagination?.total ?? nextUsers.length;
      setNotification({ type: 'success', message: `已获取 ${total} 个用户` });
    }
  }, [activeFilters.pageSize, setNotification]);

  // 获取用户列表
  const fetchUsers = useCallback(async (showTip: boolean = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/admin/users', {
        params: {
          envelope: 1,
          page: pagination.page,
          pageSize: activeFilters.pageSize,
          keyword: activeFilters.keyword || undefined,
          role: activeFilters.role,
          accountStatus: activeFilters.accountStatus,
          security: activeFilters.security,
          ticket: activeFilters.ticket,
          translation: activeFilters.translation,
          sortBy: activeFilters.sortBy,
          sortOrder: activeFilters.sortOrder,
        },
      });

      applyUserListPayload(res.data, showTip);
    } catch (e: unknown) {
      setNotification({ type: 'error', message: getErrorMessage(e, '获取用户列表失败') });
    } finally {
      setLoading(false);
    }
  }, [activeFilters, applyUserListPayload, pagination.page, setNotification]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // 表单变更 — 支持 checkbox 和 number
  const handleChange: UserFormChangeHandler = (e) => {
    const target = e.target as HTMLInputElement;
    const name = target.name as keyof User;
    let value: string | number | boolean = target.value;
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
      const submitData: Partial<User> & Record<string, unknown> = { ...form };
      if (editingUser && !submitData.password) {
        delete submitData.password;
      }
      // 移除只读/不必要字段
      delete submitData.fingerprints;
      delete submitData.passkeyCredentials;
      await api.request({ url, method, data: submitData });
      closeForm();
      setNotification({ type: 'success', message: editingUser ? '用户信息已更新' : '用户已创建' });
      fetchUsers(true);
    } catch (e: unknown) {
      setError(e.response?.data?.error || e.message || '操作失败');
      setNotification({ type: 'error', message: getErrorMessage(e, '操作失败') });
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
      fetchUsers(true);
    } catch (e: unknown) {
      setError(e.response?.data?.error || e.message || '删除失败');
      setNotification({ type: 'error', message: getErrorMessage(e, '删除失败') });
    } finally {
      setLoading(false);
    }
  }, [fetchUsers, setNotification]);

  const handleBulkAction = useCallback(async () => {
    if (selectedUserIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择用户' });
      return;
    }

    const actionMeta = BULK_ACTION_OPTIONS.find(item => item.value === bulkAction);
    if (!bulkAction || !actionMeta) {
      setNotification({ type: 'warning', message: '请选择批量操作' });
      return;
    }

    if (!window.confirm(`${actionMeta.confirm}\n\n已选择 ${selectedUserIds.length} 个用户。`)) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/admin/users/bulk-action', {
        userIds: selectedUserIds,
        action: bulkAction,
      });
      const processed = Number(res.data?.processed || 0);
      const failed = Number(res.data?.failed || 0);
      setSelectedUserIds([]);
      setBulkAction('');
      setNotification({
        type: failed > 0 ? 'warning' : 'success',
        message: failed > 0 ? `已处理 ${processed} 个用户，${failed} 个失败` : `已处理 ${processed} 个用户`,
      });
      fetchUsers(false);
    } catch (e: unknown) {
      setError(e.response?.data?.error || e.message || '批量操作失败');
      setNotification({ type: 'error', message: getErrorMessage(e, '批量操作失败') });
    } finally {
      setLoading(false);
    }
  }, [bulkAction, fetchUsers, selectedUserIds, setNotification]);

  const openEdit = useCallback((u: User) => {
    setEditingUser(u);
    setForm({ ...emptyUser, ...u, password: '' });
    setCollapsedSections(createDefaultCollapsedSections());
    setShowForm(true);
  }, []);
  const openFp = useCallback(async (u: User) => {
    setFpUser(u);
    setShowFpModal(true);
    setFpLoading(true);
    try {
      const res = await api.get(`/api/admin/users/${u.id}`);
      const detail = res.data?.user;
      if (detail?.id) {
        setFpUser(detail);
      }
    } catch (e: unknown) {
      setNotification({ type: 'error', message: getErrorMessage(e, '获取指纹详情失败') });
    } finally {
      setFpLoading(false);
    }
  }, [setNotification]);
  const openRevealPassword = useCallback((u: User) => {
    setRevealPasswordState({
      ...emptyRevealPasswordState,
      open: true,
      targetUser: u,
    });
  }, []);

  const closeRevealPassword = useCallback(() => {
    setRevealPasswordState(emptyRevealPasswordState);
  }, []);

  useEffect(() => {
    if (!revealPasswordState.revealedPassword) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRevealPasswordState(prev => ({ ...prev, revealedPassword: '' }));
    }, 30000);

    return () => window.clearTimeout(timer);
  }, [revealPasswordState.revealedPassword]);

  const revealPasswordWithToken = useCallback(async (
    targetUserId: string,
    reason: string,
    verificationToken: string,
  ) => {
    const body = {
      reason,
      verificationToken,
    };
    const bodyString = JSON.stringify(body);
    const revealPasswordPath = `/api/admin/users/${targetUserId}/reveal-password`;
    const headers = await getSignHeaders(bodyString, undefined, 'POST', revealPasswordPath);
    const res = await api.post(revealPasswordPath, body, {
      headers,
    });
    const password = res.data?.password;
    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new Error('接口未返回可显示的密码');
    }

    setRevealPasswordState(prev => ({
      ...prev,
      verificationToken: '',
      revealedPassword: password,
    }));
    setNotification({ type: 'success', message: '密码已显示，30 秒后自动隐藏' });
  }, [setNotification]);

  const handleVerifyRevealPassword = useCallback(async () => {
    const targetUser = revealPasswordState.targetUser;
    if (!targetUser) return;

    const reason = revealPasswordState.reason.trim();
    if (reason.length < 4 || reason.length > 200) {
      setNotification({ type: 'error', message: '请填写查看原因（4-200字符）' });
      return;
    }

    if (revealPasswordState.method === 'password' && !revealPasswordState.password) {
      setNotification({ type: 'error', message: '请输入当前管理员密码' });
      return;
    }

    if (revealPasswordState.method === 'totp' && !/^\d{6}$/.test(revealPasswordState.verificationCode.trim())) {
      setNotification({ type: 'error', message: '请输入 6 位 TOTP 验证码' });
      return;
    }

    setRevealPasswordState(prev => ({ ...prev, loading: true }));
    try {
      let payload:
        | { method: 'password'; password: string }
        | { method: 'totp'; verificationCode: string }
        | { method: 'passkey'; passkeyResponse: Awaited<ReturnType<typeof getAdminPasskeyAuthResponse>>; clientOrigin: string };

      if (revealPasswordState.method === 'password') {
        payload = { method: 'password', password: revealPasswordState.password };
      } else if (revealPasswordState.method === 'totp') {
        payload = { method: 'totp', verificationCode: revealPasswordState.verificationCode.trim() };
      } else {
        if (!user?.username) {
          throw new Error('无法获取当前管理员用户名');
        }
        const passkeyResponse = await getAdminPasskeyAuthResponse(user.username);
        payload = { method: 'passkey', passkeyResponse, clientOrigin: getClientOrigin() };
      }

      const res = await api.post(`/api/admin/users/${targetUser.id}/reveal-password/verify`, payload);
      const verificationToken = res.data?.verificationToken;
      if (typeof verificationToken !== 'string' || !verificationToken) {
        throw new Error('验证通过但未返回查看凭证');
      }

      setRevealPasswordState(prev => ({
        ...prev,
        verificationToken,
        revealedPassword: '',
      }));
      await revealPasswordWithToken(targetUser.id, reason, verificationToken);
    } catch (e: unknown) {
      setNotification({ type: 'error', message: getErrorMessage(e, '二次验证或查看密码失败') });
    } finally {
      setRevealPasswordState(prev => ({ ...prev, loading: false }));
    }
  }, [revealPasswordState, revealPasswordWithToken, setNotification, user?.username]);

  const statCards = useMemo(() => [
    { label: '总用户', value: stats.total, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: '管理员', value: stats.admins, tone: 'bg-red-50 text-red-700 border-red-100' },
    { label: '信用者', value: stats.trusted, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: '封停账户', value: stats.suspended, tone: 'bg-gray-50 text-gray-700 border-gray-200' },
    { label: '今日用量', value: stats.totalDailyUsage, tone: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
    { label: '需指纹', value: stats.fingerprintRequired, tone: 'bg-orange-50 text-orange-700 border-orange-100' },
    { label: '翻译受限', value: stats.translationDisabled + stats.translationLimited, tone: 'bg-purple-50 text-purple-700 border-purple-100' },
  ], [stats]);

  const hasActiveFilters = useMemo(() => (
    activeFilters.keyword !== DEFAULT_USER_LIST_FILTERS.keyword ||
    activeFilters.role !== DEFAULT_USER_LIST_FILTERS.role ||
    activeFilters.accountStatus !== DEFAULT_USER_LIST_FILTERS.accountStatus ||
    activeFilters.security !== DEFAULT_USER_LIST_FILTERS.security ||
    activeFilters.ticket !== DEFAULT_USER_LIST_FILTERS.ticket ||
    activeFilters.translation !== DEFAULT_USER_LIST_FILTERS.translation ||
    activeFilters.sortBy !== DEFAULT_USER_LIST_FILTERS.sortBy ||
    activeFilters.sortOrder !== DEFAULT_USER_LIST_FILTERS.sortOrder ||
    activeFilters.pageSize !== DEFAULT_USER_LIST_FILTERS.pageSize
  ), [activeFilters]);

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.total, pagination.page * pagination.pageSize);

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
                <li>按角色、账户状态、安全状态、工单状态和翻译权限筛选用户</li>
                <li>添加 / 编辑 / 删除用户，支持分页排序和批量运营动作</li>
                <li>直接修改 dailyUsage、requireFingerprint、翻译权限与账户状态等运营字段</li>
                <li>管理用户指纹记录（查看 / 删除 / 清空）</li>
                <li>列表轻量加载，完整指纹详情按需读取</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map(item => (
          <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.tone}`}>
            <div className="text-xs font-semibold text-current/70">{item.label}</div>
            <div className="mt-1 text-2xl font-bold">{item.value}</div>
          </div>
        ))}
      </div>

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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            用户列表
            <span className="text-sm font-normal text-gray-500">
              {rangeStart}-{rangeEnd} / {pagination.total}
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => fetchUsers(true)}
              className="px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium flex items-center gap-2 border border-gray-200"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.95)}
            >
              <FaSyncAlt className="text-xs" />
              刷新
            </motion.button>
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
        </div>

        <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                value={pendingFilters.keyword}
                onChange={e => updatePendingFilter('keyword', e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') applyFilters();
                }}
                placeholder="搜索用户名、邮箱、ID、IP"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-white"
              />
            </div>
            <select
              value={pendingFilters.role}
              onChange={e => updatePendingFilter('role', e.target.value as UserListRoleFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {ROLE_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select
              value={pendingFilters.accountStatus}
              onChange={e => updatePendingFilter('accountStatus', e.target.value as UserListAccountStatusFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {ACCOUNT_STATUS_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select
              value={pendingFilters.security}
              onChange={e => updatePendingFilter('security', e.target.value as UserListSecurityFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {SECURITY_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select
              value={pendingFilters.ticket}
              onChange={e => updatePendingFilter('ticket', e.target.value as UserListTicketFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {TICKET_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select
              value={pendingFilters.translation}
              onChange={e => updatePendingFilter('translation', e.target.value as UserListTranslationFilter)}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {TRANSLATION_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={pendingFilters.sortBy}
                onChange={e => updatePendingFilter('sortBy', e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={pendingFilters.sortOrder}
                onChange={e => updatePendingFilter('sortOrder', e.target.value as UserListSortOrder)}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
            <select
              value={pendingFilters.pageSize}
              onChange={e => updatePendingFilter('pageSize', Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>每页 {size} 条</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs text-gray-500">
              当前筛选 {filteredStats.total} 个用户，管理员 {filteredStats.admins} 个，信用者 {filteredStats.trusted} 个，封停 {filteredStats.suspended} 个
              {hasActiveFilters ? '，已启用筛选' : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                onClick={applyFilters}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
                whileHover={hoverScale(1.02)}
                whileTap={tapScale(0.95)}
              >
                应用筛选
              </motion.button>
              <motion.button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium border border-gray-200"
                whileHover={hoverScale(1.02)}
                whileTap={tapScale(0.95)}
              >
                重置
              </motion.button>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-t border-gray-200 pt-3">
            <div className="text-sm text-gray-600">已选择 {selectedUserIds.length} 个用户</div>
            <div className="flex flex-wrap gap-2">
              <select
                value={bulkAction}
                onChange={e => setBulkAction(e.target.value as BulkUserAction | '')}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[180px]"
              >
                <option value="">选择批量操作</option>
                {BULK_ACTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <motion.button
                type="button"
                onClick={handleBulkAction}
                disabled={selectedUserIds.length === 0 || !bulkAction || loading}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-sm font-medium disabled:opacity-50"
                whileHover={hoverScale(1.02, selectedUserIds.length > 0 && Boolean(bulkAction) && !loading)}
                whileTap={tapScale(0.95, selectedUserIds.length > 0 && Boolean(bulkAction) && !loading)}
              >
                执行
              </motion.button>
            </div>
          </div>
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
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={() => toggleCurrentPageSelection()}
                      className="w-4 h-4 rounded"
                      aria-label="选择当前页用户"
                    />
                  </th>
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
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedUserIdSet.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        className="w-4 h-4 rounded"
                        aria-label={`选择用户 ${u.username}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div>{u.username}</div>
                      <div className="text-[11px] text-gray-400 font-normal">ID {u.id}</div>
                      {u.authProvider && u.authProvider !== 'local' && (
                        <div className="text-[11px] text-indigo-500 font-normal">{u.authProvider}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{u.email}</div>
                      {u.lastLoginIp && <div className="text-[11px] text-gray-400">IP {u.lastLoginIp}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">管理员</span>
                      ) : u.role === 'trusted' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">信用者</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">普通用户</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.accountStatus === 'suspended' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">封停</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">正常</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.dailyUsage ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {u.totpEnabled
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">TOTP</span>
                          : null}
                        {u.passkeyEnabled
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Passkey</span>
                          : null}
                        {u.requireFingerprint
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">需指纹</span>
                          : null}
                        {!u.totpEnabled && !u.passkeyEnabled && !u.requireFingerprint && (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </div>
                    </td>
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
                    <td className="px-4 py-3">
                      {(() => {
                        const translationStatus = getTranslationStatus(u);
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${translationStatus.className}`}>
                            {translationStatus.label}
                          </span>
                        );
                      })()}
                    </td>
                    {/* 指纹列 */}
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {(() => {
                        const latestFingerprint = getLatestFingerprint(u.fingerprints) || u.latestFingerprint || null;
                        const fingerprintCount = getUserFingerprintCount(u);

                        if (fingerprintCount > 0) {
                          return (
                            <div className="space-y-1">
                              {latestFingerprint ? (
                                <>
                                  <div>
                                    最新: <span className="font-mono" title={latestFingerprint.id}>{latestFingerprint.id.slice(0, 12)}{latestFingerprint.id.length > 12 ? '…' : ''}</span>
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    {new Date(latestFingerprint.ts).toLocaleString()} · {fingerprintCount} 条
                                  </div>
                                </>
                              ) : (
                                <div className="text-[10px] text-gray-500">已有 {fingerprintCount} 条记录</div>
                              )}
                              <motion.button
                                className="text-blue-600 hover:underline text-[11px]"
                                onClick={() => openFp(u)}
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.95)}
                              >查看全部</motion.button>
                            </div>
                          );
                        }

                        return (
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
                                    } catch (e: unknown) {
                                      setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
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
                                    } catch (e: unknown) {
                                      setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
                                    }
                                  }}
                                  whileHover={hoverScale(1.02)}
                                  whileTap={tapScale(0.95)}
                                >请求上报</motion.button>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <motion.button
                          className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600 transition"
                          onClick={() => openRevealPassword(u)}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >
                          查看密码
                        </motion.button>
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
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm text-gray-600">
              <div>第 {pagination.page} / {pagination.totalPages} 页，当前显示 {rangeStart}-{rangeEnd} 条</div>
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                  whileHover={hoverScale(1.02, pagination.page > 1)}
                  whileTap={tapScale(0.95, pagination.page > 1)}
                >
                  首页
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                  whileHover={hoverScale(1.02, pagination.page > 1)}
                  whileTap={tapScale(0.95, pagination.page > 1)}
                >
                  上一页
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                  whileHover={hoverScale(1.02, pagination.page < pagination.totalPages)}
                  whileTap={tapScale(0.95, pagination.page < pagination.totalPages)}
                >
                  下一页
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setPage(pagination.totalPages)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                  whileHover={hoverScale(1.02, pagination.page < pagination.totalPages)}
                  whileTap={tapScale(0.95, pagination.page < pagination.totalPages)}
                >
                  尾页
                </motion.button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* 指纹详情弹窗 */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {revealPasswordState.open && revealPasswordState.targetUser && (
            <motion.div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
                initial={{ scale: 0.95, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 20, opacity: 0 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    查看密码 - {revealPasswordState.targetUser.username}
                  </h3>
                  <motion.button
                    className="text-gray-500 hover:text-gray-700"
                    onClick={closeRevealPassword}
                    whileHover={hoverScale(1.02)}
                    whileTap={tapScale(0.95)}
                  >
                    ✕
                  </motion.button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">查看原因</label>
                    <textarea
                      rows={3}
                      value={revealPasswordState.reason}
                      onChange={e => setRevealPasswordState(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                      placeholder="请输入查看原因（4-200字符）"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">二次验证方式</label>
                    <select
                      value={revealPasswordState.method}
                      onChange={e => setRevealPasswordState(prev => ({
                        ...prev,
                        method: e.target.value as RevealPasswordMethod,
                        password: '',
                        verificationCode: '',
                        verificationToken: '',
                        revealedPassword: '',
                      }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                    >
                      <option value="password">管理员密码</option>
                      <option value="totp">TOTP 验证码</option>
                      <option value="passkey">Passkey</option>
                    </select>
                  </div>

                  {revealPasswordState.method === 'password' ? (
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1">管理员密码</label>
                      <input
                        type="password"
                        value={revealPasswordState.password}
                        onChange={e => setRevealPasswordState(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                        placeholder="请输入当前管理员密码"
                      />
                    </div>
                  ) : revealPasswordState.method === 'totp' ? (
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1">TOTP 验证码</label>
                      <input
                        type="text"
                        value={revealPasswordState.verificationCode}
                        onChange={e => setRevealPasswordState(prev => ({ ...prev, verificationCode: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                        placeholder="请输入 6 位验证码"
                      />
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
                      Passkey 将使用当前管理员账号 {user?.username || ''} 进行验证
                    </div>
                  )}

                  {revealPasswordState.revealedPassword && (
                    <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                      <div className="text-sm font-semibold text-indigo-700 mb-1">明文密码</div>
                      <div className="font-mono text-sm break-all text-gray-800">
                        {revealPasswordState.revealedPassword}
                      </div>
                      <div className="mt-2 text-xs text-indigo-600">30 秒后自动隐藏</div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <motion.button
                      type="button"
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition font-medium disabled:opacity-60"
                      onClick={handleVerifyRevealPassword}
                      disabled={revealPasswordState.loading}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >
                      {revealPasswordState.loading ? '处理中...' : revealPasswordState.revealedPassword ? '重新验证并查看' : '验证并查看密码'}
                    </motion.button>
                    <motion.button
                      type="button"
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                      onClick={closeRevealPassword}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >
                      关闭
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

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
                        } catch (e: unknown) {
                          setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
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
                          setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, ...buildFingerprintListPatch(next) } : u));
                          setNotification({ type: 'success', message: '已清空全部指纹记录' });
                        } catch (e: unknown) {
                          setNotification({ type: 'error', message: getErrorMessage(e, '清空指纹失败') });
                        }
                      }}
                      whileHover={hoverScale(1.02)}
                      whileTap={tapScale(0.95)}
                    >清空全部</motion.button>
                    <motion.button className="text-gray-500 hover:text-gray-700" onClick={() => setShowFpModal(false)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.95)}>✕</motion.button>
                  </div>
                </div>
                {fpLoading ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    <FaSyncAlt className="mx-auto mb-2 animate-spin text-blue-500" />
                    正在加载指纹详情...
                  </div>
                ) : fpUser.fingerprints && fpUser.fingerprints.length > 0 ? (
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
                                setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, ...buildFingerprintListPatch(next) } : u));
                                setNotification({ type: 'success', message: '已删除指纹记录' });
                              } catch (e: unknown) {
                                setNotification({ type: 'error', message: getErrorMessage(e, '删除指纹失败') });
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
                        } catch (e: unknown) {
                          setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
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
                        } catch (e: unknown) {
                          setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
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
