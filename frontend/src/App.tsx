import React, { useState, useEffect, Suspense, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { TOTPStatus } from './types/auth';
import { LoadingSpinner, SimpleLoadingSpinner } from './components/LoadingSpinner';
import TOTPManager from './components/TOTPManager';
import { NotificationProvider } from './components/Notification';
import { BroadcastModalProvider } from './components/BroadcastModal';
import WsConnector from './components/WsConnector';
import ModListPage from './components/ModListPage';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AnnouncementModal from './components/AnnouncementModal';
import md5 from 'md5';
import getApiBaseUrl from './api';
import DOMPurify from 'dompurify';
import { reportFingerprintOnce } from './utils/fingerprint';
import { useFirstVisitDetection } from './hooks/useFirstVisitDetection';
import { FirstVisitVerification } from './components/FirstVisitVerification';
import { useFingerprintRequest } from './hooks/useFingerprintRequest';
import FingerprintRequestModal from './components/FingerprintRequestModal';

// 动态导入 clarity 以减少主 bundle 体积，避免与 FirstVisitVerification 的动态导入冲突
let clarityModule: typeof import('@microsoft/clarity') | null = null;
const loadClarity = async () => {
  if (!clarityModule) {
    try {
      clarityModule = await import('@microsoft/clarity');
    } catch (_) { /* ignore */ }
  }
  return clarityModule;
};

// 懒加载组件
const WelcomePage = React.lazy(() => import('./components/WelcomePage').then(module => ({ default: module.WelcomePage })));
const LoginPage = React.lazy(() => import('./components/LoginPage').then(module => ({ default: module.LoginPage })));
const RegisterPage = React.lazy(() => import('./components/RegisterPage').then(module => ({ default: module.RegisterPage })));
const LinuxDoAuthCallbackPage = React.lazy(() => import('./components/LinuxDoAuthCallbackPage').then(module => ({ default: module.LinuxDoAuthCallbackPage })));
const DeepLXTranslatorPage = React.lazy(() => import('./components/DeepLXTranslatorPage').then(module => ({ default: module.DeepLXTranslatorPage })));
const ForgotPasswordPage = React.lazy(() => import('./components/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = React.lazy(() => import('./components/ResetPasswordPage').then(module => ({ default: module.ResetPasswordPage })));
const EmailVerifyPage = React.lazy(() => import('./components/EmailVerifyPage').then(module => ({ default: module.EmailVerifyPage })));
const ResetPasswordLinkPage = React.lazy(() => import('./components/ResetPasswordLinkPage').then(module => ({ default: module.ResetPasswordLinkPage })));
const TtsPage = React.lazy(() => import('./components/TtsPage').then(module => ({ default: module.TtsPage })));
const PolicyPage = React.lazy(() => import('./components/PolicyPage'));
const Footer = React.lazy(() => import('./components/Footer'));
const UserManagement = React.lazy(() => import('./components/UserManagement'));
const MobileNav = React.lazy(() => import('./components/MobileNav'));
const ApiDocs = React.lazy(() => import('./components/ApiDocs'));
const LogShare = React.lazy(() => import('./components/LogShare'));
const CaseConverter = React.lazy(() => import('./components/CaseConverter').then(module => ({ default: module.CaseConverter })));
const EmailSender = React.lazy(() => import('./components/EmailSender'));
const UserProfile = React.lazy(() => import('./components/UserProfile'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const OutEmail = React.lazy(() => import('./components/OutEmail'));
const LotteryPage = React.lazy(() => import('./components/LotteryPage'));
const LotteryAdmin = React.lazy(() => import('./components/LotteryAdmin'));
const ImageUploadPage = React.lazy(() => import('./components/ImageUploadPage'));
const TigerAdventure = React.lazy(() => import('./components/TigerAdventure'));
const CoinFlip = React.lazy(() => import('./components/CoinFlip'));
const MarkdownExportPage = React.lazy(() => import('./components/MarkdownExportPage'));

// 字数统计页面懒加载
const WordCountPageSimple = React.lazy(() => import('./components/WordCountPageSimple'));

// 年龄计算器页面懒加载
const AgeCalculatorPage = React.lazy(() => import('./components/AgeCalculatorPage'));

// 资源商店相关组件懒加载
const AdminStoreDashboard = React.lazy(() => import('./components/AdminStoreDashboard'));
const ResourceStoreApp = React.lazy(() => import('./components/ResourceStoreApp'));
const ResourceStoreDetail = React.lazy(() => import('./components/ResourceStoreDetail'));
const ResourceStoreList = React.lazy(() => import('./components/ResourceStoreList'));
const ResourceStoreManager = React.lazy(() => import('./components/ResourceStoreManager'));
const CDKStoreManager = React.lazy(() => import('./components/CDKStoreManager'));

// FBI通缉犯相关组件懒加载
const FBIWantedPublic = React.lazy(() => import('./components/FBIWantedPublic'));
// LibreChat 页面懒加载
const LibreChatPage = React.lazy(() => import('./components/LibreChatPage'));

// SmartHumanCheckTestPage 懒加载
const SmartHumanCheckTestPage = React.lazy(() => import('./components/SmartHumanCheckTestPage'));

// 校园紧急情况页面懒加载
const CampusEmergencyPage = React.lazy(() => import('./components/CampusEmergencyPage'));

// 安踏防伪查询页面懒加载
const AntiCounterfeitPage = React.lazy(() => import('./components/AntiCounterfeitPage'));

// GitHub Billing Dashboard 懒加载
const GitHubBillingDashboard = React.lazy(() => import('./components/GitHubBillingDashboard'));

// 公共短链创建页面懒加载
const PublicShortLinkCreator = React.lazy(() => import('./components/PublicShortLinkCreator'));

// hCaptcha 验证页面懒加载
const HCaptchaVerificationPage = React.lazy(() => import('./components/HCaptchaVerificationPage'));

// 通知测试页面懒加载
const NotificationTestPage = React.lazy(() => import('./components/NotificationTestPage'));

// 篡改检测演示页面懒加载
const TamperDetectionDemo = React.lazy(() => import('./components/TamperDetectionDemo'));

// UI展示页面懒加载
const DemoHub = React.lazy(() => import('./components/DemoHub'));
const XiaohongshuDemo = React.lazy(() => import('./components/XiaohongshuDemo'));
const MeditationAppDemo = React.lazy(() => import('./components/MeditationAppDemo'));
const MusicPlayerDemo = React.lazy(() => import('./components/MusicPlayerDemo'));
const FinanceAppDemo = React.lazy(() => import('./components/FinanceAppDemo'));

// NexAI 安全监控中心懒加载
const NexAISecurityDashboard = React.lazy(() => import('./components/NexAISecurityDashboard'));

// Artifact 分享页面懒加载
const ArtifactSharePage = React.lazy(() => import('./components/ArtifactSharePage'));
const TicketSystem = React.lazy(() => import('./components/TicketSystem'));

// SmartHumanCheckTestPage 已抽取到 components/SmartHumanCheckTestPage.tsx

// 页面切换动画变体
const pageVariants = {
  initial: {
    opacity: 0,
    x: -20,
    scale: 0.98
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1
  },
  out: {
    opacity: 0,
    x: 20,
    scale: 0.98
  }
};

// 统一过渡常量，结合 useReducedMotion 可降级
const PAGE_TRANSITION = { type: 'tween', ease: 'easeInOut', duration: 0.4 } as const;
const NAV_SPRING = { type: 'spring', stiffness: 100, damping: 20 } as const;
const TOTP_SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

// 背景粒子组件
const BackgroundParticles: React.FC = React.memo(() => {
  const [isDocVisible, setIsDocVisible] = React.useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  // 生成粒子（只计算一次）
  const particles = React.useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;

    // 根据屏幕尺寸自适应数量，尽量减小 DOM 数量
    const isMobile = w < 768;
    const count = isMobile ? 8 : 14; // 原为 20

    return Array.from({ length: count }, (_, i) => {
      const x0 = Math.random() * w;
      const y0 = Math.random() * h;
      const x1 = Math.random() * w;
      const y1 = Math.random() * h;
      return {
        id: i,
        x: x0,
        y: y0,
        dx: x1 - x0,
        dy: y1 - y0,
        duration: Math.random() * 16 + 12 // 原为 [10,30]，略微收敛以降低刷新感知
      };
    });
  }, []);

  // 页面可见性变化时暂停/恢复动画（降低后台标签页的资源占用）
  React.useEffect(() => {
    const onVisible = () => setIsDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* 全局 keyframes（CSS 动画，避免 JS 每帧计算，降低开销） */}
      <style>
        {`
          @keyframes particleMove {
            0% { transform: translate(0, 0); opacity: 0.25; }
            50% { opacity: 0.35; }
            100% { transform: translate(var(--dx), var(--dy)); opacity: 0.25; }
          }
        `}
      </style>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-2 h-2 bg-indigo-200 rounded-full"
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            // 使用 CSS 变量传递偏移量，配合统一的 keyframes
            // 避免为每个粒子生成独立的 keyframes
            ['--dx' as any]: `${p.dx}px`,
            ['--dy' as any]: `${p.dy}px`,
            animation: `particleMove ${p.duration}s linear infinite`,
            animationPlayState: isDocVisible ? 'running' : 'paused',
            willChange: 'transform, opacity',
            opacity: 0.3
          }}
        />
      ))}
    </div>
  );
});

// 水印组件（满屏铺满）
const WatermarkOverlay: React.FC = React.memo(() => {
  const [isDocVisible, setIsDocVisible] = React.useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );
  const prefersReduced = useReducedMotion();

  // 生成水印网格（只在初次渲染计算一次，避免在窗口缩放时大规模重排）
  const watermarks = React.useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    // 根据屏幕大小控制密度，减少 DOM 数量
    const isMobile = w < 768;
    const cols = isMobile ? 10 : 16; // 原为 20
    const rows = isMobile ? 7 : 10;  // 原为 14

    const items: Array<{ id: number, left: string, top: string, rotate: number }> = [];
    let id = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        items.push({
          id: id++,
          left: `${(c + 0.5) * (100 / cols)}%`,
          top: `${(r + 0.5) * (100 / rows)}%`,
          rotate: Math.random() * 20 - 10,
        });
      }
    }
    return items;
  }, []);

  // 页面可见性变化时暂停/恢复动画
  React.useEffect(() => {
    const onVisible = () => setIsDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const playState = isDocVisible && !prefersReduced ? 'running' : 'paused';

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden backdrop-blur-sm">
      {/* 斜向条纹遮罩层 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,0,0,0.18) 0px, rgba(255,0,0,0.18) 10px, transparent 10px, transparent 22px)',
          backgroundSize: '200px 200px',
          animation: prefersReduced ? 'none' : 'wmScroll 12s linear infinite',
          animationPlayState: playState as any,
          mixBlendMode: 'multiply',
        }}
      />
      {/* 水平细线遮罩层 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 6px)',
          animation: prefersReduced ? 'none' : 'wmScrollY 14s linear infinite',
          animationPlayState: playState as any,
          mixBlendMode: 'multiply',
        }}
      />
      {watermarks.map((wm) => (
        <div
          key={wm.id}
          className="absolute text-red-500/40 font-bold select-none whitespace-nowrap"
          style={{
            left: wm.left,
            top: wm.top,
            transform: `translate(-50%, -50%) rotate(${wm.rotate}deg)`,
            fontSize: (typeof window !== 'undefined' && window.innerWidth < 768) ? '14px' : '16px',
            animation: prefersReduced ? 'none' : 'wmJitter 3s ease-in-out infinite alternate',
            animationDelay: `${(wm.id % 7) * 0.15}s`,
            animationPlayState: playState as any,
          }}
        >
          Copyright Individual Developer SynapticArch
        </div>
      ))}
      <style>
        {`
          @keyframes wmScroll {
            0% { background-position: 0 0; }
            100% { background-position: 400px 400px; }
          }
          @keyframes wmScrollY {
            0% { background-position: 0 0; }
            100% { background-position: 0 300px; }
          }
          @keyframes wmJitter {
            0% { transform: translate(-50%, -50%) rotate(-6deg); opacity: 0.9; }
            100% { transform: translate(-50%, -50%) rotate(6deg); opacity: 1; }
          }
        `}
      </style>
    </div>
  );
});

const ANNOUNCEMENT_SUPPRESSED_ROUTES = new Set([
  '/welcome',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

const RouteLoadingShell: React.FC<{ label?: string }> = ({ label = '正在加载页面内容…' }) => (
  <div className="mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10">
    <div className="w-full rounded-[28px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <SimpleLoadingSpinner size={0.75} />
      </div>
      <div className="mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400">
        Synapse Route
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {label}
      </p>
    </div>
  </div>
);

const AppLoadingScreen: React.FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_55%,#f8fafc_100%)] px-4 py-10">
    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.3)_0%,transparent_52%)]" />
    <div className="relative mx-auto flex min-h-[78vh] max-w-xl items-center justify-center">
      <div
        role="status"
        aria-live="polite"
        className="w-full rounded-[32px] border border-white/80 bg-white/90 px-7 py-10 text-center shadow-[0_28px_120px_rgba(30,41,59,0.14)] backdrop-blur-xl"
      >
        <div className="mx-auto inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">
          Synapse Runtime
        </div>
        <div className="mt-6 flex justify-center">
          <LoadingSpinner size={0.95} />
        </div>
        <h1 className="mt-6 text-[2rem] font-semibold leading-tight text-slate-900 sm:text-[2.35rem]">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
          {detail}
        </p>
      </div>
    </div>
  </div>
);

const NotFoundPage: React.FC<{ path: string }> = ({ path }) => (
  <section className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
    <div className="relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10">
      <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />
      <div className="relative">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          404
        </div>
        <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
          这个入口不存在
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
          链接可能已经失效、地址输入有误，或者这个页面还没有被正式挂载。
        </p>
        <div className="mt-6 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
          当前路径：<code className="break-all font-medium text-slate-700">{path}</code>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
                return;
              }
              window.location.assign('/');
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            返回上一页
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            回到首页
          </Link>
        </div>
      </div>
    </div>
  </section>
);

type AnimatedRouteProps = {
  children: React.ReactNode;
  transition: Transition;
};

const AnimatedRoute: React.FC<AnimatedRouteProps> = ({ children, transition }) => (
  <m.div
    variants={pageVariants}
    initial="initial"
    animate="in"
    exit="out"
    transition={transition}
  >
    {children}
  </m.div>
);

type ProtectedRouteProps = {
  isAllowed: boolean;
  redirectTo: string;
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ isAllowed, redirectTo, children }) => (
  isAllowed ? <>{children}</> : <Navigate to={redirectTo} replace />
);

type AdminRouteProps = {
  userRole?: string;
  redirectTo: string;
  children: React.ReactNode;
};

const AdminRoute: React.FC<AdminRouteProps> = ({ userRole, redirectTo, children }) => (
  <ProtectedRoute isAllowed={userRole === 'admin'} redirectTo={redirectTo}>
    {children}
  </ProtectedRoute>
);

const App: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);
  const [showTOTPManager, setShowTOTPManager] = useState(false);
  const [totpStatus, setTotpStatus] = useState<TOTPStatus | null>(null);
  const [showWatermark, setShowWatermark] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // 前端 FirstVisitVerification 配置状态
  const [enableFirstVisitVerification, setEnableFirstVisitVerification] = useState(true); // 默认启用
  const [configLoaded, setConfigLoaded] = useState(false);

  // 首次访问检测
  const {
    isFirstVisit,
    isVerified,
    isLoading: isFirstVisitLoading,
    error: firstVisitError,
    fingerprint,
    isIpBanned,
    banReason,
    banExpiresAt,
    clientIP,
    markAsVerified,
  } = useFirstVisitDetection();

  // 指纹请求检测
  const {
    shouldShowRequest,
    markFingerprintRequestCompleted,
    handleDismiss,
    recordDismissOnce,
    requestStatus
  } = useFingerprintRequest();

  // 在App组件内，提升isMobile/isOverflow状态
  const [isMobileNav, setIsMobileNav] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const totpDialogRef = useRef<HTMLDivElement>(null);
  const totpCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const pageTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : PAGE_TRANSITION), [prefersReducedMotion]);
  const navTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : NAV_SPRING), [prefersReducedMotion]);
  const overlayTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : { duration: 0.5 }), [prefersReducedMotion]);
  const showParticles = !prefersReducedMotion;
  const loginRedirectPath = React.useMemo(
    () => `/login?redirectTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
    [location.pathname, location.search],
  );
  const adminFallbackPath = user ? '/' : loginRedirectPath;
  const isAnnouncementSuppressed = React.useMemo(() => (
    ANNOUNCEMENT_SUPPRESSED_ROUTES.has(location.pathname)
    || location.pathname.startsWith('/auth/')
    || location.pathname.startsWith('/admin')
  ), [location.pathname]);
  const shouldBlockForFirstVisitCheck = enableFirstVisitVerification
    && Boolean(fingerprint)
    && (isIpBanned || (isFirstVisit && !isVerified));
  const toastPosition = isMobileNav ? 'bottom-center' : 'top-right';
  const closeTOTPManager = React.useCallback(() => {
    setShowTOTPManager(false);
    window.requestAnimationFrame(() => {
      previousFocusedElementRef.current?.focus();
    });
  }, []);
  const renderAnimatedRoute = React.useCallback(
    (element: React.ReactNode) => (
      <AnimatedRoute transition={pageTransition}>
        {element}
      </AnimatedRoute>
    ),
    [pageTransition],
  );
  const renderProtectedRoute = React.useCallback(
    (element: React.ReactNode, redirectTo: string = loginRedirectPath) => (
      <ProtectedRoute isAllowed={Boolean(user)} redirectTo={redirectTo}>
        {renderAnimatedRoute(element)}
      </ProtectedRoute>
    ),
    [loginRedirectPath, renderAnimatedRoute, user],
  );
  const renderAdminRoute = React.useCallback(
    (element: React.ReactNode, redirectTo: string = adminFallbackPath) => (
      <AdminRoute userRole={user?.role} redirectTo={redirectTo}>
        {renderAnimatedRoute(element)}
      </AdminRoute>
    ),
    [adminFallbackPath, renderAnimatedRoute, user?.role],
  );

  // React 19 文档元数据：路由配置优化，避免每次重新创建
  const routeConfig = React.useMemo(() => ({
    titles: {
      '/': 'Synapse - 首页',
      '/welcome': 'Synapse - 欢迎页面',
      '/login': 'Synapse - 登录',
      '/register': 'Synapse - 注册',
      '/auth/linuxdo/callback': 'Synapse - Linux.do 登录',
      '/translate': 'Synapse - DeepLX 翻译',
      '/tts': 'Synapse - 语音合成',
      '/policy': 'Synapse - 服务条款',
      '/fbi-wanted': 'Synapse - FBI通缉犯查询',
      '/lottery': 'Synapse - 抽奖系统',
      '/anti-counterfeit': 'Synapse - 安踏防伪查询',
      '/admin/lottery': 'Synapse - 抽奖管理',
      '/admin/users': 'Synapse - 用户管理',
      '/admin': 'Synapse - 管理后台',
      '/github-billing': 'Synapse - GitHub账单查询',
      '/logshare': 'Synapse - 日志分享',
      '/case-converter': 'Synapse - 大小写转换',
      '/word-count': 'Synapse - 字数统计',
      '/age-calculator': 'Synapse - 年龄计算器',
      '/email-sender': 'Synapse - 邮件发送',
      '/profile': 'Synapse - 个人资料',
      '/outemail': 'Synapse - 外部邮件',
      '/support': 'Synapse - 支持中心',
      '/modlist': 'Synapse - 模组列表',
      '/smart-human-check': 'Synapse - 智能人机验证',
      '/notification-test': 'Synapse - 通知测试',
      '/hcaptcha-verify': 'Synapse - hCaptcha验证',
      '/image-upload': 'Synapse - 图片上传',
      '/librechat': 'Synapse - LibreChat',
      '/tiger-adventure': 'Synapse - 老虎冒险',
      '/coin-flip': 'Synapse - 硬币翻转',
      '/markdown-export': 'Synapse - Markdown导出',
      '/campus-emergency': 'Synapse - 校园紧急情况',
      '/tamper-detection-demo': 'Synapse - 篡改检测演示',
      '/demo': 'Synapse - 演示中心',
      '/demo/xiaohongshu': 'Synapse - 小红书演示',
      '/demo/meditation': 'Synapse - 冥想应用演示',
      '/demo/music': 'Synapse - 音乐播放器演示',
      '/demo/finance': 'Synapse - 金融应用演示',
      '/store': 'Synapse - 资源商店',
      '/admin/store': 'Synapse - 商店管理',
      '/admin/store/resources': 'Synapse - 资源管理',
      '/admin/store/cdks': 'Synapse - CDK管理',
      '/public-shortlink': 'Synapse - 公共短链创建',
    },
    descriptions: {
      '/': 'Synapse智能语音合成平台，提供高质量的文本转语音服务',
      '/tts': '使用Synapse进行高质量的文本转语音合成',
      '/translate': '使用 DeepLX 进行双栏文本翻译与候选译文对比',
      '/lottery': '参与Synapse抽奖活动，赢取丰厚奖励',
      '/word-count': '精确统计文本字数、字符数、段落数等信息',
      '/age-calculator': '精确计算年龄，支持多种日期格式和时区',
      '/logshare': '安全分享和查看日志文件，支持加密传输',
      '/store': '浏览和下载优质资源，提升开发效率',
    }
  }), []);

  // 获取前端配置
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/frontend-config`);
        if (response.ok) {
          const data = await response.json();
          setEnableFirstVisitVerification(data.enableFirstVisitVerification ?? true);
        }
      } catch (error) {
        console.error('获取前端配置失败:', error);
        // 失败时保持默认值（启用）
      } finally {
        setConfigLoaded(true);
      }
    };
    fetchConfig();
  }, []);

  // React 19 文档元数据：根据当前路由动态设置页面标题和描述
  useEffect(() => {
    const currentPath = location.pathname;
    let title = (routeConfig.titles as Record<string, string>)[currentPath];

    // 动态路由匹配：优先匹配精确路径，然后匹配父路径
    if (!title) {
      const pathSegments = currentPath.split('/');
      if (pathSegments.length > 2) {
        // 尝试匹配父路径（如 /store/resources/123 -> /store）
        const parentPath = '/' + pathSegments[1];
        title = (routeConfig.titles as Record<string, string>)[parentPath];
      }
    }

    // 设置页面标题，如果没有匹配则使用默认标题
    document.title = title || 'Synapse - 智能语音合成平台';

    // 获取页面描述
    const descriptions = routeConfig.descriptions as Record<string, string>;
    const description = descriptions[currentPath] ||
      descriptions['/' + currentPath.split('/')[1]] ||
      'Synapse智能语音合成平台，提供多种实用工具和高质量服务';

    // 更新页面描述元数据
    let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = description;

    // 添加 Open Graph 元标签用于社交分享
    const updateOrCreateMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        (meta as any).property = property;
        document.head.appendChild(meta);
      }
      (meta as any).content = content;
    };

    updateOrCreateMeta('og:title', title || 'Synapse - 智能语音合成平台');
    updateOrCreateMeta('og:description', description);
    updateOrCreateMeta('og:type', 'website');
    updateOrCreateMeta('og:site_name', 'Synapse');
  }, [location.pathname, routeConfig]);

  useEffect(() => {
    const checkMobileOrOverflow = () => {
      const isMobileScreen = window.innerWidth < 768;
      let overflow = false;
      if (navRef.current && !isMobileScreen) {
        overflow = navRef.current.scrollWidth > navRef.current.clientWidth;
      }
      setIsMobileNav(isMobileScreen || overflow);
    };
    checkMobileOrOverflow();
    window.addEventListener('resize', checkMobileOrOverflow);
    return () => window.removeEventListener('resize', checkMobileOrOverflow);
  }, []);

  useEffect(() => {
    if (!loading) {
      setIsInitialized(true);
    }
  }, [loading]);

  useEffect(() => {
    if (loading || !isInitialized || !configLoaded || isFirstVisitLoading || shouldBlockForFirstVisitCheck) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      mainRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    configLoaded,
    isFirstVisitLoading,
    isInitialized,
    loading,
    location.pathname,
    location.search,
    shouldBlockForFirstVisitCheck,
  ]);

  useEffect(() => {
    if (!showTOTPManager) {
      return;
    }

    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const frameId = window.requestAnimationFrame(() => {
      (totpCloseButtonRef.current || totpDialogRef.current?.querySelector<HTMLElement>(focusableSelector))?.focus();
    });

    const handleDialogKeydown = (event: KeyboardEvent) => {
      if (!totpDialogRef.current) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeTOTPManager();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        totpDialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute('disabled'));

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeydown);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDialogKeydown);
    };
  }, [closeTOTPManager, showTOTPManager]);

  // 上报用户指纹（内部自带节流与鉴权判断）
  useEffect(() => {
    reportFingerprintOnce().catch(() => { });
  }, []);

  // 登录完成后尝试采集（依赖后端/本地2分钟节流，且支持IP/UA变化强制上报）
  useEffect(() => {
    if (user) {
      reportFingerprintOnce().catch(() => { });
    }
  }, [user]);

  // 路由变化时尝试采集（多方式触发，仍受5分钟限制与IP/UA变化规则约束）
  useEffect(() => {
    reportFingerprintOnce().catch(() => { });
  }, [location.pathname, location.search]);

  // 页面可见性/窗口聚焦/网络恢复时尝试采集（多方式触发）
  useEffect(() => {
    const onFocus = () => reportFingerprintOnce().catch(() => { });
    const onVisible = () => {
      if (document.visibilityState === 'visible') reportFingerprintOnce().catch(() => { });
    };
    const onOnline = () => reportFingerprintOnce().catch(() => { });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // 监听水印事件
  useEffect(() => {
    const handleShowWatermark = () => {
      setShowWatermark(true);
    };

    window.addEventListener('show-Synapse-watermark', handleShowWatermark);

    return () => {
      window.removeEventListener('show-Synapse-watermark', handleShowWatermark);
    };
  }, []);

  // 空闲时间预取高频组件，提升首次交互体验
  useEffect(() => {
    const win: any = typeof window !== 'undefined' ? window : undefined;
    const schedule = win && win.requestIdleCallback ? win.requestIdleCallback : (cb: () => void) => setTimeout(cb, 300);
    const cancel = win && win.cancelIdleCallback ? win.cancelIdleCallback : (id: any) => clearTimeout(id);
    const id = schedule(() => {
      import('./components/TtsPage');
      import('./components/MobileNav');
      import('./components/Footer');
      import('./components/WelcomePage');
    });
    return () => cancel(id);
  }, []);

  // Microsoft Clarity 初始化状态
  const [clarityInitialized, setClarityInitialized] = useState(false);

  // Microsoft Clarity 初始化
  useEffect(() => {
    const initializeClarity = async () => {
      if (typeof window === 'undefined') return;

      try {
        // 从后端获取 Clarity 配置
        const response = await fetch('/tts/clarity/config', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });

        if (response.ok) {
          const config = await response.json();

          if (config.enabled && config.projectId) {
            const c = await loadClarity();
            if (c) {
              c.default.init(config.projectId);
              setClarityInitialized(true);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to initialize Microsoft Clarity:', error);
      }
    };

    initializeClarity();
  }, []);

  // 用户状态变化时更新 Clarity 用户标识
  useEffect(() => {
    if (typeof window === 'undefined' || !clarityInitialized || !clarityModule) return;

    try {
      const c = clarityModule.default;
      if (user) {
        c.identify(
          user.id || user.username || 'unknown-user',
          undefined, // customSessionId
          undefined, // customPageId  
          user.username || user.email || 'Unknown User' // friendlyName
        );

        c.setTag('user_role', user.role || 'user');
        c.setTag('user_status', 'logged_in');
        if (user.email) {
          c.setTag('user_domain', user.email.split('@')[1] || 'unknown');
        }
      } else {
        c.identify('anonymous-user');
        c.setTag('user_status', 'anonymous');
      }
    } catch (error) {
      console.warn('Failed to update Clarity user identification:', error);
    }
  }, [user, clarityInitialized]);

  // 路由变化时设置页面标签
  useEffect(() => {
    if (typeof window === 'undefined' || !clarityInitialized || !clarityModule) return;

    try {
      const c = clarityModule.default;
      const routePath = location.pathname;
      const routeName = routePath === '/' ? 'home' : routePath.replace(/^\//, '').replace(/\//g, '_');

      c.setTag('current_route', routeName);
      c.setTag('route_path', routePath);

      if (routePath.startsWith('/admin')) {
        c.setTag('page_type', 'admin');
      } else if (routePath === '/welcome') {
        c.setTag('page_type', 'auth');
      } else if (routePath === '/') {
        c.setTag('page_type', 'main_app');
      } else {
        c.setTag('page_type', 'feature');
      }
    } catch (error) {
      console.warn('Failed to set Clarity route tags:', error);
    }
  }, [location.pathname, clarityInitialized]);

  useEffect(() => {
    const fetchTOTPStatus = async () => {
      if (!user) {
        setTotpStatus(null);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setTotpStatus(null);
          return;
        }

        const response = await fetch(getApiBaseUrl() + '/api/totp/status', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });

        if (response.ok) {
          const data = await response.json();
          // 验证响应数据结构
          if (data && typeof data === 'object') {
            setTotpStatus(data);
          } else {
            setTotpStatus(null);
          }
        } else {
          setTotpStatus(null);
        }
      } catch (e) {
        console.error('TOTP状态获取失败:', e);
        setTotpStatus(null);
      }
    };
    fetchTOTPStatus();
  }, [user]);

  const handleTOTPStatusChange = (status: TOTPStatus) => {
    setTotpStatus(status);
  };

  // 公告弹窗相关状态
  const [announcement, setAnnouncement] = useState<{ content: string; format: 'markdown' | 'html'; updatedAt: string } | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  // 公告hash
  const [announcementHash, setAnnouncementHash] = useState('');

  // 公告弹窗关闭逻辑
  useEffect(() => {
    // 获取公告内容
    const fetchAnnouncement = async () => {
      try {
        const res = await fetch(getApiBaseUrl() + '/api/admin/announcement', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        // 验证响应数据结构
        if (data &&
          typeof data === 'object' &&
          data.success &&
          data.announcement &&
          typeof data.announcement === 'object' &&
          data.announcement.content &&
          typeof data.announcement.content === 'string') {

          // 限制内容长度，防止过大的内容影响性能
          const maxContentLength = 10000; // 10KB
          const content = data.announcement.content.length > maxContentLength
            ? data.announcement.content.substring(0, maxContentLength) + '...'
            : data.announcement.content;

          setAnnouncement({
            content: content,
            format: data.announcement.format === 'html' ? 'html' : 'markdown',
            updatedAt: data.announcement.updatedAt || ''
          });

          // 计算hash
          const hash = md5(content + (data.announcement.updatedAt || ''));
          setAnnouncementHash(hash);
        } else {
          setAnnouncement(null);
          setAnnouncementHash('');
        }
      } catch (error) {
        console.error('公告获取失败:', error);
        setAnnouncement(null);
        setAnnouncementHash('');
      }
    };
    fetchAnnouncement();
  }, []);

  // 判断是否需要弹窗
  useEffect(() => {
    if (!announcement || !announcementHash) return;

    const key = `announcement_closed_${announcementHash}`;
    let closeInfo: string | null = null;

    try {
      closeInfo = localStorage.getItem(key);
    } catch (error) {
      console.error('localStorage访问失败:', error);
      setShowAnnouncement(true);
      return;
    }

    if (!closeInfo) {
      setShowAnnouncement(true);
      return;
    }

    try {
      const info = JSON.parse(closeInfo);

      // 验证数据结构
      if (!info || typeof info !== 'object') {
        setShowAnnouncement(true);
        return;
      }

      if (info.type === 'permanent') {
        setShowAnnouncement(false);
      } else if (info.type === 'date' && typeof info.date === 'string') {
        const today = new Date().toISOString().slice(0, 10);
        if (info.date !== today) {
          setShowAnnouncement(true);
        } else {
          setShowAnnouncement(false);
        }
      } else {
        setShowAnnouncement(true);
      }
    } catch (error) {
      console.error('公告关闭信息解析失败:', error);
      setShowAnnouncement(true);
    }
  }, [announcement, announcementHash]);

  // 公告弹窗关闭操作
  const handleCloseAnnouncement = () => {
    setShowAnnouncement(false);
  };

  const handleCloseToday = () => {
    if (!announcementHash) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const closeInfo = JSON.stringify({ type: 'date', date: today });
      localStorage.setItem(`announcement_closed_${announcementHash}`, closeInfo);
      setShowAnnouncement(false);
    } catch (error) {
      console.error('保存公告关闭信息失败:', error);
      setShowAnnouncement(false);
    }
  };

  const handleCloseForever = () => {
    if (!announcementHash) return;
    try {
      const closeInfo = JSON.stringify({ type: 'permanent' });
      localStorage.setItem(`announcement_closed_${announcementHash}`, closeInfo);
      setShowAnnouncement(false);
    } catch (error) {
      console.error('保存公告关闭信息失败:', error);
      setShowAnnouncement(false);
    }
  };

  if (loading || !isInitialized) {
    return (
      <AppLoadingScreen
        title="正在恢复工作台状态"
        detail="Synapse 正在检查登录态、恢复基础配置，并准备本次会话需要的界面资源。"
      />
    );
  }

  // 统一的渲染逻辑，不再区分管理员和普通用户

  // 首次访问验证（等待配置加载完成）
  if (!configLoaded || isFirstVisitLoading) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <AppLoadingScreen
            title="正在进行访问校验"
            detail="首次访问检测与前端安全配置仍在同步中，完成后会自动进入对应页面。"
          />
        </LazyMotion>
      </NotificationProvider>
    );
  }

  // 首次访问且未验证，且功能开关启用时，显示验证页面
  if (shouldBlockForFirstVisitCheck) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <FirstVisitVerification
            fingerprint={fingerprint ?? ''}
            onVerificationComplete={markAsVerified}
            isIpBanned={isIpBanned}
            banReason={banReason}
            banExpiresAt={banExpiresAt}
            clientIP={clientIP}
            challengeReason={firstVisitError ?? undefined}
          />
        </LazyMotion>
      </NotificationProvider>
    );
  }

  return (
    <NotificationProvider>
      <BroadcastModalProvider>
        <WsConnector />
        <LazyMotion features={domAnimation}>
          <ToastContainer position={toastPosition} autoClose={4500} hideProgressBar newestOnTop limit={3} />
          {/* 公告弹窗 */}
          <AnnouncementModal
            open={!isAnnouncementSuppressed && showAnnouncement && !!announcement}
            onClose={handleCloseAnnouncement}
            onCloseToday={handleCloseToday}
            onCloseForever={handleCloseForever}
            content={announcement?.content ? DOMPurify.sanitize(announcement.content) : ''}
            format={announcement?.format || 'markdown'}
            // 新增：内容区自适应高度，超出可滚动
            contentClassName="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto px-2 sm:px-4"
          />
          <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
            {showParticles && <BackgroundParticles />}
            <a
              href="#app-main-content"
              className="absolute left-4 top-4 z-50 -translate-y-24 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0"
            >
              跳到主要内容
            </a>
            <m.nav
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={navTransition}
              className="bg-white/80 backdrop-blur-lg shadow-lg relative z-10"
            >
              <div
                id="app-header-container"
                className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
                data-integrity="critical"
                data-protection="maximum"
                data-component="AppHeader"
              >
                <div
                  id="app-header-content"
                  className="flex justify-between items-center h-16"
                  data-integrity="critical"
                >
                  <m.div
                    id="app-brand-logo"
                    className="flex items-center space-x-2"
                    whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    data-integrity="critical"
                    data-protection="brand-identity"
                    data-critical-text="Synapse"
                  >
                    <m.img
                      id="app-brand-icon"
                      className="w-8 h-8 rounded-lg shadow-sm"
                      src="https://picui.ogmua.cn/s1/2026/03/29/69c8f6226a17c.webp"
                      alt="Synapse Logo"
                      animate={prefersReducedMotion ? undefined : { rotate: [0, 4, -4, 0] }}
                      transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      data-integrity="critical"
                      data-protection="brand-icon"
                    />
                    <Link
                      id="app-brand-text"
                      to="/"
                      className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                      data-integrity="critical"
                      data-protection="brand-text"
                      data-critical-text="Synapse"
                      data-original-text="Synapse"
                    >
                      Synapse
                    </Link>
                  </m.div>

                  {/* 导航栏自适应切换 */}
                  <div ref={navRef} className="flex-1 flex justify-end">
                    {user ? (
                      <Suspense fallback={<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm"><SimpleLoadingSpinner size={0.6} /></div>}>
                        <MobileNav
                          user={user}
                          logout={logout}
                          onTOTPManagerOpen={() => setShowTOTPManager(true)}
                          totpStatus={totpStatus}
                        />
                      </Suspense>
                    ) : (
                      <Link 
                        to="/welcome" 
                        className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        立即登录
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </m.nav>

            <main
              id="app-main-content"
              ref={mainRef}
              tabIndex={-1}
              className="max-w-7xl mx-auto py-6 focus:outline-none sm:px-6 lg:px-8 relative z-10"
            >
              <Suspense fallback={<RouteLoadingShell />}>
                <AnimatePresence mode="wait">
                  <Routes location={location} key={location.pathname}>
                    <Route path="/api-docs" element={renderAnimatedRoute(<ApiDocs />)} />
                    <Route path="/policy" element={renderAnimatedRoute(<PolicyPage />)} />
                    <Route path="/fbi-wanted" element={renderAnimatedRoute(<FBIWantedPublic />)} />
                    <Route path="/welcome" element={renderAnimatedRoute(<WelcomePage />)} />
                    <Route path="/login" element={renderAnimatedRoute(<LoginPage />)} />
                    <Route path="/register" element={renderAnimatedRoute(<RegisterPage />)} />
                    <Route path="/auth/linuxdo/callback" element={renderAnimatedRoute(<LinuxDoAuthCallbackPage />)} />
                    <Route path="/translate" element={renderProtectedRoute(<DeepLXTranslatorPage />)} />
                    <Route path="/forgot-password" element={renderAnimatedRoute(<ForgotPasswordPage />)} />
                    <Route path="/reset-password" element={renderAnimatedRoute(<ResetPasswordLinkPage />)} />
                    <Route path="/verify-email" element={renderAnimatedRoute(<EmailVerifyPage />)} />
                    <Route path="/" element={renderAnimatedRoute(<TtsPage />)} />
                    <Route path="/lottery" element={renderAnimatedRoute(<LotteryPage />)} />
                    <Route path="/anti-counterfeit" element={renderAnimatedRoute(<AntiCounterfeitPage />)} />
                    <Route path="/admin/lottery" element={renderAdminRoute(<LotteryAdmin />)} />
                    <Route path="/admin/users" element={renderAdminRoute(<UserManagement />)} />
                    <Route path="/admin" element={renderAdminRoute(<AdminDashboard />)} />
                    <Route path="/nexai-security" element={renderAdminRoute(<NexAISecurityDashboard />)} />
                    <Route path="/github-billing" element={renderAnimatedRoute(<GitHubBillingDashboard />)} />
                    <Route path="/logshare" element={renderAnimatedRoute(<LogShare />)} />
                    <Route path="/case-converter" element={renderAnimatedRoute(<CaseConverter />)} />
                    <Route path="/word-count" element={renderAnimatedRoute(<WordCountPageSimple />)} />
                    <Route path="/age-calculator" element={renderAnimatedRoute(<AgeCalculatorPage />)} />
                    <Route path="/email-sender" element={renderAdminRoute(<EmailSender />)} />
                    <Route path="/profile" element={renderAnimatedRoute(<UserProfile />)} />
                    <Route path="/outemail" element={renderAnimatedRoute(<OutEmail />)} />
                    <Route path="/support" element={renderAnimatedRoute(<TicketSystem />)} />
                    <Route path="/modlist" element={renderAnimatedRoute(<ModListPage />)} />
                    <Route path="/smart-human-check" element={renderAnimatedRoute(<SmartHumanCheckTestPage />)} />
                    <Route path="/notification-test" element={renderAnimatedRoute(<NotificationTestPage />)} />
                    <Route path="/hcaptcha-verify" element={renderAnimatedRoute(<HCaptchaVerificationPage />)} />
                    <Route path="/artifacts/:shortId" element={renderAnimatedRoute(<ArtifactSharePage />)} />
                    <Route path="/image-upload" element={renderAnimatedRoute(<ImageUploadPage />)} />
                    <Route path="/librechat" element={renderAnimatedRoute(<LibreChatPage />)} />
                    <Route path="/tiger-adventure" element={renderAnimatedRoute(<TigerAdventure />)} />
                    <Route path="/coin-flip" element={renderAnimatedRoute(<CoinFlip />)} />
                    <Route path="/markdown-export" element={renderAnimatedRoute(<MarkdownExportPage />)} />
                    <Route path="/campus-emergency" element={renderAnimatedRoute(<CampusEmergencyPage />)} />
                    <Route path="/tamper-detection-demo" element={renderAdminRoute(<TamperDetectionDemo />)} />

                    <Route path="/demo" element={renderAnimatedRoute(<DemoHub />)} />
                    <Route path="/demo/xiaohongshu" element={renderAnimatedRoute(<XiaohongshuDemo />)} />
                    <Route path="/demo/meditation" element={renderAnimatedRoute(<MeditationAppDemo />)} />
                    <Route path="/demo/music" element={renderAnimatedRoute(<MusicPlayerDemo />)} />
                    <Route path="/demo/finance" element={renderAnimatedRoute(<FinanceAppDemo />)} />
                    <Route path="/store" element={renderAnimatedRoute(<ResourceStoreList />)} />
                    <Route path="/store/resources/:id" element={renderAnimatedRoute(<ResourceStoreDetail />)} />
                    <Route path="/admin/store" element={renderAdminRoute(<AdminStoreDashboard />)} />
                    <Route path="/admin/store/resources" element={renderAdminRoute(<ResourceStoreManager />)} />
                    <Route path="/admin/store/cdks" element={renderAdminRoute(<CDKStoreManager />)} />
                    <Route path="/public-shortlink" element={renderAnimatedRoute(<PublicShortLinkCreator />)} />
                    <Route path="*" element={renderAnimatedRoute(<NotFoundPage path={location.pathname} />)} />
                  </Routes>
                </AnimatePresence>
              </Suspense>
            </main>
            <Suspense fallback={null}>
              <Footer />
            </Suspense>

            {/* TOTP管理器模态框 */}
            <AnimatePresence>
              {showTOTPManager && (
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                  onClick={closeTOTPManager}
                >
                  <m.div
                    ref={totpDialogRef}
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={prefersReducedMotion ? { duration: 0 } : TOTP_SPRING}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="totp-manager-title"
                    className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overscroll-contain"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 id="totp-manager-title" className="text-2xl font-bold text-gray-900">账户安全设置</h2>
                        <button
                          ref={totpCloseButtonRef}
                          onClick={closeTOTPManager}
                          className="rounded-full p-2 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          title="关闭"
                          aria-label="关闭账户安全设置"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <TOTPManager onStatusChange={handleTOTPStatusChange} />
                    </div>
                  </m.div>
                </m.div>
              )}
            </AnimatePresence>

            {/* 水印覆盖层 */}
            <AnimatePresence>
              {showWatermark && (
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={overlayTransition}
                >
                  <WatermarkOverlay />
                </m.div>
              )}
            </AnimatePresence>

            {/* 指纹请求弹窗 */}
            <FingerprintRequestModal
              isOpen={shouldShowRequest}
              onClose={handleDismiss}
              onRequestComplete={markFingerprintRequestCompleted}
              hasDismissedOnce={requestStatus.fingerprintRequestDismissedOnce}
              onDismissOnce={recordDismissOnce}
            />
          </div>
        </LazyMotion>
      </BroadcastModalProvider>
    </NotificationProvider>
  );
};

// ErrorBoundary 组件
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // 记录错误但不暴露敏感信息
    console.error('React Error Boundary caught an error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 可以在这里发送错误报告到监控服务
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">页面加载失败</h2>
            <p className="text-gray-600 text-center mb-8">抱歉，页面出现了一些问题。请尝试刷新页面或稍后重试。</p>
            <button
              onClick={() => {
                try {
                  window.location.reload();
                } catch (error) {
                  console.error('页面刷新失败:', error);
                  this.setState({ hasError: false });
                }
              }}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 包装 App 组件以使用 useLocation
const AppWithRouter: React.FC = () => (
  <ErrorBoundary>
    <Router>
      <App />
    </Router>
  </ErrorBoundary>
);

export default AppWithRouter; 
