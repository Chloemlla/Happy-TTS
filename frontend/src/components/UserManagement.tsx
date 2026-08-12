import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../api/api';
import { getClientOrigin } from '../api/passkey';
import { getSignHeaders } from '../utils/requestSigner';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isAdminRole, isSuperAdmin } from '../utils/rbac';
import { useNotification } from './Notification';
import {
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaTimes,
  FaList,
  FaSearch,
  FaSyncAlt,
  FaUsers,
  FaUserShield,
  FaStar,
  FaBan,
  FaChartLine,
  FaCrown,
  FaFingerprint,
  FaLanguage,
  FaLock,
  FaEye,
} from 'react-icons/fa';

import {
  InfoPanel,
  InfoSectionTitle,
  InfoMetricCard,
  logShareInputClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
  logShareDangerButtonClass,
} from './LogShareStyleScaffold';

import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  BULK_ACTION_OPTIONS,
  CreateUserForm,
  DEFAULT_PAGINATION,
  DEFAULT_STATS,
  DEFAULT_USER_LIST_FILTERS,
  EditUserForm,
  PAGE_SIZE_OPTIONS,
  ROLE_FILTER_OPTIONS,
  SECURITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  TABLE_COLUMNS,
  TICKET_FILTER_OPTIONS,
  TRANSLATION_FILTER_OPTIONS,
  buildFingerprintListPatch,
  createDefaultCollapsedSections,
  getAdminPasskeyAuthResponse,
  getLatestFingerprint,
  getUserFingerprintCount,
  parseBackupCodes,
  type BulkUserAction,
  type CollapsedSectionState,
  type CollapsibleSectionKey,
  type UserFormChangeHandler,
  type UserListAccountStatusFilter,
  type UserListFilters,
  type UserListPagination,
  type UserListRoleFilter,
  type UserListSecurityFilter,
  type UserListSortOrder,
  type UserListStats,
  type UserListTicketFilter,
  type UserListTranslationFilter,
} from './user-management/UserFormControls';
import {
  RevealPasswordModal,
  type RevealPasswordMethod,
  type RevealPasswordState as ModalRevealPasswordState,
} from './user-management/RevealPasswordModal';

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
  deviceInfo?: {
    screen?: { w?: number; h?: number };
    timezone?: { tz?: string };
    navigator?: { userAgent?: string };
    [key: string]: unknown;
  };
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
  ticketViolationCount?: number;
  ticketBannedUntil?: string;
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: 'active' | 'suspended';
}

interface RevealPasswordState {
  open: boolean;
  targetUser: { id: string; username: string } | null;
  reason: string;
  method: RevealPasswordMethod;
  password: string;
  verificationCode: string;
  verificationToken: string;
  revealedPassword: string;
  loading: boolean;
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

const cardClass =
  'rounded-[26px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl';

const glassInputClass =
  'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';

const glassSelectClass =
  'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm text-slate-900 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300';

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
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
  const hoverScale = React.useCallback((_scale?: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale: 1.01 } : undefined
  ), [prefersReducedMotion]);
  const tapScale = React.useCallback((_scale?: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale: 0.97 } : undefined
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
      return { label: '已停用', className: 'bg-slate-100 text-slate-600' };
    }
    if (limitedUntil) {
      return { label: `限制至 ${limitedUntil}`, className: 'bg-amber-50 text-amber-700' };
    }
    return { label: '正常', className: 'bg-emerald-50 text-emerald-700' };
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = String(form.username || '').trim();
    const email = String(form.email || '').trim();
    const password = String(form.password || '');
    if (!username) {
      const message = '用户名不能为空';
      setError(message);
      setNotification({ type: 'error', message });
      return;
    }
    if (!email) {
      const message = '邮箱不能为空';
      setError(message);
      setNotification({ type: 'error', message });
      return;
    }
    if (!editingUser && !password.trim()) {
      const message = '创建用户时密码不能为空';
      setError(message);
      setNotification({ type: 'error', message });
      return;
    }
    // 防锁死：禁止修改自身角色（后端 403 镜像）
    if (editingUser && editingUser.username === user?.username && form.role !== editingUser.role) {
      const message = '不允许修改自身角色';
      setError(message);
      setNotification({ type: 'error', message });
      return;
    }
    // 防锁死：禁止降级最后一个超级管理员（后端 409 镜像）
    if (
      editingUser &&
      editingUser.role === 'superadmin' &&
      form.role !== 'superadmin' &&
      stats.superadmins <= 1
    ) {
      const message = '无法降级最后一个超级管理员';
      setError(message);
      setNotification({ type: 'error', message });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const method = editingUser ? 'put' : 'post';
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const submitData: Partial<User> & Record<string, unknown> = {
        ...form,
        username,
        email,
      };
      if (editingUser && !submitData.password) {
        delete submitData.password;
      }
      delete submitData.fingerprints;
      delete submitData.passkeyCredentials;
      await api.request({ url, method, data: submitData });
      closeForm();
      setNotification({ type: 'success', message: editingUser ? '用户信息已更新' : '用户已创建' });
      fetchUsers(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e, '操作失败'));
      setNotification({ type: 'error', message: getErrorMessage(e, '操作失败') });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/admin/users/${id}`);
      setNotification({ type: 'success', message: '用户已删除' });
      fetchUsers(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e, '删除失败'));
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

    // 防锁死：批量封停不得覆盖自己或最后一个超级管理员（后端 409 镜像）
    if (bulkAction === 'suspend') {
      const selectedUsers = users.filter(u => selectedUserIds.includes(u.id));
      const selectedSuperAdmins = selectedUsers.filter(u => u.role === 'superadmin').length;
      if (selectedSuperAdmins > 0 && stats.superadmins <= selectedSuperAdmins) {
        setNotification({ type: 'error', message: '无法封停最后一个超级管理员' });
        return;
      }
      if (selectedUsers.some(u => u.username === user?.username)) {
        setNotification({ type: 'error', message: '不能封停自己' });
        return;
      }
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
      setError(getErrorMessage(e, '批量操作失败'));
      setNotification({ type: 'error', message: getErrorMessage(e, '批量操作失败') });
    } finally {
      setLoading(false);
    }
  }, [bulkAction, fetchUsers, selectedUserIds, setNotification, stats, user, users]);

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
      targetUser: { id: u.id, username: u.username },
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
    { label: '总用户', value: stats.total, icon: FaUsers, tone: 'slate' as const },
    { label: '超级管理员', value: stats.superadmins, icon: FaCrown, tone: 'rose' as const },
    { label: '管理员', value: stats.admins, icon: FaUserShield, tone: 'rose' as const },
    { label: '信用者', value: stats.trusted, icon: FaStar, tone: 'emerald' as const },
    { label: '封停账户', value: stats.suspended, icon: FaBan, tone: 'slate' as const },
    { label: '今日用量', value: stats.totalDailyUsage, icon: FaChartLine, tone: 'slate' as const },
    { label: '需指纹', value: stats.fingerprintRequired, icon: FaFingerprint, tone: 'amber' as const },
    { label: '翻译受限', value: stats.translationDisabled + stats.translationLimited, icon: FaLanguage, tone: 'violet' as const },
  ], [stats]);

  // 防锁死：不能删除自己或最后一个超级管理员（后端 403/409 镜像）
  const canDeleteUser = (u: User): boolean => (
    u.username !== user?.username && !(u.role === 'superadmin' && stats.superadmins <= 1)
  );
  const deleteDisabledReason = (u: User): string | undefined => {
    if (u.username === user?.username) return '不能删除自己';
    if (u.role === 'superadmin' && stats.superadmins <= 1) return '无法删除最后一个超级管理员';
    return undefined;
  };

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

  const glassCheckbox = 'w-4 h-4 rounded border-slate-300 text-slate-700 focus:ring-slate-400';

  if (!user || !isAdminRole(user.role)) {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className={cardClass}>
          <div className="p-5 sm:p-7">
            <h2 className="text-xl font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FaLock className="text-rose-500" />
              访问被拒绝
            </h2>
            <div className="text-slate-600 space-y-2">
              <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
              <div className="text-sm text-rose-500 italic">
                用户管理仅限管理员使用
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 text-slate-900 sm:py-12">
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* 标题和说明 */}
        <InfoPanel>
          <InfoSectionTitle
            title="用户管理"
            description="管理系统用户账户，支持查看与修改 user_datas 集合的所有字段。"
            icon={FaUsers}
            action={canWrite ? (
              <motion.button
                onClick={openCreate}
                className={logSharePrimaryButtonClass}
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                <FaUserPlus className="text-sm" />
                添加用户
              </motion.button>
            ) : undefined}
          />
          <div className="space-y-2 text-sm leading-6 text-slate-600">
            <p className="font-semibold text-slate-700">功能说明：</p>
            <ul className="list-disc list-inside space-y-1">
              <li>按角色、账户状态、安全状态、工单状态和翻译权限筛选用户</li>
              <li>添加 / 编辑 / 删除用户，支持分页排序和批量运营动作</li>
              <li>直接修改 dailyUsage、requireFingerprint、翻译权限与账户状态等运营字段</li>
              <li>管理用户指纹记录（查看 / 删除 / 清空）</li>
              <li>列表轻量加载，完整指纹详情按需读取</li>
            </ul>
          </div>
        </InfoPanel>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {statCards.map(item => (
            <InfoMetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              className={`${cardClass} p-4`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 text-rose-700">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
              {error.includes('认证失败') && (
                <div className="mt-3">
                  <motion.button
                    onClick={() => navigate('/welcome')}
                    className={logSharePrimaryButtonClass}
                    whileHover={hoverScale()}
                    whileTap={tapScale()}
                  >
                    重新登录
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 用户列表 */}
        <InfoPanel>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <FaList className="text-lg text-slate-500" />
              用户列表
              <span className="text-sm font-normal text-slate-500">
                {rangeStart}-{rangeEnd} / {pagination.total}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={() => fetchUsers(true)}
                className={logShareSecondaryButtonClass}
                whileHover={hoverScale()}
                whileTap={tapScale()}
              >
                <FaSyncAlt className="text-xs" />
                刷新
              </motion.button>
              {canWrite && (
                <motion.button
                  onClick={openCreate}
                  className={logSharePrimaryButtonClass}
                  whileHover={hoverScale()}
                  whileTap={tapScale()}
                >
                  <FaUserPlus className="text-sm" />
                  添加用户
                </motion.button>
              )}
            </div>
          </div>

          {/* 筛选栏 */}
          <div className={`mb-4 space-y-3 ${cardClass} p-4`}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="relative">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  value={pendingFilters.keyword}
                  onChange={e => updatePendingFilter('keyword', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') applyFilters();
                  }}
                  placeholder="搜索用户名、邮箱、ID、IP"
                  className={`${glassInputClass} pl-10`}
                />
              </div>
              <select
                value={pendingFilters.role}
                onChange={e => updatePendingFilter('role', e.target.value as UserListRoleFilter)}
                className={glassSelectClass}
              >
                {ROLE_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={pendingFilters.accountStatus}
                onChange={e => updatePendingFilter('accountStatus', e.target.value as UserListAccountStatusFilter)}
                className={glassSelectClass}
              >
                {ACCOUNT_STATUS_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={pendingFilters.security}
                onChange={e => updatePendingFilter('security', e.target.value as UserListSecurityFilter)}
                className={glassSelectClass}
              >
                {SECURITY_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={pendingFilters.ticket}
                onChange={e => updatePendingFilter('ticket', e.target.value as UserListTicketFilter)}
                className={glassSelectClass}
              >
                {TICKET_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={pendingFilters.translation}
                onChange={e => updatePendingFilter('translation', e.target.value as UserListTranslationFilter)}
                className={glassSelectClass}
              >
                {TRANSLATION_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={pendingFilters.sortBy}
                  onChange={e => updatePendingFilter('sortBy', e.target.value)}
                  className={glassSelectClass}
                >
                  {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select
                  value={pendingFilters.sortOrder}
                  onChange={e => updatePendingFilter('sortOrder', e.target.value as UserListSortOrder)}
                  className={glassSelectClass}
                >
                  <option value="desc">降序</option>
                  <option value="asc">升序</option>
                </select>
              </div>
              <select
                value={pendingFilters.pageSize}
                onChange={e => updatePendingFilter('pageSize', Number(e.target.value))}
                className={glassSelectClass}
              >
                {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>每页 {size} 条</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-xs text-slate-500">
                当前筛选 {filteredStats.total} 个用户，超级管理员 {filteredStats.superadmins} 个，管理员 {filteredStats.admins} 个，信用者 {filteredStats.trusted} 个，封停 {filteredStats.suspended} 个
                {hasActiveFilters ? '，已启用筛选' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  onClick={applyFilters}
                  className={logSharePrimaryButtonClass}
                  whileHover={hoverScale()}
                  whileTap={tapScale()}
                >
                  应用筛选
                </motion.button>
                <motion.button
                  type="button"
                  onClick={resetFilters}
                  className={logShareSecondaryButtonClass}
                  whileHover={hoverScale()}
                  whileTap={tapScale()}
                >
                  重置
                </motion.button>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-t border-slate-200 pt-3">
              <div className="text-sm text-slate-600">已选择 {selectedUserIds.length} 个用户</div>
              {canWrite && (
              <div className="flex flex-wrap gap-2">
                <select
                  value={bulkAction}
                  onChange={e => setBulkAction(e.target.value as BulkUserAction | '')}
                  className={glassSelectClass}
                >
                  <option value="">选择批量操作</option>
                  {BULK_ACTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <motion.button
                  type="button"
                  onClick={handleBulkAction}
                  disabled={selectedUserIds.length === 0 || !bulkAction || loading}
                  className={logSharePrimaryButtonClass}
                  whileHover={hoverScale(undefined, selectedUserIds.length > 0 && Boolean(bulkAction) && !loading)}
                  whileTap={tapScale(undefined, selectedUserIds.length > 0 && Boolean(bulkAction) && !loading)}
                >
                  执行
                </motion.button>
              </div>
              )}
            </div>
          </div>

          {/* 添加/编辑用户表单 */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                className={`mb-6 ${cardClass} p-4`}
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

          {/* 用户表格 */}
          {loading ? (
            <div className="text-center py-8 text-slate-500">
              <FaSyncAlt className="animate-spin h-8 w-8 mx-auto mb-4 text-slate-500" />
              加载中...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="px-2 sm:px-4 py-3 text-left font-semibold whitespace-nowrap">
                      {canWrite && (
                      <input
                        type="checkbox"
                        checked={allCurrentPageSelected}
                        onChange={() => toggleCurrentPageSelection()}
                        className={glassCheckbox}
                        aria-label="选择当前页用户"
                      />
                      )}
                    </th>
                    {TABLE_COLUMNS.map(col => (
                      <th key={col.key} className="px-2 sm:px-4 py-3 text-left font-semibold whitespace-nowrap">{col.label}</th>
                    ))}
                    <th className="px-2 sm:px-4 py-3 text-left font-semibold">指纹</th>
                    <th className="px-2 sm:px-4 py-3 text-left font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <motion.tr
                      key={u.id}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                      initial={ROW_INITIAL}
                      animate={ROW_ANIMATE}
                      transition={{ duration: 0.3, delay: 0.05 * idx }}
                    >
                      <td className="px-2 sm:px-4 py-3">
                        {canWrite && (
                        <input
                          type="checkbox"
                          checked={selectedUserIdSet.has(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          className={glassCheckbox}
                          aria-label={`选择用户 ${u.username}`}
                        />
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 font-medium">
                        <div>{u.username}</div>
                        <div className="text-[11px] text-slate-400 font-normal">ID {u.id}</div>
                        {u.authProvider && u.authProvider !== 'local' && (
                          <div className="text-[11px] text-slate-500 font-normal">{u.authProvider}</div>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-slate-600">
                        <div>{u.email}</div>
                        {u.lastLoginIp && <div className="text-[11px] text-slate-400">IP {u.lastLoginIp}</div>}
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        {u.role === 'superadmin' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">超级管理员</span>
                        ) : u.role === 'admin' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">管理员</span>
                        ) : u.role === 'trusted' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">信用者</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">普通用户</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        {u.accountStatus === 'suspended' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">封停</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">正常</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-slate-600 text-xs">{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</td>
                      <td className="px-2 sm:px-4 py-3 text-slate-600">{u.dailyUsage ?? 0}</td>
                      <td className="px-2 sm:px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {u.totpEnabled
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">TOTP</span>
                            : null}
                          {u.passkeyEnabled
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Passkey</span>
                            : null}
                          {u.requireFingerprint
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">需指纹</span>
                            : null}
                          {!u.totpEnabled && !u.passkeyEnabled && !u.requireFingerprint && (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {u.ticketViolationCount && u.ticketViolationCount > 0 ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${u.ticketViolationCount >= 3 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                              违规: {u.ticketViolationCount} 次
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              正常
                            </span>
                          )}
                          {getBanRemainingText(u.ticketBannedUntil) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium bg-rose-50 text-rose-600 border border-rose-200 italic">
                              {getBanRemainingText(u.ticketBannedUntil)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        {(() => {
                          const translationStatus = getTranslationStatus(u);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${translationStatus.className} border`}>
                              {translationStatus.label}
                            </span>
                          );
                        })()}
                      </td>
                      {/* 指纹列 */}
                      <td className="px-2 sm:px-4 py-3 text-slate-600 text-xs">
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
                                    <div className="text-[10px] text-slate-500">
                                      {new Date(latestFingerprint.ts).toLocaleString()} · {fingerprintCount} 条
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-[10px] text-slate-500">已有 {fingerprintCount} 条记录</div>
                                )}
                                <motion.button
                                  className="text-slate-600 hover:underline text-[11px]"
                                  onClick={() => openFp(u)}
                                  whileHover={hoverScale()}
                                  whileTap={tapScale()}
                                >查看全部</motion.button>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-1">
                              {fpRequireMap[u.id] ? (
                                <>
                                  <div className="text-slate-600 text-[12px]">已在预约列表</div>
                                  <div className="text-[10px] text-slate-500">上次预约：{new Date(fpRequireMap[u.id]).toLocaleString()}</div>
                                  {canWrite && (
                                  <motion.button
                                    className="text-slate-600 hover:underline text-[11px]"
                                    onClick={async () => {
                                      try {
                                        await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                        setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                        setNotification({ type: 'success', message: '已再次请求该用户下次上报指纹' });
                                      } catch (e: unknown) {
                                        setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
                                      }
                                    }}
                                    whileHover={hoverScale()}
                                    whileTap={tapScale()}
                                  >再次请求</motion.button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-slate-400">暂无</span>
                                  {canWrite && (
                                  <motion.button
                                    className="text-slate-600 hover:underline text-[11px] block"
                                    onClick={async () => {
                                      try {
                                        await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                        setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                        setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
                                      } catch (e: unknown) {
                                        setNotification({ type: 'error', message: getErrorMessage(e, '请求失败') });
                                      }
                                    }}
                                    whileHover={hoverScale()}
                                    whileTap={tapScale()}
                                  >请求上报</motion.button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        {canWrite ? (
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                          <motion.button
                            className={logShareSecondaryButtonClass}
                            onClick={() => openRevealPassword(u)}
                            whileHover={hoverScale()}
                            whileTap={tapScale()}
                          >
                            <FaEye className="text-xs" />
                            查看密码
                          </motion.button>
                          <motion.button
                            className={logShareSecondaryButtonClass}
                            onClick={() => openEdit(u)}
                            whileHover={hoverScale()}
                            whileTap={tapScale()}
                          >
                            <FaEdit className="text-xs" />
                            编辑
                          </motion.button>
                          <motion.button
                            className={`${logShareDangerButtonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                            onClick={() => handleDelete(u.id)}
                            disabled={!canDeleteUser(u)}
                            title={deleteDisabledReason(u)}
                            whileHover={hoverScale(undefined, canDeleteUser(u))}
                            whileTap={tapScale(undefined, canDeleteUser(u))}
                          >
                            <FaTrash className="text-xs" />
                            删除
                          </motion.button>
                        </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <FaUsers className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  暂无用户数据
                </div>
              )}
              {/* 分页 */}
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm text-slate-600">
                <div>第 {pagination.page} / {pagination.totalPages} 页，当前显示 {rangeStart}-{rangeEnd} 条</div>
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={pagination.page <= 1}
                    className={logShareSecondaryButtonClass}
                    whileHover={hoverScale(undefined, pagination.page > 1)}
                    whileTap={tapScale(undefined, pagination.page > 1)}
                  >
                    首页
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setPage(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className={logShareSecondaryButtonClass}
                    whileHover={hoverScale(undefined, pagination.page > 1)}
                    whileTap={tapScale(undefined, pagination.page > 1)}
                  >
                    上一页
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setPage(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className={logShareSecondaryButtonClass}
                    whileHover={hoverScale(undefined, pagination.page < pagination.totalPages)}
                    whileTap={tapScale(undefined, pagination.page < pagination.totalPages)}
                  >
                    下一页
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setPage(pagination.totalPages)}
                    disabled={pagination.page >= pagination.totalPages}
                    className={logShareSecondaryButtonClass}
                    whileHover={hoverScale(undefined, pagination.page < pagination.totalPages)}
                    whileTap={tapScale(undefined, pagination.page < pagination.totalPages)}
                  >
                    尾页
                  </motion.button>
                </div>
              </div>
            </div>
          )}
        </InfoPanel>

        {/* 查看密码弹窗 */}
        {ReactDOM.createPortal(
          <AnimatePresence>
            {revealPasswordState.open && revealPasswordState.targetUser && (
              <RevealPasswordModal
                state={revealPasswordState}
                adminUsername={user?.username}
                hoverScale={hoverScale}
                tapScale={tapScale}
                onClose={closeRevealPassword}
                onChange={(patch: Partial<ModalRevealPasswordState>) => setRevealPasswordState(prev => ({ ...prev, ...patch }))}
                onVerify={handleVerifyRevealPassword}
              />
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* 指纹详情弹窗 */}
        {ReactDOM.createPortal(
          <AnimatePresence>
            {showFpModal && fpUser && (
              <motion.div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="w-full max-w-2xl rounded-[26px] border border-white/70 bg-white/82 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl p-5 sm:p-7 max-h-[90vh] overflow-y-auto overscroll-contain"
                  initial={{ scale: 0.95, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">指纹详情 - {fpUser.username}</h3>
                    <div className="flex items-center gap-2">
                      {canWrite && (
                      <motion.button
                        className={logShareSecondaryButtonClass}
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
                        whileHover={hoverScale()}
                        whileTap={tapScale()}
                      >请求下次上报</motion.button>
                      )}
                      {canWrite && (
                      <motion.button
                        className={logShareDangerButtonClass}
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
                        whileHover={hoverScale()}
                        whileTap={tapScale()}
                      >清空全部</motion.button>
                      )}
                      <motion.button className="text-slate-500 hover:text-slate-700 p-1" onClick={() => setShowFpModal(false)} whileHover={hoverScale()} whileTap={tapScale()}>
                        <FaTimes />
                      </motion.button>
                    </div>
                  </div>
                  {fpLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                      <FaSyncAlt className="mx-auto mb-2 animate-spin text-slate-500" />
                      正在加载指纹详情...
                    </div>
                  ) : fpUser.fingerprints && fpUser.fingerprints.length > 0 ? (
                    <div className="max-h-96 overflow-auto space-y-3">
                      {fpUser.fingerprints.map((fp, i) => (
                        <div key={i} className="p-4 rounded-[22px] border border-slate-200 bg-white/80 shadow-sm backdrop-blur-xl">
                          <div className="text-xs text-slate-500 mb-1">{new Date(fp.ts).toLocaleString()} · IP {fp.ip || '-'} </div>
                          <div className="font-mono break-all text-sm">{fp.id}</div>
                          {fp.ua && <div className="text-[11px] text-slate-500 mt-1 break-all">{fp.ua}</div>}
                          {fp.deviceInfo && (
                            <div className="mt-2 p-3 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs">
                              <div className="font-medium text-slate-700 mb-1">设备特征:</div>
                              <div className="grid grid-cols-2 gap-1 text-slate-600">
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
                                <summary className="cursor-pointer text-slate-600 hover:text-slate-800">详细信息</summary>
                                <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                                  {JSON.stringify(fp.deviceInfo, null, 2)}
                                </pre>
                              </details>
                            </div>
                          )}
                          <div className="mt-2 flex gap-2">
                            <motion.button
                              className={logShareSecondaryButtonClass}
                              onClick={async () => {
                                try {
                                  await navigator.clipboard?.writeText(fp.id);
                                  setNotification({ type: 'success', message: '指纹ID已复制到剪贴板' });
                                } catch {
                                  setNotification({ type: 'error', message: '复制失败，请手动复制' });
                                }
                              }}
                              whileHover={hoverScale()}
                              whileTap={tapScale()}
                            >复制ID</motion.button>
                            {canWrite && (
                            <motion.button
                              className={logShareDangerButtonClass}
                              onClick={async () => {
                                if (!fpUser) return;
                                if (!window.confirm('确定要删除该指纹记录吗？')) return;
                                try {
                                  const res = await api.delete(`/api/admin/users/${fpUser.id}/fingerprints/${encodeURIComponent(fp.id)}`, {
                                    params: { ts: fp.ts },
                                  });
                                  const next = res?.data?.fingerprints || [];
                                  setFpUser({ ...fpUser, fingerprints: next });
                                  setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, ...buildFingerprintListPatch(next) } : u));
                                  setNotification({ type: 'success', message: '已删除指纹记录' });
                                } catch (e: unknown) {
                                  setNotification({ type: 'error', message: getErrorMessage(e, '删除指纹失败') });
                                }
                              }}
                              whileHover={hoverScale()}
                              whileTap={tapScale()}
                            >删除</motion.button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      暂无指纹记录
                    </div>
                  )}
                  {fpRequireMap[fpUser.id] ? (
                    <div className="mt-2">
                      <div className="text-slate-600 text-sm">已在预约列表</div>
                      <div className="text-[12px] text-slate-500">上次预约：{new Date(fpRequireMap[fpUser.id]).toLocaleString()}</div>
                      {canWrite && (
                      <motion.button
                        className="text-slate-600 hover:underline text-[12px]"
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
                        whileHover={hoverScale()}
                        whileTap={tapScale()}
                      >再次请求</motion.button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2">
                      {canWrite && (
                      <motion.button
                        className="text-slate-600 hover:underline text-[12px]"
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
                        whileHover={hoverScale()}
                        whileTap={tapScale()}
                      >请求上报</motion.button>
                      )}
                    </div>
                  )}
                  <div className="mt-4 text-right">
                    <motion.button
                      className={logShareSecondaryButtonClass}
                      onClick={() => setShowFpModal(false)}
                      whileHover={hoverScale()}
                      whileTap={tapScale()}
                    >
                      关闭
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </motion.div>
    </section>
  );
};

export default UserManagement;