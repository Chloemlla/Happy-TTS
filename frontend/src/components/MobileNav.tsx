import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import ReactDOM from 'react-dom';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import getApiBaseUrl from '../api';
import { openDB } from 'idb';
import {
  FaVolumeUp,
  FaList,
  FaFileAlt,
  FaGift,
  FaImage,
  FaExclamationTriangle,
  FaShieldAlt,
  FaBars,
  FaEnvelope,
  FaUser,
  FaLock,
  FaSignOutAlt,
  FaStore,
  FaDollarSign,
  FaExternalLinkAlt,
  FaCheckCircle,
  FaClipboard,
  FaCoins,
  FaComments
} from 'react-icons/fa';

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

  // 优化的移动设备和溢出检测
  useEffect(() => {
    let resizeTimer: NodeJS.Timeout;

    const checkMobileOrOverflow = () => {
      // 防抖处理，避免频繁计算
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const isMobileScreen = window.innerWidth < 768;
        let overflow = false;

        if (navRef.current && !isMobileScreen) {
          const nav = navRef.current;
          const rect = nav.getBoundingClientRect();

          // 优化的溢出检测策略
          const checks = {
            // 1. 滚动宽度检测（最可靠）
            scrollOverflow: nav.scrollWidth > nav.clientWidth + 1,
            // 2. 高度检测（检测换行）
            heightOverflow: rect.height > 50, // 调整为更合理的阈值
            // 3. 视口宽度检测（预防性）
            viewportTight: window.innerWidth < 1200 && nav.children.length > 5,
            // 4. 内容密度检测
            contentDensity: nav.scrollWidth / window.innerWidth > 0.85
          };

          // 任一条件满足即认为需要切换到移动模式
          overflow = Object.values(checks).some(Boolean);

          // 调试信息（开发环境）
          if (process.env.NODE_ENV === 'development') {
            console.debug('Navigation overflow checks:', {
              ...checks,
              scrollWidth: nav.scrollWidth,
              clientWidth: nav.clientWidth,
              height: rect.height,
              childrenCount: nav.children.length,
              finalOverflow: overflow
            });
          }
        }

        setIsOverflow(overflow);
        setIsMobile(isMobileScreen || overflow);
      }, 100); // 100ms 防抖
    };

    checkMobileOrOverflow();
    window.addEventListener('resize', checkMobileOrOverflow);

    return () => {
      window.removeEventListener('resize', checkMobileOrOverflow);
      clearTimeout(resizeTimer);
    };
  }, []);

  // 关闭菜单当路由改变时
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // 优化的头像存在检测
  useEffect(() => {
    let isCancelled = false;

    const checkAvatarExistence = async () => {
      if (!user) {
        setHasAvatar(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setHasAvatar(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

        const response = await fetch(getApiBaseUrl() + '/api/admin/user/avatar/exist', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!isCancelled) {
          setHasAvatar(!!data.hasAvatar);
        }
      } catch (error) {
        if (!isCancelled && error instanceof Error && error.name !== 'AbortError') {
          console.warn('Avatar existence check failed:', error);
          setHasAvatar(false);
        } else if (!isCancelled) {
          console.warn('Avatar existence check failed:', error);
          setHasAvatar(false);
        }
      }
    };

    checkAvatarExistence();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  // 优化的用户资料和头像哈希获取
  useEffect(() => {
    let isCancelled = false;

    const fetchUserProfile = async () => {
      if (!user) {
        setAvatarHash(undefined);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setAvatarHash(undefined);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时

        const response = await fetch(getApiBaseUrl() + '/api/admin/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!isCancelled) {
          setAvatarHash(data.avatarHash);
        }
      } catch (error) {
        if (!isCancelled && error instanceof Error && error.name !== 'AbortError') {
          console.warn('User profile fetch failed:', error);
          setAvatarHash(undefined);
        } else if (!isCancelled) {
          console.warn('User profile fetch failed:', error);
          setAvatarHash(undefined);
        }
      }
    };

    fetchUserProfile();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  // 优化的头像加载逻辑
  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | undefined;
    let loadTimeout: NodeJS.Timeout;

    const loadAvatar = async () => {
      // 清理之前的超时
      clearTimeout(loadTimeout);

      // 验证必要参数
      const isValidParams = hasAvatar &&
        typeof user?.avatarUrl === 'string' &&
        typeof user?.id === 'string' &&
        typeof avatarHash === 'string';

      if (!isValidParams) {
        // 清理资源
        if (currentObjectUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = undefined;
        }
        setAvatarImg(undefined);
        lastAvatarUrl.current = undefined;
        return;
      }

      try {
        // 检查是否已经是相同的头像
        if (lastAvatarUrl.current === avatarHash) {
          return;
        }

        // 1. 优先使用远程 HTTP/HTTPS 链接
        if (/^https?:\/\//.test(user.avatarUrl!)) {
          setAvatarImg(user.avatarUrl!);
          lastAvatarUrl.current = avatarHash;

          // 释放旧 blob
          if (currentObjectUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = undefined;
          }
          return;
        }

        // 2. 检查 IndexedDB 缓存
        const cached = await getCachedAvatar(user.id, avatarHash);
        if (cached?.startsWith('blob:') && !cancelled) {
          // 验证 blob URL 是否仍然有效
          try {
            const response = await fetch(cached, { method: 'HEAD' });
            if (response.ok) {
              setAvatarImg(cached);
              lastAvatarUrl.current = avatarHash;
              return;
            }
          } catch {
            // 缓存的 blob 无效，继续下载
          }
        }

        // 3. 下载头像并创建 blob URL
        loadTimeout = setTimeout(() => {
          if (!cancelled) {
            console.warn('Avatar loading timeout');
            setAvatarImg(undefined);
          }
        }, 10000); // 10秒超时

        const response = await fetch(user.avatarUrl!);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();

        if (cancelled) return;

        clearTimeout(loadTimeout);

        // 创建新的 blob URL
        const newUrl = URL.createObjectURL(blob);

        // 释放旧的 blob URL
        if (currentObjectUrl?.startsWith('blob:') && currentObjectUrl !== newUrl) {
          URL.revokeObjectURL(currentObjectUrl);
        }

        currentObjectUrl = newUrl;
        lastObjectUrl.current = newUrl;
        setAvatarImg(newUrl);
        lastAvatarUrl.current = avatarHash;

        // 异步缓存到 IndexedDB（不阻塞 UI）
        setCachedAvatar(user.id, avatarHash, newUrl).catch(error => {
          console.warn('Failed to cache avatar:', error);
        });

      } catch (error) {
        if (!cancelled) {
          console.warn('Avatar loading failed:', error);
          setAvatarImg(undefined);
        }
      } finally {
        clearTimeout(loadTimeout);
      }
    };

    loadAvatar();

    return () => {
      cancelled = true;
      clearTimeout(loadTimeout);
      if (currentObjectUrl?.startsWith('blob:')) {
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
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/'
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
              : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-indigo-600 border border-gray-200/50'
              }`}
          >
            <motion.div
              className="w-4 h-4"
              animate={location.pathname === '/' ? { rotate: [0, 10, -10, 0] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <FaVolumeUp className="w-4 h-4" />
            </motion.div>
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
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/case-converter'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-green-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaList className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">大小写转换</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/api-docs"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/api-docs'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-blue-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaFileAlt className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">API 文档</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/markdown-export"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/markdown-export'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-purple-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaFileAlt className="w-4 h-4" />
              </motion.div>
              <span className="text-xs sm:text-sm">Markdown导出</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/lottery"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/lottery'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-green-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaGift className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">抽奖系统</span>
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/image-upload"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/image-upload'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-blue-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaImage className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">图片上传</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/fbi-wanted"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/fbi-wanted'
                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-red-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaExclamationTriangle className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">FBI通缉犯</span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/anti-counterfeit"
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/anti-counterfeit'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-red-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaShieldAlt className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">安踏防伪</span>
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
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/admin'
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-pink-600 border border-gray-200/50'
                  }`}
              >
                <motion.div
                  className="w-4 h-4"
                  whileHover={{ rotate: 5 }}
                >
                  <FaBars className="w-4 h-4" />
                </motion.div>
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
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/email-sender'
                  ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg'
                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-purple-600 border border-gray-200/50'
                  }`}
              >
                <motion.div
                  className="w-4 h-4"
                  whileHover={{ rotate: 5 }}
                >
                  <FaEnvelope className="w-4 h-4" />
                </motion.div>
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
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-lg ${location.pathname === '/profile'
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg'
                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-yellow-600 border border-gray-200/50'
                }`}
            >
              <motion.div
                className="w-4 h-4"
                whileHover={{ rotate: 5 }}
              >
                <FaUser className="w-4 h-4" />
              </motion.div>
              <span className="hidden sm:inline">个人主页</span>
            </Link>
          </motion.div>

          <motion.button
            onClick={onTOTPManagerOpen}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl font-medium bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white hover:text-indigo-600 border border-gray-200/50 transition-all duration-300 shadow-sm hover:shadow-lg"
          >
            <motion.div
              className="w-4 h-4"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <FaLock className="w-4 h-4" />
            </motion.div>
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
          <motion.div
            className="w-4 h-4"
            whileHover={{ rotate: 5 }}
          >
            <FaSignOutAlt className="w-4 h-4" />
          </motion.div>
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
        <motion.div
          className="w-5 h-5"
          animate={{ rotate: isMenuOpen ? 90 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <FaBars className="w-5 h-5" />
        </motion.div>
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
                    <motion.div
                      className="w-6 h-6 text-white drop-shadow"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      <FaUser className="w-6 h-6" />
                    </motion.div>
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
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/' ? 'text-indigo-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaVolumeUp className="w-5 h-5" />
                  </motion.div>
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
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/admin' ? 'bg-pink-50 text-pink-700 font-semibold shadow-sm' : 'hover:bg-pink-50'
                        }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.div
                        className={`w-5 h-5 ${location.pathname === '/admin' ? 'text-pink-500' : 'text-gray-400'}`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <FaBars className="w-5 h-5" />
                      </motion.div>
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
                  {/* 资源商店管理 */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.27 }}
                  >
                    <Link
                      to="/admin/store"
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname.startsWith('/admin/store') ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                        }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.div
                        className={`w-5 h-5 ${location.pathname.startsWith('/admin/store') ? 'text-blue-500' : 'text-gray-400'}`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <FaStore className="w-5 h-5" />
                      </motion.div>
                      <span>资源商店管理</span>
                      {location.pathname.startsWith('/admin/store') && (
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
                  {/* 邮件发送 */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <Link
                      to="/email-sender"
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/email-sender' ? 'bg-purple-50 text-purple-700 font-semibold shadow-sm' : 'hover:bg-purple-50'
                        }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.div
                        className={`w-5 h-5 ${location.pathname === '/email-sender' ? 'text-purple-500' : 'text-gray-400'}`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <FaEnvelope className="w-5 h-5" />
                      </motion.div>
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
                  {/* GitHub账单管理 */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.32 }}
                  >
                    <Link
                      to="/github-billing"
                      className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/github-billing' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                        }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <motion.div
                        className={`w-5 h-5 ${location.pathname === '/github-billing' ? 'text-blue-500' : 'text-gray-400'}`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <FaDollarSign className="w-5 h-5" />
                      </motion.div>
                      <span>GitHub账单</span>
                      {location.pathname === '/github-billing' && (
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
                  <motion.div
                    className={`w-5 h-5 ${twoFactorStatus.enabled ? 'text-purple-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaLock className="w-5 h-5" />
                  </motion.div>
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
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/policy' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/policy' ? 'text-green-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaFileAlt className="w-5 h-5" />
                  </motion.div>
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
                  <motion.div
                    className="w-4 h-4 text-gray-400"
                    whileHover={{ scale: 1.1, x: 2 }}
                  >
                    <FaExternalLinkAlt className="w-4 h-4" />
                  </motion.div>
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
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/case-converter' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/case-converter' ? 'text-green-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaList className="w-5 h-5" />
                  </motion.div>
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

              {/* 资源商店 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.42 }}
              >
                <Link
                  to="/store"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname.startsWith('/store') ? 'bg-orange-50 text-orange-700 font-semibold shadow-sm' : 'hover:bg-orange-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname.startsWith('/store') ? 'text-orange-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaStore className="w-5 h-5" />
                  </motion.div>
                  <span>资源商店</span>
                  {location.pathname.startsWith('/store') && (
                    <motion.span
                      className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full"
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
                transition={{ duration: 0.4, delay: 0.47 }}
              >
                <Link
                  to="/api-docs"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/api-docs' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/api-docs' ? 'text-indigo-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaFileAlt className="w-5 h-5" />
                  </motion.div>
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
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <Link
                  to="/lottery"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/lottery' ? 'bg-green-50 text-green-700 font-semibold shadow-sm' : 'hover:bg-green-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className="w-4 h-4"
                    whileHover={{ rotate: 5 }}
                  >
                    <FaGift className="w-4 h-4" />
                  </motion.div>
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

              {/* 安踏防伪查询 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.52 }}
              >
                <Link
                  to="/anti-counterfeit"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/anti-counterfeit' ? 'bg-red-50 text-red-700 font-semibold shadow-sm' : 'hover:bg-red-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/anti-counterfeit' ? 'text-red-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaShieldAlt className="w-5 h-5" />
                  </motion.div>
                  <span>安踏防伪</span>
                  {location.pathname === '/anti-counterfeit' && (
                    <motion.span
                      className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* 老虎冒险 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.54 }}
              >
                <Link
                  to="/tiger-adventure"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/tiger-adventure' ? 'bg-orange-50 text-orange-700 font-semibold shadow-sm' : 'hover:bg-orange-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/tiger-adventure' ? 'text-orange-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaClipboard className="w-5 h-5" />
                  </motion.div>
                  <span>老虎冒险</span>
                  {location.pathname === '/tiger-adventure' && (
                    <motion.span
                      className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* 抛硬币工具 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.56 }}
              >
                <Link
                  to="/coin-flip"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/coin-flip' ? 'bg-yellow-50 text-yellow-700 font-semibold shadow-sm' : 'hover:bg-yellow-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/coin-flip' ? 'text-yellow-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaCoins className="w-5 h-5" />
                  </motion.div>
                  <span>抛硬币</span>
                  {location.pathname === '/coin-flip' && (
                    <motion.span
                      className="ml-auto text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full"
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
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/image-upload' ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' : 'hover:bg-blue-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/image-upload' ? 'text-blue-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaImage className="w-5 h-5" />
                  </motion.div>
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

              {/* FBI通缉犯 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.49 }}
              >
                <Link
                  to="/fbi-wanted"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/fbi-wanted' ? 'bg-red-50 text-red-700 font-semibold shadow-sm' : 'hover:bg-red-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/fbi-wanted' ? 'text-red-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaExclamationTriangle className="w-5 h-5" />
                  </motion.div>
                  <span>FBI通缉犯</span>
                  {location.pathname === '/fbi-wanted' && (
                    <motion.span
                      className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      当前
                    </motion.span>
                  )}
                </Link>
              </motion.div>

              {/* Markdown导出 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.53 }}
              >
                <Link
                  to="/markdown-export"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/markdown-export' ? 'bg-purple-50 text-purple-700 font-semibold shadow-sm' : 'hover:bg-purple-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/markdown-export' ? 'text-purple-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaFileAlt className="w-5 h-5" />
                  </motion.div>
                  <span>Markdown导出</span>
                  {location.pathname === '/markdown-export' && (
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

              {/* LibreChat */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.54 }}
              >
                <Link
                  to="/librechat"
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg mx-2 my-1 text-gray-700 transition-all duration-150 ${location.pathname === '/librechat' ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'hover:bg-indigo-50'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.div
                    className={`w-5 h-5 ${location.pathname === '/librechat' ? 'text-indigo-500' : 'text-gray-400'}`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaComments className="w-5 h-5" />
                  </motion.div>
                  <span>LibreChat</span>
                  {location.pathname === '/librechat' && (
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
                transition={{ duration: 0.3, delay: 0.53 }}
              />

              {/* 退出登录 */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.59 }}
              >
                <motion.button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-5 py-3 rounded-lg mx-2 my-1 text-red-600 bg-gradient-to-r from-red-50 to-white hover:from-red-100 hover:to-red-50 font-semibold shadow-sm transition-all duration-150"
                  whileHover={{ x: 5, scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className="w-5 h-5 text-red-500"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <FaSignOutAlt className="w-5 h-5" />
                  </motion.div>
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