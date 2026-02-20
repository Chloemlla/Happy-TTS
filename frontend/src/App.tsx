import React, { useState, useEffect, Suspense, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { TOTPStatus } from './types/auth';
import { LoadingSpinner, SimpleLoadingSpinner } from './components/LoadingSpinner';
import TOTPManager from './components/TOTPManager';
import { NotificationProvider } from './components/Notification';
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

// 恢复 EmailSender 懒加载
const EmailSenderPage: React.FC = () => {
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [content, setContent] = React.useState('');
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState('');
  const [error, setError] = React.useState('');
  const handleSend = () => { };
  return (
    <EmailSender
      to={to}
      subject={subject}
      content={content}
      code={code}
      setTo={setTo}
      setSubject={setSubject}
      setContent={setContent}
      setCode={setCode}
      loading={loading}
      success={success}
      error={error}
      handleSend={handleSend}
    />
  );
};

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
          Copyright Individual Developer Happy-clo
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
  const pageTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : PAGE_TRANSITION), [prefersReducedMotion]);
  const navTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : NAV_SPRING), [prefersReducedMotion]);
  const overlayTransition = React.useMemo(() => (prefersReducedMotion ? { duration: 0 } : { duration: 0.5 }), [prefersReducedMotion]);
  const showParticles = !prefersReducedMotion;

  // React 19 文档元数据：路由配置优化，避免每次重新创建
  const routeConfig = React.useMemo(() => ({
    titles: {
      '/': 'Happy TTS - 首页',
      '/welcome': 'Happy TTS - 欢迎页面',
      '/login': 'Happy TTS - 登录',
      '/register': 'Happy TTS - 注册',
      '/tts': 'Happy TTS - 语音合成',
      '/policy': 'Happy TTS - 服务条款',
      '/fbi-wanted': 'Happy TTS - FBI通缉犯查询',
      '/lottery': 'Happy TTS - 抽奖系统',
      '/anti-counterfeit': 'Happy TTS - 安踏防伪查询',
      '/admin/lottery': 'Happy TTS - 抽奖管理',
      '/admin/users': 'Happy TTS - 用户管理',
      '/admin': 'Happy TTS - 管理后台',
      '/github-billing': 'Happy TTS - GitHub账单查询',
      '/logshare': 'Happy TTS - 日志分享',
      '/case-converter': 'Happy TTS - 大小写转换',
      '/word-count': 'Happy TTS - 字数统计',
      '/age-calculator': 'Happy TTS - 年龄计算器',
      '/email-sender': 'Happy TTS - 邮件发送',
      '/profile': 'Happy TTS - 个人资料',
      '/outemail': 'Happy TTS - 外部邮件',
      '/modlist': 'Happy TTS - 模组列表',
      '/smart-human-check': 'Happy TTS - 智能人机验证',
      '/notification-test': 'Happy TTS - 通知测试',
      '/hcaptcha-verify': 'Happy TTS - hCaptcha验证',
      '/image-upload': 'Happy TTS - 图片上传',
      '/librechat': 'Happy TTS - LibreChat',
      '/tiger-adventure': 'Happy TTS - 老虎冒险',
      '/coin-flip': 'Happy TTS - 硬币翻转',
      '/markdown-export': 'Happy TTS - Markdown导出',
      '/campus-emergency': 'Happy TTS - 校园紧急情况',
      '/tamper-detection-demo': 'Happy TTS - 篡改检测演示',
      '/demo': 'Happy TTS - 演示中心',
      '/demo/xiaohongshu': 'Happy TTS - 小红书演示',
      '/demo/meditation': 'Happy TTS - 冥想应用演示',
      '/demo/music': 'Happy TTS - 音乐播放器演示',
      '/demo/finance': 'Happy TTS - 金融应用演示',
      '/store': 'Happy TTS - 资源商店',
      '/admin/store': 'Happy TTS - 商店管理',
      '/admin/store/resources': 'Happy TTS - 资源管理',
      '/admin/store/cdks': 'Happy TTS - CDK管理',
    },
    descriptions: {
      '/': 'Happy TTS智能语音合成平台，提供高质量的文本转语音服务',
      '/tts': '使用Happy TTS进行高质量的文本转语音合成',
      '/lottery': '参与Happy TTS抽奖活动，赢取丰厚奖励',
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
    document.title = title || 'Happy TTS - 智能语音合成平台';

    // 获取页面描述
    const descriptions = routeConfig.descriptions as Record<string, string>;
    const description = descriptions[currentPath] ||
      descriptions['/' + currentPath.split('/')[1]] ||
      'Happy TTS智能语音合成平台，提供多种实用工具和高质量服务';

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

    updateOrCreateMeta('og:title', title || 'Happy TTS - 智能语音合成平台');
    updateOrCreateMeta('og:description', description);
    updateOrCreateMeta('og:type', 'website');
    updateOrCreateMeta('og:site_name', 'Happy TTS');
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

    window.addEventListener('show-happy-tts-watermark', handleShowWatermark);

    return () => {
      window.removeEventListener('show-happy-tts-watermark', handleShowWatermark);
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
    let scale = 1;
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 600) {
        scale = Math.max(0.95, Math.min(1.2, window.innerWidth / 375)); // 移动端最小0.95
      } else {
        scale = Math.max(0.7, Math.min(1.2, window.innerWidth / 1200)); // 桌面端
      }
    }
    return <LoadingSpinner size={scale} />;
  }

  // 统一的渲染逻辑，不再区分管理员和普通用户

  // 首次访问验证（等待配置加载完成）
  if (!configLoaded || isFirstVisitLoading) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <LoadingSpinner />
        </LazyMotion>
      </NotificationProvider>
    );
  }

  // 首次访问且未验证，且功能开关启用时，显示验证页面
  if (enableFirstVisitVerification && isFirstVisit && !isVerified && fingerprint) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <FirstVisitVerification
            fingerprint={fingerprint}
            onVerificationComplete={markAsVerified}
            isIpBanned={isIpBanned}
            banReason={banReason}
            banExpiresAt={banExpiresAt}
            clientIP={clientIP}
          />
        </LazyMotion>
      </NotificationProvider>
    );
  }

  return (
    <NotificationProvider>
      <WsConnector />
      <LazyMotion features={domAnimation}>
        <ToastContainer position="top-center" autoClose={2000} hideProgressBar newestOnTop />
        {/* 公告弹窗 */}
        <AnnouncementModal
          open={showAnnouncement && !!announcement}
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
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  data-integrity="critical"
                  data-protection="brand-identity"
                  data-critical-text="Happy TTS"
                >
                  <m.svg
                    id="app-brand-icon"
                    className="w-8 h-8 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    data-integrity="critical"
                    data-protection="brand-icon"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </m.svg>
                  <Link
                    id="app-brand-text"
                    to="/"
                    className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                    data-integrity="critical"
                    data-protection="brand-text"
                    data-critical-text="Happy TTS"
                    data-original-text="Happy TTS"
                  >
                    Happy TTS
                  </Link>
                </m.div>

                {/* 导航栏自适应切换 - 只在用户登录时显示 */}
                {user && (
                  <div ref={navRef} className="flex-1 flex justify-end">
                    <Suspense fallback={<div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>}>
                      <MobileNav
                        user={user}
                        logout={logout}
                        onTOTPManagerOpen={() => setShowTOTPManager(true)}
                        totpStatus={totpStatus}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          </m.nav>

          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 relative z-10">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/api-docs" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <ApiDocs />
                  </m.div>
                } />
                <Route path="/policy" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <PolicyPage />
                  </m.div>
                } />
                <Route path="/fbi-wanted" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <FBIWantedPublic />
                    </m.div>
                  </Suspense>
                } />
                <Route
                  path="/welcome"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <WelcomePage />
                      </m.div>
                    )
                  }
                />
                <Route
                  path="/login"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Suspense fallback={<LoadingSpinner />}>
                        <m.div
                          variants={pageVariants}
                          initial="initial"
                          animate="in"
                          exit="out"
                          transition={pageTransition}
                        >
                          <LoginPage />
                        </m.div>
                      </Suspense>
                    )
                  }
                />
                <Route
                  path="/register"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Suspense fallback={<LoadingSpinner />}>
                        <m.div
                          variants={pageVariants}
                          initial="initial"
                          animate="in"
                          exit="out"
                          transition={pageTransition}
                        >
                          <RegisterPage />
                        </m.div>
                      </Suspense>
                    )
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Suspense fallback={<LoadingSpinner />}>
                        <m.div
                          variants={pageVariants}
                          initial="initial"
                          animate="in"
                          exit="out"
                          transition={pageTransition}
                        >
                          <ForgotPasswordPage />
                        </m.div>
                      </Suspense>
                    )
                  }
                />
                <Route
                  path="/reset-password"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Suspense fallback={<LoadingSpinner />}>
                        <m.div
                          variants={pageVariants}
                          initial="initial"
                          animate="in"
                          exit="out"
                          transition={pageTransition}
                        >
                          <ResetPasswordLinkPage />
                        </m.div>
                      </Suspense>
                    )
                  }
                />
                <Route
                  path="/verify-email"
                  element={
                    user ? (
                      <Navigate to="/" replace />
                    ) : (
                      <Suspense fallback={<LoadingSpinner />}>
                        <m.div
                          variants={pageVariants}
                          initial="initial"
                          animate="in"
                          exit="out"
                          transition={pageTransition}
                        >
                          <EmailVerifyPage />
                        </m.div>
                      </Suspense>
                    )
                  }
                />
                <Route
                  path="/"
                  element={
                    user ? (
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <TtsPage />
                      </m.div>
                    ) : (
                      <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                    )
                  }
                />
                <Route path="/lottery" element={
                  user ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <LotteryPage />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                  )
                } />
                <Route path="/anti-counterfeit" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <AntiCounterfeitPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/admin/lottery" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <LotteryAdmin />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />
                <Route path="/admin/users" element={
                  user?.role === 'admin' ? (
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <UserManagement />
                    </m.div>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />
                <Route path="/admin" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <AdminDashboard />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />
                <Route path="/github-billing" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <GitHubBillingDashboard />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/logshare" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <LogShare />
                  </m.div>
                } />
                <Route path="/case-converter" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <CaseConverter />
                  </m.div>
                } />
                <Route path="/word-count" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <WordCountPageSimple />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/age-calculator" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <AgeCalculatorPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/email-sender" element={
                  user?.role === 'admin' ? (
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <Suspense fallback={<LoadingSpinner />}>
                        <EmailSenderPage />
                      </Suspense>
                    </m.div>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />
                <Route path="/profile" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <UserProfile />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/outemail" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <OutEmail />
                  </m.div>
                } />
                <Route path="/modlist" element={
                  <m.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={pageTransition}
                  >
                    <ModListPage />
                  </m.div>
                } />
                <Route path="/smart-human-check" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <SmartHumanCheckTestPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/notification-test" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <NotificationTestPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/hcaptcha-verify" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <HCaptchaVerificationPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/image-upload" element={
                  user ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <ImageUploadPage />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                  )
                } />
                <Route path="/librechat" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <LibreChatPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/tiger-adventure" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <TigerAdventure />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/coin-flip" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <CoinFlip />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/markdown-export" element={
                  user ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <MarkdownExportPage />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                  )
                } />
                <Route path="/campus-emergency" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <CampusEmergencyPage />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/tamper-detection-demo" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <TamperDetectionDemo />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />

                {/* UI展示页面路由 */}
                <Route path="/demo" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <DemoHub />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/demo/xiaohongshu" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <XiaohongshuDemo />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/demo/meditation" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <MeditationAppDemo />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/demo/music" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <MusicPlayerDemo />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/demo/finance" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <FinanceAppDemo />
                    </m.div>
                  </Suspense>
                } />

                {/* 资源商店相关路由 */}
                <Route path="/store" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <ResourceStoreList />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/store/resources/:id" element={
                  <Suspense fallback={<LoadingSpinner />}>
                    <m.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={pageTransition}
                    >
                      <ResourceStoreDetail />
                    </m.div>
                  </Suspense>
                } />
                <Route path="/admin/store" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <AdminStoreDashboard />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/admin/login" replace />
                  )
                } />
                <Route path="/admin/store/resources" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <ResourceStoreManager />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/admin/login" replace />
                  )
                } />
                <Route path="/admin/store/cdks" element={
                  user?.role === 'admin' ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <m.div
                        variants={pageVariants}
                        initial="initial"
                        animate="in"
                        exit="out"
                        transition={pageTransition}
                      >
                        <CDKStoreManager />
                      </m.div>
                    </Suspense>
                  ) : (
                    <Navigate to="/admin/login" replace />
                  )
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </main>
          <Footer />

          {/* TOTP管理器模态框 */}
          <AnimatePresence>
            {showTOTPManager && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                onClick={() => setShowTOTPManager(false)}
              >
                <m.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  transition={prefersReducedMotion ? { duration: 0 } : TOTP_SPRING}
                  className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">账户安全设置</h2>
                      <button
                        onClick={() => setShowTOTPManager(false)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="关闭"
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