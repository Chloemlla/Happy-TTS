import React, { memo } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaVolumeUp, FaStar, FaUsers, FaRocket, FaSignInAlt, FaUserPlus, FaUserCircle, FaTimes, FaChevronRight } from 'react-icons/fa';
import { useAuth, SavedAccount } from '../hooks/useAuth';

// 统一的 viewport 与过渡动画配置
const VIEWPORT_20 = { once: true, amount: 0.2 } as const;
const VIEWPORT_30 = { once: true, amount: 0.3 } as const;
const VIEWPORT_40 = { once: true, amount: 0.4 } as const;

const HEADER_TRANSITION = { duration: 0.6 } as const;
const ICON_INITIAL = { scale: 0.9, opacity: 0 } as const;
const ICON_VISIBLE = { scale: 1, opacity: 1 } as const;
const ICON_ENTER_TRANSITION = { duration: 0.5, delay: 0.2 } as const;
const DESC_ENTER_TRANSITION = { duration: 0.5, delay: 0.4 } as const;
const AUTH_SPRING_TRANSITION = { duration: 0.6, type: 'spring', stiffness: 120 } as const;
const CARD_SPRING_TRANSITION = { duration: 0.5, type: 'spring', stiffness: 200 } as const;
const ITEM_HOVER = { scale: 1.05 } as const;
const BUTTON_TAP = { scale: 0.95 } as const;

// 降级方案：当用户偏好减少动态时
const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;

const FEATURES = [
  { title: '高质量语音', desc: '使用 OpenAI 最新的 TTS 技术，生成自然流畅的语音', icon: FaStar },
  { title: '多种声音选择', desc: '提供多种声音选项，满足不同场景需求', icon: FaUsers },
  { title: '简单易用', desc: '直观的界面设计，轻松上手使用', icon: FaRocket }
] as const;

const headerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 }
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

// FeatureCard — 浅色设计语言
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
const FeatureCard = memo(function FeatureCard({ title, desc, Icon, variants, transition, hover, tap }: FeatureCardProps) {
  return (
    <m.div
      className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-6 hover:shadow-2xl transition-all duration-300"
      variants={variants}
      transition={transition}
      whileHover={hover}
      whileTap={tap}
    >
      <div className="flex items-center gap-3 mb-4">
        <Icon className="text-2xl text-[#FFB703]" />
        <h3 className="text-lg font-songti font-semibold text-[#023047]">{title}</h3>
      </div>
      <p className="text-[#023047]/70">{desc}</p>
    </m.div>
  );
});

function WelcomePageComponent(): React.ReactElement<any> {
  const { savedAccounts, switchAccount, removeAccountFromList } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  const effectiveHeaderVariants = React.useMemo(() => (
    prefersReducedMotion ? FADE_VARIANTS : headerVariants
  ), [prefersReducedMotion]);
  const effectiveItemVariants = React.useMemo(() => (
    prefersReducedMotion ? FADE_VARIANTS : itemVariants
  ), [prefersReducedMotion]);
  const effectiveHeaderTransition = React.useMemo(() => (
    prefersReducedMotion ? NO_TRANSITION : HEADER_TRANSITION
  ), [prefersReducedMotion]);
  const effectiveAuthTransition = React.useMemo(() => (
    prefersReducedMotion ? NO_TRANSITION : AUTH_SPRING_TRANSITION
  ), [prefersReducedMotion]);
  const effectiveCardTransition = React.useMemo(() => (
    prefersReducedMotion ? NO_TRANSITION : CARD_SPRING_TRANSITION
  ), [prefersReducedMotion]);
  const effectiveItemHover = React.useMemo(() => (
    prefersReducedMotion ? undefined : ITEM_HOVER
  ), [prefersReducedMotion]);
  const effectiveButtonTap = React.useMemo(() => (
    prefersReducedMotion ? undefined : BUTTON_TAP
  ), [prefersReducedMotion]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 rounded-3xl">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          {/* 主卡片容器 */}
          <m.div
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_30}
            variants={effectiveHeaderVariants}
            transition={effectiveHeaderTransition}
          >
            {/* 头部横幅 */}
            <div className="bg-[#023047] text-white p-6">
              <div className="text-center">
                <m.div className="flex items-center justify-center gap-3 mb-4">
                  <FaVolumeUp className="text-4xl" />
                  <h1 className="text-4xl font-bold font-songti">欢迎使用 Synapse</h1>
                </m.div>
                <p className="text-[#8ECAE6] text-lg opacity-80">使用最新的语音合成技术，生成自然流畅的语音</p>
              </div>
            </div>

            {/* 行动号召区域 */}
            <div className="p-8 bg-[#8ECAE6]/5">
              <div className="max-w-2xl mx-auto text-center space-y-8">
                
                {/* 账号切换列表 - 单设备多用户核心体现 */}
                <AnimatePresence>
                  {savedAccounts.length > 0 && (
                    <m.div 
                      className="space-y-4"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <h4 className="text-xs font-bold text-[#023047]/40 uppercase tracking-widest">继续使用您的账号</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {savedAccounts.map((account) => (
                          <m.div
                            key={account.user.id}
                            className="relative group bg-white border border-[#8ECAE6]/40 p-3 rounded-xl flex items-center justify-between hover:border-[#219EBC] hover:shadow-md transition-all cursor-pointer"
                            whileHover={{ y: -2 }}
                            onClick={() => switchAccount(account.user.id)}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              {account.user.avatarUrl ? (
                                <img src={account.user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-indigo-50" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                                  <FaUserCircle size={24} />
                                </div>
                              )}
                              <div className="text-left overflow-hidden">
                                <p className="font-bold text-[#023047] truncate">{account.user.username}</p>
                                <p className="text-[10px] text-[#023047]/50 truncate">{account.user.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <FaChevronRight className="text-[#8ECAE6] group-hover:text-[#219EBC] transition-colors" size={12} />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAccountFromList(account.user.id);
                                }}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="从列表中移除"
                              >
                                <FaTimes size={10} />
                              </button>
                            </div>
                          </m.div>
                        ))}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                    <Link
                      to="/login"
                      className="group flex items-center gap-2 px-8 py-3 bg-[#FFB703] hover:bg-[#FB8500] text-[#023047] font-semibold rounded-lg shadow-lg shadow-[#FFB703]/20 transition-all duration-300"
                    >
                      <FaSignInAlt className="text-xl" />
                      <span>{savedAccounts.length > 0 ? '登录其他账号' : '登录'}</span>
                    </Link>
                  </m.div>

                  <m.div whileHover={effectiveItemHover} whileTap={effectiveButtonTap}>
                    <Link
                      to="/register"
                      className="group flex items-center gap-2 px-8 py-3 bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 text-[#023047]/70 hover:text-[#023047] font-semibold rounded-lg border border-[#8ECAE6]/30 hover:border-[#219EBC] transition-all duration-300"
                    >
                      <FaUserPlus className="text-xl" />
                      <span>注册账号</span>
                    </Link>
                  </m.div>
                </div>
              </div>
            </div>
          </m.div>

          {/* 功能特色卡片 */}
          <m.div
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_20}
            variants={listVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
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
          </m.div>
        </div>
      </div>
    </LazyMotion>
  );
}

export const WelcomePage = memo(WelcomePageComponent);
