import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { WelcomePage } from './components/WelcomePage';
import { TtsPage } from './components/TtsPage';
import PolicyPage from './components/PolicyPage';
import Footer from './components/Footer';
import PublicIP from './components/PublicIP';
import UserManagement from './components/UserManagement';
import TOTPManager from './components/TOTPManager';
import { TOTPStatus } from './types/auth';
import MobileNav from './components/MobileNav';
import ApiDocs from './components/ApiDocs';
import LogShare from './components/LogShare';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

// 加载动画组件
const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
      <BackgroundParticles />
      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* 包裹外圈和内圈的容器，保证居中 */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          {/* 外圈旋转 */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div className="w-full h-full border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
          </motion.div>
          {/* 内圈缩放 - 使用flex居中替代transform */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-full"></div>
          </motion.div>
        </div>
        <motion.p
          className="mt-6 text-center text-gray-600 font-medium"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          正在加载...
        </motion.p>
      </motion.div>
      <PublicIP />
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
    return <LoadingSpinner />;
  }

  // 如果是管理员，直接渲染主页
  if (user?.role === 'admin') {
    return (
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
              
              {/* 所有按钮都交由MobileNav统一管理 */}
              {user && (
                <MobileNav
                  user={user}
                  logout={logout}
                  onTOTPManagerOpen={() => setShowTOTPManager(true)}
                  totpStatus={totpStatus}
                />
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
              <Route path="/admin/users" element={
                user?.role === 'admin' ? (
                  <motion.div
                    variants={pageVariants}
                    initial="initial"
                    animate="in"
                    exit="out"
                    transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                  >
                    <UserManagement token={localStorage.getItem('token') || ''} />
                  </motion.div>
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
        <ToastContainer />
      </div>
    );
  }

  return (
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
            
            {/* 所有按钮都交由MobileNav统一管理 */}
            {user && (
              <MobileNav
                user={user}
                logout={logout}
                onTOTPManagerOpen={() => setShowTOTPManager(true)}
                totpStatus={totpStatus}
              />
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
            <Route path="/admin/users" element={
              user?.role === 'admin' ? (
                <motion.div
                  variants={pageVariants}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ type: "tween", ease: "easeInOut", duration: 0.4 }}
                >
                  <UserManagement token={localStorage.getItem('token') || ''} />
                </motion.div>
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
      <ToastContainer />
    </div>
  );
};

// 包装 App 组件以使用 useLocation
const AppWithRouter: React.FC = () => (
  <Router>
    <App />
  </Router>
);

export default AppWithRouter; 