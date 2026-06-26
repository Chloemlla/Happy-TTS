import React, { memo } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FaVolumeUp,
  FaStar,
  FaUsers,
  FaRocket,
  FaSignInAlt,
  FaUserPlus,
  FaUserCircle,
  FaTimes,
  FaChevronRight,
  FaShieldAlt,
  FaCheckCircle,
} from 'react-icons/fa';
import { useAuth, type SavedAccount } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioDisplayFont,
  studioElevatedPanelClassName,
  studioEyebrowAccentPillClassName,
  studioEyebrowClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioMainSurfaceClassName,
  studioPageClassName,
  studioPageFont,
  studioPanelClassName,
  studioPrimaryButtonClassName,
  studioSoftBadgeClassName,
  studioStrongBadgeClassName,
  studioSubPanelClassName,
} from './studioTheme';

const VIEWPORT_20 = { once: true, amount: 0.2 } as const;
const VIEWPORT_30 = { once: true, amount: 0.3 } as const;

const HEADER_TRANSITION = { duration: 0.45 } as const;
const AUTH_SPRING_TRANSITION = { duration: 0.45, type: 'spring', stiffness: 120 } as const;
const CARD_SPRING_TRANSITION = { duration: 0.4, type: 'spring', stiffness: 170 } as const;
const ITEM_HOVER = { scale: 1.01, y: -2 } as const;
const BUTTON_TAP = { scale: 0.99 } as const;
const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;

const FEATURES = [
  { title: '高质量语音', desc: '面向播客、课程与短视频旁白，输出自然清晰的音频。', icon: FaStar },
  { title: '多账号工作流', desc: '在同一设备上快速切换常用账号，减少重复登录。', icon: FaUsers },
  { title: '安全合成链路', desc: '生成请求经过权限、额度与内容安全审计。', icon: FaRocket },
] as const;

const headerVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

type FeatureIcon = React.ComponentType<{ className?: string }>;

interface FeatureCardProps {
  title: string;
  desc: string;
  Icon: FeatureIcon;
  variants: any;
  transition: any;
  hover: any;
  tap: any;
}

const FeatureCard = memo(function FeatureCard({
  title,
  desc,
  Icon,
  variants,
  transition,
  hover,
  tap,
}: FeatureCardProps) {
  return (
    <m.div
      className={cn(studioElevatedPanelClassName, 'h-full transition hover:border-slate-300')}
      variants={variants}
      transition={transition}
      whileHover={hover}
      whileTap={tap}
    >
      <div className="flex items-start gap-3">
        <div className={cn(studioSoftBadgeClassName, 'shrink-0')}>
          <Icon className="text-slate-600" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
        </div>
      </div>
    </m.div>
  );
});

interface AccountSwitchCardProps {
  account: SavedAccount;
  isCurrent: boolean;
  onSwitch: (userId: string) => void;
  onRemove: (userId: string) => void;
}

const AccountSwitchCard = memo(function AccountSwitchCard({
  account,
  isCurrent,
  onSwitch,
  onRemove,
}: AccountSwitchCardProps) {
  return (
    <m.div
      className="flex min-w-0 items-center gap-2 rounded-[20px] border border-slate-200 bg-white/80 p-2.5 transition hover:border-slate-300 hover:bg-white"
      whileHover={{ y: -2 }}
    >
      <button
        type="button"
        onClick={() => onSwitch(account.user.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        {account.user.avatarUrl ? (
          <img
            src={account.user.avatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-2xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
            <FaUserCircle size={22} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{account.user.username}</p>
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                当前
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{account.user.email}</p>
        </div>
      </button>
      <FaChevronRight className="hidden shrink-0 text-slate-300 sm:block" size={12} />
      <button
        type="button"
        onClick={() => onRemove(account.user.id)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-300 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
        title="从列表中移除"
        aria-label={`从列表中移除 ${account.user.username}`}
      >
        <FaTimes size={10} />
      </button>
    </m.div>
  );
});

function WelcomePageComponent(): React.ReactElement<any> {
  const { user, savedAccounts, switchAccount, removeAccountFromList } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  const effectiveHeaderVariants = React.useMemo(
    () => (prefersReducedMotion ? FADE_VARIANTS : headerVariants),
    [prefersReducedMotion],
  );
  const effectiveItemVariants = React.useMemo(
    () => (prefersReducedMotion ? FADE_VARIANTS : itemVariants),
    [prefersReducedMotion],
  );
  const effectiveHeaderTransition = React.useMemo(
    () => (prefersReducedMotion ? NO_TRANSITION : HEADER_TRANSITION),
    [prefersReducedMotion],
  );
  const effectiveAuthTransition = React.useMemo(
    () => (prefersReducedMotion ? NO_TRANSITION : AUTH_SPRING_TRANSITION),
    [prefersReducedMotion],
  );
  const effectiveCardTransition = React.useMemo(
    () => (prefersReducedMotion ? NO_TRANSITION : CARD_SPRING_TRANSITION),
    [prefersReducedMotion],
  );
  const effectiveItemHover = React.useMemo(
    () => (prefersReducedMotion ? undefined : ITEM_HOVER),
    [prefersReducedMotion],
  );
  const effectiveButtonTap = React.useMemo(
    () => (prefersReducedMotion ? undefined : BUTTON_TAP),
    [prefersReducedMotion],
  );

  return (
    <LazyMotion features={domAnimation}>
      <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
        <div className="mx-auto max-w-7xl min-w-0 space-y-5 sm:space-y-8">
          <m.section
            className={cn('relative overflow-hidden', studioHeroCardClassName)}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_30}
            variants={effectiveHeaderVariants}
            transition={effectiveHeaderTransition}
          >
            <div className={cn(studioAccentBlobBlueClassName, '-right-12 top-0')} aria-hidden />
            <div className={cn(studioAccentBlobSkyClassName, '-left-10 bottom-0')} aria-hidden />
            <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl min-w-0">
                <div className={studioEyebrowAccentPillClassName}>
                  <FaVolumeUp />
                  Synapse Access
                </div>
                <h1
                  className="mt-4 text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                  style={{ fontFamily: studioDisplayFont }}
                >
                  欢迎使用 Synapse
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                  进入语音合成工作台，继续管理账号、生成音频并查看历史记录。
                </p>
              </div>

              <div className="w-full lg:w-auto lg:max-w-sm">
                <div className={studioSubPanelClassName}>
                  <div className={cn(studioEyebrowClassName, 'flex items-center gap-2')}>
                    <FaShieldAlt className="text-slate-500" />
                    Account State
                  </div>
                  <div className="mt-3 flex items-start gap-3">
                    <div className={studioStrongBadgeClassName}>
                      <FaCheckCircle className="text-emerald-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {user ? '已恢复当前登录态' : '准备进入账号流程'}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {user
                          ? `当前账号：${user.username}`
                          : savedAccounts.length > 0
                            ? `已发现 ${savedAccounts.length} 个本机账号`
                            : '登录或注册后即可开始使用 TTS。'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </m.section>

          <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <m.section
              className={studioMainSurfaceClassName}
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_20}
              variants={effectiveHeaderVariants}
              transition={effectiveAuthTransition}
            >
              <div className="rounded-[22px] border border-slate-200 bg-white/80 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className={studioStrongBadgeClassName}>
                      <FaUserCircle />
                    </div>
                    <div>
                      <div className={studioEyebrowClassName}>Saved Accounts</div>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">继续使用您的账号</h2>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {savedAccounts.length > 0 ? (
                    <m.div
                      className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {savedAccounts.map((account) => (
                        <AccountSwitchCard
                          key={account.user.id}
                          account={account}
                          isCurrent={user?.id === account.user.id}
                          onSwitch={switchAccount}
                          onRemove={removeAccountFromList}
                        />
                      ))}
                    </m.div>
                  ) : (
                    <m.div
                      className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      暂无已保存账号
                    </m.div>
                  )}
                </AnimatePresence>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap} className="w-full sm:w-auto">
                    <Link to="/login" className={cn(studioPrimaryButtonClassName, 'w-full')}>
                      <FaSignInAlt />
                      {savedAccounts.length > 0 ? '登录其他账号' : '登录'}
                    </Link>
                  </m.div>
                  <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap} className="w-full sm:w-auto">
                    <Link to="/register" className={cn(studioGhostButtonClassName, 'h-full w-full px-5 py-3.5 tracking-[0.16em]')}>
                      <FaUserPlus />
                      注册账号
                    </Link>
                  </m.div>
                </div>
              </div>
            </m.section>

            <m.aside
              className={studioPanelClassName}
              initial="hidden"
              whileInView="visible"
              viewport={VIEWPORT_20}
              variants={effectiveHeaderVariants}
              transition={effectiveAuthTransition}
            >
              <div className="flex items-center gap-3">
                <div className={studioStrongBadgeClassName}>
                  <FaVolumeUp />
                </div>
                <div>
                  <div className={studioEyebrowClassName}>Workspace</div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">语音合成入口</h2>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                登录后将回到 Synapse 工作台，使用与文本转语音页面一致的表单、结果与历史记录体验。
              </p>
              <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                <div className={studioEyebrowClassName}>Daily Flow</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>账号</span>
                    <span className="font-semibold text-slate-900">鉴权</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>文本</span>
                    <span className="font-semibold text-slate-900">合成</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>音频</span>
                    <span className="font-semibold text-slate-900">下载</span>
                  </div>
                </div>
              </div>
            </m.aside>
          </div>

          <m.section
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_20}
            variants={listVariants}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {FEATURES.map((item) => (
              <FeatureCard
                key={item.title}
                title={item.title}
                desc={item.desc}
                Icon={item.icon as FeatureIcon}
                variants={effectiveItemVariants}
                transition={effectiveCardTransition}
                hover={effectiveItemHover}
                tap={effectiveButtonTap}
              />
            ))}
          </m.section>
        </div>
      </div>
    </LazyMotion>
  );
}

export const WelcomePage = memo(WelcomePageComponent);
