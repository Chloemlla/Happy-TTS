import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import ReactDOM from 'react-dom';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import getApiBaseUrl from '../api';
import { openDB } from 'idb';

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
  const navRef = React.useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const location = useLocation();
  const twoFactorStatus = useTwoFactorStatus();
  const [hasAvatar, setHasAvatar] = useState<boolean>(false);
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const lastAvatarUrl = useRef<string | undefined>(undefined);
  const lastObjectUrl = useRef<string | undefined>(undefined);
  // 1. 在 useEffect 里获取 profile 时，保存 avatarHash 到 state
  const [avatarHash, setAvatarHash] = useState<string | undefined>(undefined);

  const AVATAR_DB = 'avatar-store';
  const AVATAR_STORE = 'avatars';

  async function getCachedAvatar(userId: string, avatarUrl: string): Promise<string | undefined> {
    const db = await openDB(AVATAR_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(AVATAR_STORE)) {
          db.createObjectStore(AVATAR_STORE);
        }
      },
    });
    const key = `${userId}:${avatarUrl}`;
    return await db.get(AVATAR_STORE, key);
  }

  async function setCachedAvatar(userId: string, avatarUrl: string, blobUrl: string) {
    const db = await openDB(AVATAR_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(AVATAR_STORE)) {
          db.createObjectStore(AVATAR_STORE);
        }
      },
    });
    const key = `${userId}:${avatarUrl}`;
    await db.put(AVATAR_STORE, blobUrl, key);
  }

  // 检测是否为移动设备或溢出
  useEffect(() => {
    const checkMobileOrOverflow = () => {
      const isMobileScreen = window.innerWidth < 768;
      let overflow = false;
      if (navRef.current && !isMobileScreen) {
        const nav = navRef.current;
        // 多策略检测溢出/变形
        const sw = nav.scrollWidth;
        const cw = nav.clientWidth;
        const ow = nav.offsetWidth;
        const rect = nav.getBoundingClientRect();
        // 1. scrollWidth > clientWidth
        if (sw > cw + 2) overflow = true;
        // 2. offsetWidth < scrollWidth
        if (ow < sw - 2) overflow = true;
        // 3. 实际高度大于单行高度（按钮换行/变形）
        if (rect.height > 60) overflow = true; // 60px 视为单行最大高度
        // 4. 按钮数量过多
        if (nav.children && nav.children.length > 6) overflow = true;
      }
      setIsOverflow(overflow);
      setIsMobile(isMobileScreen || overflow);
    };
    checkMobileOrOverflow();
    window.addEventListener('resize', checkMobileOrOverflow);
    return () => window.removeEventListener('resize', checkMobileOrOverflow);
  }, []);

  // 关闭菜单当路由改变时
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      fetch(getApiBaseUrl() + '/api/admin/user/avatar/exist', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
        .then(res => res.json())
        .then(data => setHasAvatar(!!data.hasAvatar))
        .catch(() => setHasAvatar(false));
    }
  }, [user]);

  // 1. 在 useEffect 里获取 profile 时，保存 avatarHash 到 state
  useEffect(() => {
    if (user) {
      fetch(getApiBaseUrl() + '/api/admin/user/profile', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
        .then(res => res.json())
        .then(data => setAvatarHash(data.avatarHash))
        .catch(() => setAvatarHash(undefined));
    }
  }, [user]);

  // 2. 缓存key用 user.id:avatarHash
  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | undefined;
    async function loadAvatar() {
      if (hasAvatar && typeof user?.avatarUrl === 'string' && typeof user?.id === 'string' && typeof avatarHash === 'string') {
        // 优先使用远程 http/https 链接
        if (/^https?:\/\//.test(user.avatarUrl)) {
          setAvatarImg(user.avatarUrl);
          lastAvatarUrl.current = avatarHash;
          // 释放旧 blob
          if (currentObjectUrl && currentObjectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = undefined;
          }
          return;
        }
        // 查IndexedDB缓存
        const cached = await getCachedAvatar(user.id as string, avatarHash as string);
        if (cached && cached.startsWith('blob:')) {
          setAvatarImg(cached);
          lastAvatarUrl.current = avatarHash;
          return;
        }
        // 极端兜底：下载并生成 blob（不再写入缓存）
        fetch(user.avatarUrl)
          .then(res => res.blob())
          .then(async blob => {
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            setAvatarImg(url);
            lastAvatarUrl.current = avatarHash;
            if (currentObjectUrl && currentObjectUrl.startsWith('blob:') && currentObjectUrl !== url) {
              URL.revokeObjectURL(currentObjectUrl);
            }
            currentObjectUrl = url;
            lastObjectUrl.current = url;
          })
          .catch(() => setAvatarImg(undefined));
      } else {
        // 释放旧 blob
        if (currentObjectUrl && currentObjectUrl.startsWith('blob:')) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = undefined;
        }
        setAvatarImg(undefined);
        lastAvatarUrl.current = undefined;
      }
    }
    loadAvatar();
    return () => {
      cancelled = true;
      if (currentObjectUrl && currentObjectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = undefined;
      }
    };
  }, [hasAvatar, user?.avatarUrl, user?.id, avatarHash]);

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

  // 如果用户未登录，不显示导航
  if (!user) {
    return null;
  }

  // 桌面端导航
  if (!isMobile) {
    return (
      <motion.div 
        className="flex items-center space-x-2"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        ref={navRef}
      >
        {/* 主页按钮 */}
        <motion.div
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="relative"
        >
          <Link 
            to="/" 
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
              location.pathname === '/' 
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg' 
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-indigo-600 border border-gray-200/50'
            }`}
          >
            <motion.svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              animate={location.pathname === '/' ? { rotate: [0, 10, -10, 0] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </motion.svg>
            <span className="hidden sm:inline">语音合成</span>
          </Link>
        </motion.div>

        {/* 工具按钮组 */}
        <div className="flex items-center space-x-1">
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              to="/case-converter" 
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                location.pathname === '/case-converter'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-green-600 border border-gray-200/50'
              }`}
            >
              <motion.svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                whileHover={{ rotate: 5 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </motion.svg>
              <span className="hidden sm:inline">大小写转换</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              to="/api-docs" 
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                location.pathname === '/api-docs'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-blue-600 border border-gray-200/50'
              }`}
            >
              <motion.svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                whileHover={{ rotate: 5 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </motion.svg>
              <span className="hidden sm:inline">API 文档</span>
            </Link>
          </motion.div>
          <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Link 
            to="/lottery" 
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
              location.pathname === '/lottery'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-green-600 border border-gray-200/50'
            }`}
          >
            <motion.svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              whileHover={{ rotate: 5 }}
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path d="M8 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
            <span className="hidden sm:inline">抽奖系统</span>
          </Link>
        </motion.div>
        <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              to="/image-upload" 
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                location.pathname === '/image-upload'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-blue-600 border border-gray-200/50'
              }`}
            >
              <motion.svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                whileHover={{ rotate: 5 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v-4a4 4 0 014-4h8a4 4 0 014 4v4M4 16l4-4a4 4 0 015.656 0L20 16" />
              </motion.svg>
              <span className="hidden sm:inline">图片上传</span>
            </Link>
          </motion.div>
        </div>

        {/* 管理员功能组 */}
        {user?.role === 'admin' && (
          <div className="flex items-center space-x-1">
            {/* 管理后台 */}
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link 
                to="/admin" 
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                  location.pathname === '/admin'
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg'
                    : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-pink-600 border border-gray-200/50'
                }`}
              >
                <motion.svg 
                  className="w-4 h-4" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  whileHover={{ rotate: 5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </motion.svg>
                <span className="hidden sm:inline">管理后台</span>
              </Link>
            </motion.div>
            {/* 邮件发送 */}
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link 
                to="/email-sender" 
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                  location.pathname === '/email-sender'
                    ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg'
                    : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-purple-600 border border-gray-200/50'
                }`}
              >
                <motion.svg 
                  className="w-4 h-4" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  whileHover={{ rotate: 5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </motion.svg>
                <span className="hidden sm:inline">邮件发送</span>
              </Link>
            </motion.div>
          </div>
        )}

        {/* 用户功能组 */}
        <div className="flex items-center space-x-1">
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              to="/profile" 
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${
                location.pathname === '/profile'
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-yellow-600 border border-gray-200/50'
              }`}
            >
              <motion.svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                whileHover={{ rotate: 5 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </motion.svg>
              <span className="hidden sm:inline">个人主页</span>
            </Link>
          </motion.div>

          <motion.button
            onClick={onTOTPManagerOpen}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl font-medium bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-indigo-600 border border-gray-200/50 transition-all duration-300 shadow-sm hover:shadow-lg"
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
            <span className="hidden sm:inline">二次验证</span>
            {twoFactorStatus.enabled && (
              <motion.span 
                className="w-2 h-2 bg-green-500 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>

        {/* 退出按钮 */}
        <motion.button
          onClick={logout}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center space-x-2 px-3 py-2 rounded-xl font-medium bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600 transition-all duration-300 shadow-sm hover:shadow-lg"
        >
          <motion.svg 
            className="w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            whileHover={{ rotate: 5 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </motion.svg>
          <span className="hidden sm:inline">退出</span>
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
              <Link to="/profile" className="flex items-center gap-4">
                <motion.div 
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-300 to-purple-300 flex items-center justify-center border-2 border-white shadow-lg"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  {hasAvatar && avatarImg ? (
                    <img
                      src={avatarImg}
                      alt="头像"
                      className="w-full h-full object-cover rounded-full"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
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
                  )}
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
              </Link>
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

              {/* 管理员功能组 */}
              {user?.role === 'admin' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                  >
                    <Link
                      to="/admin"
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                        location.pathname === '/admin' ? 'bg-pink-50 text-pink-700 font-semibold shadow-sm' : 'hover:bg-pink-50'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.svg 
                        className={`w-5 h-5 ${location.pathname === '/admin' ? 'text-pink-500' : 'text-gray-400'}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                      </motion.svg>
                      <span>管理后台</span>
                      {location.pathname === '/admin' && (
                        <motion.span 
                          className="ml-auto text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        >
                          当前
                        </motion.span>
                      )}
                    </Link>
                  </motion.div>
                  {/* 邮件发送 */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <Link
                      to="/email-sender"
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                        location.pathname === '/email-sender' ? 'bg-purple-50 text-purple-700 font-semibold shadow-sm' : 'hover:bg-purple-50'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.svg 
                        className={`w-5 h-5 ${location.pathname === '/email-sender' ? 'text-purple-500' : 'text-gray-400'}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </motion.svg>
                      <span>邮件发送</span>
                      {location.pathname === '/email-sender' && (
                        <motion.span 
                          className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        >
                          当前
                        </motion.span>
                      )}
                    </Link>
                  </motion.div>
                </>
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

              {/* 字母转换 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                <Link
                  to="/case-converter"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/case-converter' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/case-converter' ? 'text-green-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </motion.svg>
                  <span>字母转换</span>
                  {location.pathname === '/case-converter' && (
                    <motion.span 
                      className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* API 文档 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
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
              {/* 抽奖系统 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.48 }}
              >
                <Link
                  to="/lottery"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/lottery' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/lottery' ? 'text-green-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <path d="M8 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                  <span>抽奖系统</span>
                  {location.pathname === '/lottery' && (
                    <motion.span 
                      className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.48 }}
              >
                <Link
                  to="/image-upload"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${
                    location.pathname === '/image-upload' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.svg 
                    className={`w-5 h-5 ${location.pathname === '/image-upload' ? 'text-blue-500' : 'text-gray-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v-4a4 4 0 014-4h8a4 4 0 014 4v4M4 16l4-4a4 4 0 015.656 0L20 16" />
                  </motion.svg>
                  <span>图片上传</span>
                  {location.pathname === '/image-upload' && (
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

              {/* 分割线 */}
              <motion.div 
                className="border-t border-gray-200 my-2"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3, delay: 0.5 }}
              />

              {/* 退出登录 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.55 }}
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