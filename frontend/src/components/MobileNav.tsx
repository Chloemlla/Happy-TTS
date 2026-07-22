import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  FaBars,
  FaCheckCircle,
  FaChevronDown,
  FaLock,
  FaPlusCircle,
  FaShieldAlt,
  FaSignOutAlt,
  FaTimes,
  FaUser,
  FaUserPlus,
} from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import {
  getMobileAdminNavGroups,
  getMobileRootNavGroups,
} from '../navigation/navConfig';
import type { TOTPStatus, User } from '../types/auth';
import { getAuthToken } from '../utils/authSession';
import { isNavLink } from '../layout/url-utils';
import type { NavItem as ConfigNavItem } from '../layout/types';

interface MobileNavProps {
  user: User | null;
  logout: () => void;
  onTOTPManagerOpen: () => void;
  totpStatus?: TOTPStatus | null;
  /**
   * When true (desktop left-sidebar shell), only the account/security menu is shown.
   * Full page navigation stays in AppSidebar — never both at once.
   */
  accountOnly?: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  matchChildren?: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

function toMobileNavItem(item: ConfigNavItem): NavItem | null {
  if (!isNavLink(item) || !item.url) return null;
  return {
    to: item.url,
    label: item.title,
    icon: (item.icon || FaBars) as IconType,
    matchChildren: item.matchChildren,
  };
}

const MENU_PANEL_ID = 'mobile-nav-panel';
const ACCOUNT_LIST_ID = 'mobile-nav-account-list';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const getRoleLabel = (role: string) => (role === 'admin' ? '管理员' : '用户');

const Avatar: React.FC<{
  src?: string;
  username?: string;
  sizeClassName: string;
  iconClassName?: string;
  decorative?: boolean;
  onImageError?: () => void;
}> = ({ src, username, sizeClassName, iconClassName = 'text-slate-400', decorative = false, onImageError }) => (
  <div className={cn(sizeClassName, 'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50')}>
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
  accountOnly = false,
}) => {
  const { savedAccounts, switchAccount, removeAccountFromList, logoutAll } = useAuth();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setShowAccountSwitcher(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((open) => !open);
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

    const token = getAuthToken();
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

  // Page IA from navConfig SSOT (accountOnly skips — AppSidebar owns desktop nav).
  const menuGroups = useMemo<NavGroup[]>(() => {
    if (accountOnly) return [];
    return getMobileRootNavGroups({ isAdmin, canUseTranslation }).map((group) => ({
      id: group.id || group.title,
      title: group.title,
      items: group.items
        .map(toMobileNavItem)
        .filter((item): item is NavItem => item !== null),
    })).filter((g) => g.items.length > 0);
  }, [accountOnly, canUseTranslation, isAdmin]);

  const adminGroups = useMemo<NavGroup[]>(() => {
    if (accountOnly || !isAdmin) return [];
    return getMobileAdminNavGroups().map((group) => ({
      id: group.id || group.title,
      title: group.title,
      items: group.items
        .map(toMobileNavItem)
        .filter((item): item is NavItem => item !== null),
    })).filter((g) => g.items.length > 0);
  }, [accountOnly, isAdmin]);

  const accountsForDisplay = useMemo(() => {
    if (!user) return savedAccounts;
    if (savedAccounts.some((account) => account.user.id === user.id)) {
      return savedAccounts;
    }

    return [{ user, token: getAuthToken() || '', lastActive: 0 }, ...savedAccounts];
  }, [savedAccounts, user]);

  const effectiveTwoFactorStatus = useMemo(() => {
    const statusTypes = Array.isArray(totpStatus?.type) ? totpStatus.type : [];
    const enabled = Boolean(totpStatus?.enabled || statusTypes.length > 0);
    const typeText = statusTypes.length > 0 ? statusTypes.join(' / ') : 'TOTP';

    return {
      enabled,
      label: enabled ? typeText : '未启用',
    };
  }, [totpStatus?.enabled, totpStatus?.type]);

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
          'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
          active
            ? 'border-slate-900 bg-slate-900 text-white shadow-[0_14px_38px_rgba(15,23,42,0.16)]'
            : cn(
              'border-slate-200 bg-white/80 text-slate-600 hover:bg-white',
              admin ? 'hover:border-slate-400' : 'hover:border-slate-300',
            ),
        )}
      >
        <Icon className={cn(active ? 'text-current' : 'text-slate-400', 'shrink-0')} size={16} aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {active && <span className="ml-auto h-2 w-2 rounded-full bg-white/80" aria-hidden="true" />}
      </Link>
    );
  };

  if (!user) return null;

  // Desktop: account menu only (AppSidebar owns navigation).
  // Mobile: full avatar menu with page links.
  return (
    <div className="relative flex items-center gap-3">
      <motion.button
        ref={menuButtonRef}
        type="button"
        onClick={toggleMenu}
        className="z-20 flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 p-1.5 pr-3 shadow-sm backdrop-blur-xl transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        aria-label={
          isMenuOpen
            ? accountOnly
              ? '关闭账号菜单'
              : '关闭导航菜单'
            : accountOnly
              ? '打开账号菜单'
              : '打开导航菜单'
        }
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
        <span className="hidden max-w-32 truncate text-sm font-semibold text-slate-700 sm:block">{user.username}</span>
        {accountOnly ? (
          <FaChevronDown
            className={cn('ml-0.5 text-slate-400 transition-transform', isMenuOpen && 'rotate-180')}
            size={12}
            aria-hidden="true"
          />
        ) : (
          <FaBars className="ml-1 text-slate-400" size={14} aria-hidden="true" />
        )}
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
                className="absolute inset-0 h-full w-full cursor-default bg-slate-950/20 backdrop-blur-[2px]"
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
                className={cn(
                  'absolute top-16 z-[9999] flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/88 shadow-[0_28px_110px_rgba(15,23,42,0.12)] backdrop-blur-xl',
                  accountOnly
                    ? 'right-4 left-auto w-[22rem]'
                    : 'left-3 right-3 sm:left-auto sm:right-4 sm:w-[26rem]',
                )}
              >
                <div className="shrink-0 border-b border-slate-200/70 bg-white/70 p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        src={avatarImg}
                        username={user.username}
                        sizeClassName="h-10 w-10 shadow-sm"
                        iconClassName="text-slate-400"
                        onImageError={() => setAvatarImg(undefined)}
                      />
                      <div className="min-w-0">
                        <p id="mobile-nav-title" className="truncate text-lg font-semibold leading-tight text-slate-900">{user.username}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 uppercase tracking-[0.2em] text-slate-500">
                            {getRoleLabel(user.role)}
                          </span>
                          <button
                            type="button"
                            onClick={handleTOTPManager}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
                              effectiveTwoFactorStatus.enabled
                                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100'
                                : 'border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-100',
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
                      className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
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
                      'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
                      showAccountSwitcher
                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_14px_38px_rgba(15,23,42,0.16)]'
                        : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-800',
                    )}
                    aria-expanded={showAccountSwitcher}
                    aria-controls={ACCOUNT_LIST_ID}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FaUserPlus className={showAccountSwitcher ? 'text-white' : 'text-slate-400'} aria-hidden="true" />
                      <span className="truncate">{accountsForDisplay.length > 1 ? '切换与管理账号' : '多账号登录管理'}</span>
                      <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:inline">
                        本机保存
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[9px]', showAccountSwitcher ? 'bg-white/20' : 'bg-slate-900 text-white')}>
                        {accountsForDisplay.length}
                      </span>
                      <FaChevronDown className={cn('transition-transform', showAccountSwitcher && 'rotate-180')} aria-hidden="true" />
                    </span>
                  </button>
                </div>

                <div className="hover-scrollbar flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
                  <AnimatePresence initial={false}>
                    {showAccountSwitcher ? (
                      <motion.div
                        id={ACCOUNT_LIST_ID}
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="space-y-2 overflow-hidden border-b border-slate-200/70 pb-4"
                      >
                        <div className="flex items-center justify-between px-1 py-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">已保存的账号</p>
                        </div>

                        {accountsForDisplay.map((account) => {
                          const isCurrentAccount = account.user.id === user.id;

                          return (
                            <div key={account.user.id} className="group flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSwitchAccount(account.user.id)}
                                className={cn(
                                  'flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
                                  isCurrentAccount
                                    ? 'border-slate-300 bg-slate-50/90'
                                    : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white',
                                )}
                                aria-current={isCurrentAccount ? 'true' : undefined}
                              >
                                <Avatar
                                  src={account.user.avatarUrl}
                                  username={account.user.username}
                                  sizeClassName="h-8 w-8"
                                  iconClassName="text-slate-400"
                                  decorative
                                />
                                <span className="min-w-0 flex-1">
                                  <span className={cn('block truncate text-xs font-semibold', isCurrentAccount ? 'text-slate-900' : 'text-slate-700')}>
                                    {account.user.username}
                                    <span className={cn(
                                      'ml-2 rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em]',
                                      isCurrentAccount
                                        ? 'border-slate-300 bg-white/90 text-slate-600'
                                        : 'border-amber-200 bg-amber-50/80 text-amber-700',
                                    )}>
                                      {isCurrentAccount ? '当前' : '可切换'}
                                    </span>
                                  </span>
                                  <span className="block truncate text-[9px] text-slate-400">{account.user.email}</span>
                                </span>
                              </button>

                              {!isCurrentAccount && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveAccount(account.user.id);
                                  }}
                                  className="rounded-full border border-transparent p-2 text-slate-300 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                                  title="移除此账号"
                                  aria-label={`移除账号 ${account.user.username}`}
                                >
                                  <FaTimes size={10} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Link
                            to="/login"
                            onClick={closeMenu}
                            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 p-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                          >
                            <FaPlusCircle aria-hidden="true" />
                            添加账号
                          </Link>
                          <button
                            type="button"
                            onClick={handleLogoutAll}
                            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-200/70 bg-red-50/80 p-2.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                          >
                            <FaSignOutAlt aria-hidden="true" />
                            退出所有
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {accountOnly ? (
                    <section className="space-y-2" aria-labelledby="mobile-nav-group-account">
                      <p id="mobile-nav-group-account" className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        账号
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {renderNavLink({ to: '/profile', label: '个人中心', icon: FaUser })}
                        <button
                          type="button"
                          onClick={handleTOTPManager}
                          className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                        >
                          <FaLock className="shrink-0 text-slate-400" size={16} aria-hidden="true" />
                          <span className="truncate">安全设置</span>
                          <span className={cn(
                            'ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                            effectiveTwoFactorStatus.enabled
                              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                              : 'border-amber-200 bg-amber-50/80 text-amber-700',
                          )}>
                            {effectiveTwoFactorStatus.label}
                          </span>
                        </button>
                      </div>
                    </section>
                  ) : (
                    <>
                      {menuGroups.map((group) => (
                        <section key={group.id} className="space-y-2" aria-labelledby={`mobile-nav-group-${group.id}`}>
                          <p id={`mobile-nav-group-${group.id}`} className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {group.title}
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {group.items.map((item) => renderNavLink(item))}
                            {group.id === 'core' && (
                              <button
                                type="button"
                                onClick={handleTOTPManager}
                                className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                              >
                                <FaLock className="shrink-0 text-slate-400" size={16} aria-hidden="true" />
                                <span className="truncate">安全设置</span>
                                <span className={cn(
                                  'ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                  effectiveTwoFactorStatus.enabled
                                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50/80 text-amber-700',
                                )}>
                                  {effectiveTwoFactorStatus.label}
                                </span>
                              </button>
                            )}
                          </div>
                        </section>
                      ))}

                      {isAdmin && adminGroups.map((group) => (
                        <section key={group.id} className="space-y-2 border-t border-slate-200/70 pt-4" aria-labelledby={`mobile-nav-group-${group.id}`}>
                          <p id={`mobile-nav-group-${group.id}`} className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {group.title}
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {group.items.map((item) => renderNavLink(item, true))}
                          </div>
                        </section>
                      ))}
                    </>
                  )}
                </div>

                <div className="shrink-0 border-t border-slate-200/70 bg-white/70 p-4">
                  <button
                    type="button"
                    onClick={handleLogoutCurrent}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200/70 bg-white/90 p-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
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
