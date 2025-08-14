import React, { useState, useEffect, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { TOTPStatus } from './types/auth';
import { LoadingSpinner, SimpleLoadingSpinner } from './components/LoadingSpinner';
import TOTPManager from './components/TOTPManager';
import { NotificationProvider } from './components/Notification';
import ModListPage from './components/ModListPage';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AnnouncementModal from './components/AnnouncementModal';
import md5 from 'md5';
import getApiBaseUrl from './api';
import DOMPurify from 'dompurify';
import { reportFingerprintOnce } from './utils/fingerprint';

// 懒加载组件
const WelcomePage = React.lazy(() => import('./components/WelcomePage').then(module => ({ default: module.WelcomePage })));
const TtsPage = React.lazy(() => import('./components/TtsPage').then(module => ({ default: module.TtsPage })));
const PolicyPage = React.lazy(() => import('./components/PolicyPage'));
const Footer = React.lazy(() => import('./components/Footer'));
const PublicIP = React.lazy(() => import('./components/PublicIP'));
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

// 资源商店相关组件懒加载
const AdminStoreDashboard = React.lazy(() => import('./components/AdminStoreDashboard'));
const ResourceStoreApp = React.lazy(() => import('./components/ResourceStoreApp'));
const ResourceStoreDetail = React.lazy(() => import('./components/ResourceStoreDetail'));
const ResourceStoreList = React.lazy(() => import('./components/ResourceStoreList'));
const ResourceStoreManager = React.lazy(() => import('./components/ResourceStoreManager'));
const CDKStoreManager = React.lazy(() => import('./components/CDKStoreManager'));

// FBI通缉犯相关组件懒加载
const FBIWantedPublic = React.lazy(() => import('./components/FBIWantedPublic'));

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

// 背景粒子组件
const BackgroundParticles: React.FC = () => {
  const [particles, setParticles] = React.useState<Array<{ id: number, x: number, y: number, duration: number }>>([]);

  React.useEffect(() => {
    // 预生成粒子位置，避免每次渲染都重新计算
    const generatedParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
      y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
      duration: Math.random() * 20 + 10
    }));
    setParticles(generatedParticles);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-2 h-2 bg-indigo-200 rounded-full opacity-30"
          initial={{
            x: particle.x,
            y: particle.y,
          }}
          animate={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

// 水印组件（满屏铺满）
const WatermarkOverlay: React.FC = () => {
  const [watermarks, setWatermarks] = React.useState<Array<{ id: number, left: string, top: string, rotate: number }>>([]);

  React.useEffect(() => {
    // 极高密度，降低页面可读性
    const cols = 20;
    const rows = 14;
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
    setWatermarks(items);
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden backdrop-blur-sm">
      {/* 斜向条纹遮罩层 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,0,0,0.18) 0px, rgba(255,0,0,0.18) 10px, transparent 10px, transparent 22px)',
          backgroundSize: '200px 200px',
          animation: 'wmScroll 12s linear infinite',
          mixBlendMode: 'multiply',
        }}
      />
      {/* 水平细线遮罩层 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 6px)',
          animation: 'wmScrollY 14s linear infinite',
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
            fontSize: '16px',
            animation: 'wmJitter 3s ease-in-out infinite alternate',
            animationDelay: `${(wm.id % 7) * 0.15}s`,
          }}
        >
          Copyright © Individual Developer Happy-clo
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
};

const App: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);
  const [showTOTPManager, setShowTOTPManager] = useState(false);
  const [totpStatus, setTotpStatus] = useState<TOTPStatus | null>(null);
  const [showWatermark, setShowWatermark] = useState(false);

  // 在App组件内，提升isMobile/isOverflow状态
  const [isMobileNav, setIsMobileNav] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
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

    window.addEventListener('show-synapse-watermark', handleShowWatermark);

    return () => {
      window.removeEventListener('show-synapse-watermark', handleShowWatermark);
    };
  }, []);

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

        const response = await fetch('/api/totp/status', {
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

  return (
    <NotificationProvider>
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
        <BackgroundParticles />
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="bg-white/80 backdrop-blur-lg shadow-lg relative z-10"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <motion.div
                className="flex items-center space-x-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <motion.svg
                  className="w-8 h-8 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </motion.svg>
                <Link to="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">Synapse</Link>
              </motion.div>

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
        </motion.nav>

        <PublicIP />

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 relative z-10">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/api-docs" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <ApiDocs />
                </motion.div>
              } />
              <Route path="/policy" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <PolicyPage />
                </motion.div>
              } />
              <Route path="/fbi-wanted" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <FBIWantedPublic />
                  </motion.div>
                </Suspense>
              } />
              <Route
                path="/welcome"
                element={
                  user ? (
                    <Navigate to="/" replace />
                  ) : (
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <WelcomePage />
                    </motion.div>
                  )
                }
              />
              <Route
                path="/"
                element={
                  user ? (
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <TtsPage />
                    </motion.div>
                  ) : (
                    <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                  )
                }
              />
              <Route path="/lottery" element={
                user ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <LotteryPage />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                )
              } />
              <Route path="/admin/lottery" element={
                user?.role === 'admin' ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <LotteryAdmin />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/" replace />
                )
              } />
              <Route path="/admin/users" element={
                user?.role === 'admin' ? (
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <UserManagement />
                  </motion.div>
                ) : (
                  <Navigate to="/" replace />
                )
              } />
              <Route path="/admin" element={
                user?.role === 'admin' ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <AdminDashboard />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/" replace />
                )
              } />
              <Route path="/logshare" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <LogShare />
                </motion.div>
              } />
              <Route path="/case-converter" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <CaseConverter />
                </motion.div>
              } />
              <Route path="/email-sender" element={
                user?.role === 'admin' ? (
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <Suspense fallback={<LoadingSpinner />}>
                      <EmailSenderPage />
                    </Suspense>
                  </motion.div>
                ) : (
                  <Navigate to="/" replace />
                )
              } />
              <Route path="/profile" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <UserProfile />
                  </motion.div>
                </Suspense>
              } />
              <Route path="/outemail" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <OutEmail />
                </motion.div>
              } />
              <Route path="/modlist" element={
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <ModListPage />
                </motion.div>
              } />
              <Route path="/image-upload" element={
                user ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <ImageUploadPage />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                )
              } />
              <Route path="/tiger-adventure" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <TigerAdventure />
                  </motion.div>
                </Suspense>
              } />
              <Route path="/coin-flip" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <CoinFlip />
                  </motion.div>
                </Suspense>
              } />
              <Route path="/markdown-export" element={
                user ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <MarkdownExportPage />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/welcome" replace state={{ from: location.pathname }} />
                )
              } />

              {/* 资源商店相关路由 */}
              <Route path="/store" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <ResourceStoreList />
                  </motion.div>
                </Suspense>
              } />
              <Route path="/store/resources/:id" element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <ResourceStoreDetail />
                  </motion.div>
                </Suspense>
              } />
              <Route path="/admin/store" element={
                user?.role === 'admin' ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <AdminStoreDashboard />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/admin/login" replace />
                )
              } />
              <Route path="/admin/store/resources" element={
                user?.role === 'admin' ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <ResourceStoreManager />
                    </motion.div>
                  </Suspense>
                ) : (
                  <Navigate to="/admin/login" replace />
                )
              } />
              <Route path="/admin/store/cdks" element={
                user?.role === 'admin' ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <motion.div
                      variants={pageVariants}
                      initial="initial"
                      animate="in"
                      exit="out"
                      transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                    >
                      <CDKStoreManager />
                    </motion.div>
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowTOTPManager(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 水印覆盖层 */}
        <AnimatePresence>
          {showWatermark && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <WatermarkOverlay />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen flex items-center justify-center bg-gray-50"
        >
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center"
            >
              <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </motion.div>
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-bold text-center text-gray-800 mb-4"
            >
              页面加载失败
            </motion.h2>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-gray-600 text-center mb-8"
            >
              抱歉，页面出现了一些问题。请尝试刷新页面或稍后重试。
            </motion.p>
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                try {
                  window.location.reload();
                } catch (error) {
                  console.error('页面刷新失败:', error);
                  // 备用方案：清除错误状态
                  this.setState({ hasError: false });
                }
              }}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300"
            >
              刷新页面
            </motion.button>
          </div>
        </motion.div>
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