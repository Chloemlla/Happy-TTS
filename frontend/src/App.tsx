import React, { useState, useEffect, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { TOTPStatus } from './types/auth';
import { LoadingSpinner, SimpleLoadingSpinner } from './components/LoadingSpinner';
import TOTPManager from './components/TOTPManager';
import { NotificationProvider } from './components/Notification';
import DesktopNav from './components/DesktopNav';

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

// 恢复 EmailSender 懒加载
const EmailSenderPage: React.FC = () => {
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [content, setContent] = React.useState('');
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState('');
  const [error, setError] = React.useState('');
  const handleSend = () => {};
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
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-indigo-200 rounded-full opacity-30"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          animate={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          transition={{
            duration: Math.random() * 20 + 10,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

// 水印组件
const WatermarkOverlay: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute text-red-500/20 font-bold text-lg select-none"
          style={{
            left: `${(i % 10) * 10}%`,
            top: `${Math.floor(i / 10) * 10}%`,
            transform: `rotate(${Math.random() * 30 - 15}deg)`,
            fontSize: `${Math.random() * 20 + 16}px`,
          }}
        >
          Synapse
        </div>
      ))}
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
        const response = await fetch('/api/totp/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setTotpStatus(data);
        } else {
          setTotpStatus(null);
        }
      } catch (e) {
        setTotpStatus(null);
      }
    };
    fetchTOTPStatus();
  }, [user]);

  const handleTOTPStatusChange = (status: TOTPStatus) => {
    setTotpStatus(status);
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
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true };
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
                            onClick={() => window.location.reload()}
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