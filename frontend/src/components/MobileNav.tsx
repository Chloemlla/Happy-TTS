import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types/auth';

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
      <div className="flex items-center space-x-3">
        {user?.role === 'admin' && (
          <Link 
            to="/admin/users" 
            className="px-4 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-all"
          >
            用户管理
          </Link>
        )}
        <motion.button
          onClick={onTOTPManagerOpen}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>二次验证</span>
          {totpStatus?.enabled && (
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          )}
        </motion.button>
        <motion.button
          onClick={logout}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200"
        >
          退出
        </motion.button>
      </div>
    );
  }

  // 移动端导航
  return (
    <div className="relative">
      {/* 汉堡菜单按钮 */}
      <motion.button
        onClick={toggleMenu}
        whileTap={{ scale: 0.95 }}
        className="flex items-center justify-center p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
        aria-label="打开菜单"
      >
        <svg 
          className={`w-5 h-5 transition-transform duration-200 ${isMenuOpen ? 'rotate-90' : ''}`}
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
        </svg>
      </motion.button>

      {/* 下拉菜单 */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-25 z-40"
              onClick={() => setIsMenuOpen(false)}
            />
            
            {/* 菜单内容 */}
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, duration: 0.22 }}
              className="absolute right-2 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden ring-1 ring-indigo-100 max-h-[80vh] flex flex-col"
            >
              {/* 用户信息 */}
              <div className="px-5 py-4 bg-gradient-to-r from-indigo-100 to-purple-100 border-b border-gray-100 flex items-center gap-4 shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-300 to-purple-300 flex items-center justify-center border-2 border-white shadow">
                  <svg className="w-6 h-6 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-base leading-tight">{user?.username}</p>
                  <p className="text-xs text-indigo-500 font-medium mt-1">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
                </div>
              </div>

              {/* 菜单项 */}
              <div className="py-2 overflow-y-auto flex-1 min-h-0 max-h-[calc(80vh-80px)]">
                {/* 主页 - 语音合成 */}
                <Link
                  to="/"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <svg className={`w-5 h-5 ${location.pathname === '/' ? 'text-indigo-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span>语音合成</span>
                  {location.pathname === '/' && (
                    <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">当前</span>
                  )}
                </Link>

                {/* 管理员用户管理 */}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin/users"
                    className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                      location.pathname === '/admin/users' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <svg className={`w-5 h-5 ${location.pathname === '/admin/users' ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    <span>用户管理</span>
                    {location.pathname === '/admin/users' && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">当前</span>
                    )}
                  </Link>
                )}

                {/* 二次验证 */}
                <button
                  onClick={handleTOTPManager}
                  className="flex items-center gap-3 w-full px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 hover:bg-purple-50 transition-all duration-150 active:scale-95"
                >
                  <svg className={`w-5 h-5 ${totpStatus?.enabled ? 'text-purple-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>二次验证</span>
                  {totpStatus?.enabled && (
                    <span className="ml-auto w-2 h-2 bg-green-500 rounded-full"></span>
                  )}
                </button>

                {/* 服务条款 */}
                <Link
                  to="/policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/policy' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <svg className={`w-5 h-5 ${location.pathname === '/policy' ? 'text-green-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>服务条款</span>
                  {location.pathname === '/policy' && (
                    <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">当前</span>
                  )}
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>

                {/* 分割线 */}
                <div className="border-t border-gray-200 my-2"></div>

                {/* 退出登录 */}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-5 py-3 rounded-lg mx-2 my-1 text-red-600 bg-gradient-to-r from-red-50 to-white hover:from-red-100 hover:to-red-50 font-semibold shadow-sm transition-all duration-150 active:scale-95"
                >
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>退出登录</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileNav; 