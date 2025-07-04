import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import ReactDOM from 'react-dom';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';

interface MobileNavProps {
  user: User | null;
  logout: () => void;
  onTOTPManagerOpen: () => void;
  totpStatus?: { enabled: boolean } | null;
}

const MobileNav: React.FC<MobileNavProps> = ({ 
  user, 
  logout, 
  onTOTPManagerOpen, 
  totpStatus 
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const twoFactorStatus = useTwoFactorStatus();

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 关闭菜单当路由改变时
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    logout();
  };

  const handleTOTPManager = () => {
    setIsMenuOpen(false);
    onTOTPManagerOpen();
  };

  // 桌面端导航
  if (!isMobile) {
    return (
      <motion.div 
        className="flex items-center space-x-3"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Link 
            to="/api-docs" 
            className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            API 文档
          </Link>
        </motion.div>
        {user?.role === 'admin' && (
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              to="/admin/users" 
              className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              用户管理
            </Link>
          </motion.div>
        )}
        <motion.button
          onClick={onTOTPManagerOpen}
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <motion.svg 
            className="w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </motion.svg>
          <span>二次验证</span>
          {twoFactorStatus.enabled && (
            <motion.span 
              className="w-2 h-2 bg-green-500 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </motion.button>
        <motion.button
          onClick={logout}
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-sm hover:shadow-md"
        >
          退出
        </motion.button>
      </motion.div>
    );
  }

  // 移动端导航
  return (
    <div className="relative">
      {/* 汉堡菜单按钮 */}
      <motion.button
        onClick={toggleMenu}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center justify-center p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-200 shadow-sm"
        aria-label="打开菜单"
      >
        <motion.svg 
          className="w-5 h-5"
          animate={{ rotate: isMenuOpen ? 90 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 6h16M4 12h16M4 18h16" 
          />
        </motion.svg>
      </motion.button>

      {/* 下拉菜单（Portal渲染） */}
      {isMenuOpen && ReactDOM.createPortal(
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-25 z-[9998]"
            onClick={() => setIsMenuOpen(false)}
          />
          {/* 菜单内容 */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.92, x: 20 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.92, x: 20 }}
            transition={{ 
              type: 'spring', 
              stiffness: 320, 
              damping: 22, 
              duration: 0.25,
              staggerChildren: 0.05
            }}
            className="fixed right-0 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[9999] overflow-hidden ring-1 ring-indigo-100 max-h-[80vh] flex flex-col"
            style={{ right: 0 }}
          >
            {/* 用户信息 */}
            <motion.div 
              className="px-5 py-4 bg-gradient-to-r from-indigo-100 to-purple-100 border-b border-gray-100 flex items-center gap-4 shrink-0"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <motion.div 
                className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-300 to-purple-300 flex items-center justify-center border-2 border-white shadow-lg"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <motion.svg 
                  className="w-6 h-6 text-white drop-shadow" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </motion.svg>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <motion.p 
                  className="font-bold text-gray-900 text-base leading-tight"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  {user?.username}
                </motion.p>
                <motion.p 
                  className="text-xs text-indigo-500 font-medium mt-1"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  {user?.role === 'admin' ? '管理员' : '普通用户'}
                </motion.p>
              </motion.div>
            </motion.div>

            {/* 菜单项 */}
            <div className="py-2 overflow-y-auto flex-1 min-h-0 max-h-[calc(80vh-80px)]">
              {/* 主页 - 语音合成 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <Link
                  to="/"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/' ? 'text-indigo-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </motion.svg>
                  <span>语音合成</span>
                  {location.pathname === '/' && (
                    <motion.span 
                      className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* 管理员用户管理 */}
              {user?.role === 'admin' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                >
                  <Link
                    to="/admin/users"
                    className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                      location.pathname === '/admin/users' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <motion.svg 
                      className={`w-5 h-5 ${location.pathname === '/admin/users' ? 'text-blue-500' : 'text-gray-400'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </motion.svg>
                    <span>用户管理</span>
                    {location.pathname === '/admin/users' && (
                      <motion.span 
                        className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      >
                        当前
                      </motion.span>
                    )}
                  </Link>
                </motion.div>
              )}

              {/* 二次验证 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <motion.button
                  onClick={handleTOTPManager}
                  className="flex items-center gap-3 w-full px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 hover:bg-purple-50 transition-all duration-150"
                  whileHover={{ x: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${twoFactorStatus.enabled ? 'text-purple-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </motion.svg>
                  <span>二次验证</span>
                  {twoFactorStatus.enabled && (
                    <motion.span 
                      className="ml-auto w-2 h-2 bg-green-500 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </motion.button>
              </motion.div>

              {/* 服务条款 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                <Link
                  to="/policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/policy' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/policy' ? 'text-green-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </motion.svg>
                  <span>服务条款</span>
                  {location.pathname === '/policy' && (
                    <motion.span 
                      className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                  <motion.svg 
                    className="w-4 h-4 text-gray-400" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, x: 2 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </motion.svg>
                </Link>
              </motion.div>

              {/* API 文档 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                <Link
                  to="/api-docs"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/api-docs' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/api-docs' ? 'text-indigo-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </motion.svg>
                  <span>API 文档</span>
                  {location.pathname === '/api-docs' && (
                    <motion.span 
                      className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* 分割线 */}
              <motion.div 
                className="border-t border-gray-200 my-2"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.45 }}
              />

              {/* 退出登录 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <motion.button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-5 py-3 rounded-lg mx-2 my-1 text-red-600 bg-gradient-to-r from-red-50 to-white hover:from-red-100 hover:to-red-50 font-semibold shadow-sm transition-all duration-150"
                  whileHover={{ x: 5, scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.svg 
                    className="w-5 h-5 text-red-500" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </motion.svg>
                  <span>退出登录</span>
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        </>,
        document.body
      )}
    </div>
  );
};

export default MobileNav; 