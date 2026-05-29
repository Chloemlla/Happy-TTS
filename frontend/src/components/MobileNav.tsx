import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  FaBars,
  FaBirthdayCake,
  FaBook,
  FaBug,
  FaChartBar,
  FaCheckCircle,
  FaChevronDown,
  FaComments,
  FaDatabase,
  FaDollarSign,
  FaEnvelope,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileAlt,
  FaFlask,
  FaFont,
  FaGamepad,
  FaGavel,
  FaGift,
  FaHeadset,
  FaImage,
  FaLanguage,
  FaLink,
  FaList,
  FaLock,
  FaLockOpen,
  FaPaperPlane,
  FaPlusCircle,
  FaSearch,
  FaShareAlt,
  FaShieldAlt,
  FaSignOutAlt,
  FaStore,
  FaTimes,
  FaUser,
  FaUserPlus,
  FaUserShield,
  FaVolumeUp,
} from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { useAuth } from '../hooks/useAuth';
import type { User } from '../types/auth';

interface MobileNavProps {
  user: User | null;
  logout: () => void;
  onTOTPManagerOpen: () => void;
  totpStatus?: { enabled: boolean } | null;
}

type NavTone = 'indigo' | 'emerald' | 'violet' | 'cyan' | 'pink';

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  color: string;
  tone?: NavTone;
  matchChildren?: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

const MENU_PANEL_ID = 'mobile-nav-panel';
const ACCOUNT_LIST_ID = 'mobile-nav-account-list';

const activeDesktopClasses: Record<NavTone, string> = {
  indigo: 'bg-indigo-600 text-white shadow-md',
  emerald: 'bg-emerald-600 text-white shadow-md',
  violet: 'bg-violet-600 text-white shadow-md',
  cyan: 'bg-cyan-600 text-white shadow-md',
  pink: 'bg-pink-100 text-pink-700 shadow-sm',
};

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const getRoleLabel = (role: string) => (role === 'admin' ? '管理员' : '用户');

const Avatar: React.FC<{
  src?: string;
  username?: string;
  sizeClassName: string;
  iconClassName?: string;
  decorative?: boolean;
  onImageError?: () => void;
}> = ({ src, username, sizeClassName, iconClassName = 'text-indigo-400', decorative = false, onImageError }) => (
  <div className={cn(sizeClassName, 'rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-200 shrink-0')}>
    {src ? (
      <img
        src={src}
        alt={decorative ? '' : `${username || '用户'}头像`}
        className="w-full h-full object-cover"
        onError={onImageError}
      />
    ) : (
      <FaUser className={iconClassName} aria-hidden="true" />
    )}
  </div>
);

const MobileNav: React.FC<MobileNavProps> = React.memo(({
  user,
  logout,
  onTOTPManagerOpen,
  totpStatus,
}) => {
  const { savedAccounts, switchAccount, removeAccountFromList, logoutAll } = useAuth();
  const location = useLocation();
  const twoFactorStatus = useTwoFactorStatus();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setShowAccountSwitcher(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((open) => !open);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateMobileState = () => setIsMobile(mediaQuery.matches);

    updateMobileState();
    mediaQuery.addEventListener('change', updateMobileState);
    return () => mediaQuery.removeEventListener('change', updateMobileState);
  }, []);

  useEffect(() => {
    closeMenu();
  }, [closeMenu, location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, isMenuOpen]);

  useEffect(() => {
    if (!user) {
      setAvatarImg(undefined);
      return undefined;
    }

    const fallbackAvatar = user.avatarUrl?.trim() || undefined;
    setAvatarImg(fallbackAvatar);

    const token = localStorage.getItem('token');
    if (!token) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    const fetchProfileAvatar = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/admin/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data = await response.json() as { avatarUrl?: string };
        const nextAvatar = data.avatarUrl?.trim() || fallbackAvatar;
        if (!cancelled) setAvatarImg(nextAvatar);
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') {
          setAvatarImg(fallbackAvatar);
        }
      }
    };

    void fetchProfileAvatar();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.avatarUrl, user?.id]);

  const canUseTranslation = user?.isTranslationEnabled !== false;
  const isAdmin = user?.role === 'admin';

  const desktopItems = useMemo<NavItem[]>(() => [
    { to: '/', label: '语音合成', icon: FaVolumeUp, color: 'text-indigo-500', tone: 'indigo' },
    { to: '/store', label: '资源商店', icon: FaStore, color: 'text-emerald-500', tone: 'emerald', matchChildren: true },
    ...(canUseTranslation
      ? [{ to: '/translate', label: '翻译', icon: FaLanguage, color: 'text-violet-500', tone: 'violet' as const }]
      : []),
    { to: '/support', label: '支持中心', icon: FaHeadset, color: 'text-cyan-500', tone: 'cyan' },
    ...(isAdmin
      ? [{ to: '/admin', label: '管理', icon: FaUserShield, color: 'text-pink-500', tone: 'pink' as const }]
      : []),
  ], [canUseTranslation, isAdmin]);

  const menuGroups = useMemo<NavGroup[]>(() => [
    {
      id: 'core',
      title: '核心功能',
      items: [
        { to: '/', label: '语音合成', icon: FaVolumeUp, color: 'text-indigo-500' },
        { to: '/store', label: '资源商店', icon: FaStore, color: 'text-emerald-500', matchChildren: true },
        { to: '/profile', label: '个人中心', icon: FaUser, color: 'text-orange-500' },
        { to: '/support', label: '支持中心', icon: FaHeadset, color: 'text-cyan-500' },
      ],
    },
    {
      id: 'tools',
      title: '实用工具',
      items: [
        ...(isAdmin
          ? [{ to: '/logshare', label: '日志分享', icon: FaShareAlt, color: 'text-blue-500' }]
          : []),
        ...(canUseTranslation
          ? [{ to: '/translate', label: '文本翻译', icon: FaLanguage, color: 'text-violet-500' }]
          : []),
        { to: '/image-upload', label: '图片上传', icon: FaImage, color: 'text-purple-500' },
        { to: '/public-shortlink', label: '公共短链', icon: FaLink, color: 'text-sky-500' },
        { to: '/case-converter', label: '大小写转换', icon: FaFont, color: 'text-slate-500' },
        { to: '/word-count', label: '字数统计', icon: FaChartBar, color: 'text-amber-500' },
        { to: '/age-calculator', label: '年龄计算', icon: FaBirthdayCake, color: 'text-pink-500' },
        { to: '/markdown-export', label: 'MD 导出', icon: FaFileAlt, color: 'text-gray-600' },
        { to: '/github-billing', label: 'GitHub 账单', icon: FaDollarSign, color: 'text-green-600' },
        ...(isAdmin
          ? [
            { to: '/modlist', label: '模组列表', icon: FaList, color: 'text-indigo-400' },
            { to: '/outemail', label: '外部邮件', icon: FaEnvelope, color: 'text-blue-400' },
          ]
          : []),
      ],
    },
    {
      id: 'playground',
      title: '娱乐与探索',
      items: [
        { to: '/lottery', label: '抽奖系统', icon: FaGift, color: 'text-red-500' },
        { to: '/tiger-adventure', label: '老虎冒险', icon: FaGamepad, color: 'text-orange-600' },
        { to: '/coin-flip', label: '硬币翻转', icon: FaExchangeAlt, color: 'text-yellow-600' },
        { to: '/librechat', label: 'LibreChat', icon: FaComments, color: 'text-teal-500' },
      ],
    },
    {
      id: 'info',
      title: '信息与查询',
      items: [
        { to: '/fbi-wanted', label: 'FBI 通缉', icon: FaSearch, color: 'text-blue-800' },
        { to: '/anti-counterfeit', label: '安踏防伪', icon: FaShieldAlt, color: 'text-red-700' },
        { to: '/campus-emergency', label: '校园紧急', icon: FaExclamationTriangle, color: 'text-amber-600' },
        { to: '/api-docs', label: 'API 文档', icon: FaBook, color: 'text-blue-400' },
        { to: '/policy', label: '服务条款', icon: FaGavel, color: 'text-slate-400' },
      ],
    },
    ...(isAdmin
      ? [{
        id: 'demo',
        title: '测试与演示',
        items: [
          { to: '/demo', label: '演示中心', icon: FaFlask, color: 'text-purple-400', matchChildren: true },
          { to: '/smart-human-check', label: '人机验证', icon: FaBug, color: 'text-rose-400' },
          { to: '/notification-test', label: '通知测试', icon: FaEnvelope, color: 'text-blue-300' },
          { to: '/hcaptcha-verify', label: 'hCaptcha', icon: FaLockOpen, color: 'text-gray-400' },
        ],
      }]
      : []),
  ], [canUseTranslation, isAdmin]);

  const adminGroups = useMemo<NavGroup[]>(() => [
    {
      id: 'admin',
      title: '管理功能',
      items: [
        { to: '/admin', label: '管理后台', icon: FaBars, color: 'text-pink-500' },
        { to: '/admin/users', label: '用户管理', icon: FaUserShield, color: 'text-indigo-600' },
        { to: '/nexai-security', label: '安全监控', icon: FaShieldAlt, color: 'text-red-600' },
        { to: '/admin/lottery', label: '抽奖管理', icon: FaGift, color: 'text-rose-500' },
        { to: '/email-sender', label: '邮件发送', icon: FaPaperPlane, color: 'text-blue-500' },
        { to: '/admin/store', label: '商店管理', icon: FaStore, color: 'text-emerald-600' },
        { to: '/admin/store/resources', label: '资源管理', icon: FaDatabase, color: 'text-cyan-600' },
        { to: '/admin/store/cdks', label: 'CDK 管理', icon: FaList, color: 'text-sky-600' },
        { to: '/tamper-detection-demo', label: '篡改检测', icon: FaBug, color: 'text-orange-500' },
      ],
    },
  ], []);

  const accountsForDisplay = useMemo(() => {
    if (!user) return savedAccounts;
    if (savedAccounts.some((account) => account.user.id === user.id)) {
      return savedAccounts;
    }

    return [{ user, token: localStorage.getItem('token') || '', lastActive: 0 }, ...savedAccounts];
  }, [savedAccounts, user]);

  const effectiveTwoFactorStatus = useMemo(() => {
    const statusTypes = Array.isArray(twoFactorStatus.type) ? twoFactorStatus.type : [];
    const enabled = Boolean(totpStatus?.enabled || twoFactorStatus.enabled);
    const typeText = statusTypes.length > 0 ? statusTypes.join(' / ') : 'TOTP';

    return {
      enabled,
      label: enabled ? typeText : '未启用',
    };
  }, [totpStatus?.enabled, twoFactorStatus.enabled, twoFactorStatus.type]);

  const isRouteActive = useCallback((item: Pick<NavItem, 'to' | 'matchChildren'>) => {
    if (item.to === '/') return location.pathname === '/';
    if (location.pathname === item.to) return true;
    return Boolean(item.matchChildren && location.pathname.startsWith(`${item.to}/`));
  }, [location.pathname]);

  const handleTOTPManager = useCallback(() => {
    closeMenu();
    onTOTPManagerOpen();
  }, [closeMenu, onTOTPManagerOpen]);

  const handleSwitchAccount = useCallback((userId: string) => {
    if (!user) return;
    if (userId === user.id) {
      closeMenu();
      return;
    }

    closeMenu();
    void switchAccount(userId);
  }, [closeMenu, switchAccount, user]);

  const handleRemoveAccount = useCallback((userId: string) => {
    if (window.confirm('确定要移除此账号的保存状态吗？')) {
      removeAccountFromList(userId);
    }
  }, [removeAccountFromList]);

  const handleLogoutAll = useCallback(() => {
    if (window.confirm('确定要退出并清除所有已登录账号的保存状态吗？')) {
      closeMenu();
      logoutAll();
    }
  }, [closeMenu, logoutAll]);

  const handleLogoutCurrent = useCallback(() => {
    closeMenu();
    logout();
  }, [closeMenu, logout]);

  const renderDesktopLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isRouteActive(item);

    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
          active
            ? activeDesktopClasses[item.tone || 'indigo']
            : 'bg-white/50 text-gray-700 hover:bg-white hover:shadow-sm',
        )}
      >
        <Icon className={active ? 'text-current' : item.color} aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const renderNavLink = (item: NavItem, admin = false) => {
    const Icon = item.icon;
    const active = isRouteActive(item);

    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        onClick={closeMenu}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
          active
            ? admin ? 'bg-pink-50 text-pink-700' : 'bg-indigo-50 text-indigo-700'
            : 'text-gray-700 hover:bg-gray-50',
        )}
      >
        <Icon className={cn(item.color, 'shrink-0')} size={16} aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {active && <span className="ml-auto h-2 w-2 rounded-full bg-current" aria-hidden="true" />}
      </Link>
    );
  };

  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      {!isMobile && (
        <nav className="flex items-center gap-2" ref={desktopNavRef} aria-label="桌面导航">
          {desktopItems.map(renderDesktopLink)}
        </nav>
      )}

      <motion.button
        ref={menuButtonRef}
        type="button"
        onClick={toggleMenu}
        className="z-20 flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1.5 pr-3 shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        aria-label={isMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        aria-controls={MENU_PANEL_ID}
      >
        <Avatar
          src={avatarImg}
          username={user.username}
          sizeClassName="h-8 w-8"
          onImageError={() => setAvatarImg(undefined)}
        />
        <span className="hidden max-w-32 truncate text-sm font-bold text-gray-700 sm:block">{user.username}</span>
        <FaBars className="ml-1 text-gray-400" size={14} aria-hidden="true" />
      </motion.button>

      {ReactDOM.createPortal(
        <AnimatePresence>
          {isMenuOpen ? (
            <motion.div
              key="mobile-nav-layer"
              className="fixed inset-0 z-[9998]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <button
                type="button"
                className="absolute inset-0 h-full w-full cursor-default bg-black/20 backdrop-blur-[2px]"
                aria-label="关闭导航菜单"
                onClick={closeMenu}
              />

              <motion.div
                id={MENU_PANEL_ID}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-nav-title"
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18 }}
                className="absolute left-3 right-3 top-16 z-[9999] flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl sm:left-auto sm:right-4 sm:w-96"
              >
                <div className="shrink-0 border-b border-gray-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        src={avatarImg}
                        username={user.username}
                        sizeClassName="h-10 w-10 bg-white shadow-sm"
                        iconClassName="text-indigo-300"
                        onImageError={() => setAvatarImg(undefined)}
                      />
                      <div className="min-w-0">
                        <p id="mobile-nav-title" className="truncate font-black leading-tight text-gray-800">{user.username}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                          <span className="rounded-full bg-white/70 px-2 py-0.5 uppercase tracking-wider text-gray-500">
                            {getRoleLabel(user.role)}
                          </span>
                          <button
                            type="button"
                            onClick={handleTOTPManager}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                              effectiveTwoFactorStatus.enabled
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                            )}
                            title="打开安全设置"
                          >
                            {effectiveTwoFactorStatus.enabled ? <FaCheckCircle aria-hidden="true" /> : <FaShieldAlt aria-hidden="true" />}
                            {effectiveTwoFactorStatus.label}
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeMenu}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                      aria-label="关闭导航菜单"
                      title="关闭"
                    >
                      <FaTimes size={18} aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAccountSwitcher((open) => !open)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                      showAccountSwitcher
                        ? 'border-indigo-700 bg-indigo-600 text-white shadow-sm'
                        : 'border-indigo-100/50 bg-white/60 text-indigo-600 hover:bg-white hover:shadow-sm',
                    )}
                    aria-expanded={showAccountSwitcher}
                    aria-controls={ACCOUNT_LIST_ID}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FaUserPlus className={showAccountSwitcher ? 'text-white' : 'text-indigo-500'} aria-hidden="true" />
                      <span className="truncate">{accountsForDisplay.length > 1 ? '切换与管理账号' : '多账号登录管理'}</span>
                      <span className="hidden rounded-sm border border-amber-200 bg-amber-100 px-1 text-[8px] font-normal text-amber-700 sm:inline">
                        本机保存
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[9px]', showAccountSwitcher ? 'bg-white/20' : 'bg-indigo-600 text-white')}>
                        {accountsForDisplay.length}
                      </span>
                      <FaChevronDown className={cn('transition-transform', showAccountSwitcher && 'rotate-180')} aria-hidden="true" />
                    </span>
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
                  <AnimatePresence initial={false}>
                    {showAccountSwitcher ? (
                      <motion.div
                        id={ACCOUNT_LIST_ID}
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="space-y-1 overflow-hidden border-b border-gray-50 pb-3"
                      >
                        <div className="flex items-center justify-between px-3 py-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">已保存的账号</p>
                        </div>

                        {accountsForDisplay.map((account) => {
                          const isCurrentAccount = account.user.id === user.id;

                          return (
                            <div key={account.user.id} className="group flex items-center gap-2 px-1">
                              <button
                                type="button"
                                onClick={() => handleSwitchAccount(account.user.id)}
                                className={cn(
                                  'flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                                  isCurrentAccount ? 'border border-indigo-100 bg-indigo-50' : 'hover:bg-gray-50',
                                )}
                                aria-current={isCurrentAccount ? 'true' : undefined}
                              >
                                <Avatar
                                  src={account.user.avatarUrl}
                                  username={account.user.username}
                                  sizeClassName="h-8 w-8 border-gray-200 bg-gray-100"
                                  iconClassName="text-gray-400"
                                  decorative
                                />
                                <span className="min-w-0 flex-1">
                                  <span className={cn('block truncate text-xs font-bold', isCurrentAccount ? 'text-indigo-600' : 'text-gray-700')}>
                                    {account.user.username}
                                    <span className={cn(
                                      'ml-2 rounded px-1 text-[8px]',
                                      isCurrentAccount
                                        ? 'bg-indigo-100 text-indigo-500'
                                        : 'border border-amber-100 bg-amber-50 text-amber-600',
                                    )}>
                                      {isCurrentAccount ? '当前' : '可切换'}
                                    </span>
                                  </span>
                                  <span className="block truncate text-[9px] text-gray-400">{account.user.email}</span>
                                </span>
                              </button>

                              {!isCurrentAccount && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveAccount(account.user.id);
                                  }}
                                  className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                                  title="移除此账号"
                                  aria-label={`移除账号 ${account.user.username}`}
                                >
                                  <FaTimes size={10} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <div className="mt-2 grid grid-cols-2 gap-2 px-1">
                          <Link
                            to="/login"
                            onClick={closeMenu}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-2 text-[11px] font-bold text-indigo-600 transition-all hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                          >
                            <FaPlusCircle aria-hidden="true" />
                            添加账号
                          </Link>
                          <button
                            type="button"
                            onClick={handleLogoutAll}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 p-2 text-[11px] font-bold text-red-500 transition-all hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                          >
                            <FaSignOutAlt aria-hidden="true" />
                            退出所有
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {menuGroups.map((group) => (
                    <section key={group.id} className="space-y-1" aria-labelledby={`mobile-nav-group-${group.id}`}>
                      <p id={`mobile-nav-group-${group.id}`} className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {group.title}
                      </p>
                      <div className="grid grid-cols-1 gap-0.5">
                        {group.items.map((item) => renderNavLink(item))}
                        {group.id === 'core' && (
                          <button
                            type="button"
                            onClick={handleTOTPManager}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                          >
                            <FaLock className="shrink-0 text-purple-500" size={16} aria-hidden="true" />
                            <span className="truncate">安全设置</span>
                            <span className={cn(
                              'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold',
                              effectiveTwoFactorStatus.enabled
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600',
                            )}>
                              {effectiveTwoFactorStatus.label}
                            </span>
                          </button>
                        )}
                      </div>
                    </section>
                  ))}

                  {isAdmin && adminGroups.map((group) => (
                    <section key={group.id} className="space-y-1 border-t border-gray-50 pt-2" aria-labelledby={`mobile-nav-group-${group.id}`}>
                      <p id={`mobile-nav-group-${group.id}`} className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-pink-400">
                        {group.title}
                      </p>
                      <div className="grid grid-cols-1 gap-0.5">
                        {group.items.map((item) => renderNavLink(item, true))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="shrink-0 border-t border-gray-100 bg-gray-50/50 p-3">
                  <button
                    type="button"
                    onClick={handleLogoutCurrent}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-white p-3 text-sm font-bold text-red-600 shadow-sm transition-all hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                  >
                    <FaSignOutAlt aria-hidden="true" />
                    退出当前账号
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
});

export default MobileNav;
