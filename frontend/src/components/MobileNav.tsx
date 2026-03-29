import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types/auth';
import ReactDOM from 'react-dom';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { useAuth, SavedAccount } from '../hooks/useAuth';
import getApiBaseUrl from '../api';
import { openDB } from 'idb';
import {
  FaVolumeUp, FaList, FaFileAlt, FaGift, FaImage, FaExclamationTriangle,
  FaShieldAlt, FaBars, FaEnvelope, FaUser, FaLock, FaSignOutAlt, FaStore,
  FaDollarSign, FaExternalLinkAlt, FaComments, FaBug, FaCalculator,
  FaBirthdayCake, FaHeadset, FaUserPlus, FaExchangeAlt, FaTimes, FaPlusCircle
} from 'react-icons/fa';

const AVATAR_DB = 'avatar-store';
const AVATAR_STORE = 'avatars';

async function getCachedAvatar(userId: string, avatarUrl: string): Promise<string | undefined> {
  const db = await openDB(AVATAR_DB, 1, { upgrade(db) { if (!db.objectStoreNames.contains(AVATAR_STORE)) db.createObjectStore(AVATAR_STORE); } });
  return await db.get(AVATAR_STORE, `${userId}:${avatarUrl}`);
}

async function setCachedAvatar(userId: string, avatarUrl: string, blobUrl: string) {
  const db = await openDB(AVATAR_DB, 1, { upgrade(db) { if (!db.objectStoreNames.contains(AVATAR_STORE)) db.createObjectStore(AVATAR_STORE); } });
  await db.put(AVATAR_STORE, blobUrl, `${userId}:${avatarUrl}`);
}

interface MobileNavProps {
  user: User | null;
  logout: () => void;
  onTOTPManagerOpen: () => void;
  totpStatus?: { enabled: boolean } | null;
}

const MobileNav: React.FC<MobileNavProps> = React.memo(({
  user,
  logout,
  onTOTPManagerOpen,
  totpStatus
}) => {
  const { savedAccounts, switchAccount, removeAccountFromList } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navRef = React.useRef<HTMLDivElement>(null);
  const location = useLocation();
  const twoFactorStatus = useTwoFactorStatus();
  const [avatarImg, setAvatarImg] = useState<string | undefined>(undefined);
  const [avatarHash, setAvatarHash] = useState<string | undefined>(undefined);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { setIsMenuOpen(false); setShowAccountSwitcher(false); }, [location.pathname]);

  // 头像加载逻辑 (保持原逻辑)
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(getApiBaseUrl() + '/api/admin/user/profile', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setAvatarHash(data.avatarHash);
      } catch (e) {}
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (user?.avatarUrl && avatarHash) setAvatarImg(user.avatarUrl);
    else setAvatarImg(undefined);
  }, [user, avatarHash]);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const handleTOTPManager = useCallback(() => {
    setIsMenuOpen(false);
    onTOTPManagerOpen();
  }, [onTOTPManagerOpen]);

  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      {/* 桌面端导航省略，仅展示核心用户菜单部分以减少篇幅 */}
      {!isMobile && (
        <div className="flex items-center gap-2" ref={navRef}>
          {/* 其他桌面端链接... */}
          <Link to="/" className={`px-4 py-2 rounded-xl transition-all ${location.pathname === '/' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            <FaVolumeUp className="inline mr-2" /> 语音合成
          </Link>
          <Link to="/support" className={`px-4 py-2 rounded-xl transition-all ${location.pathname === '/support' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            <FaHeadset className="inline mr-2" /> 支持中心
          </Link>
          {user.role === 'admin' && (
             <Link to="/admin" className="px-4 py-2 rounded-xl bg-pink-100 text-pink-700"><FaBars className="inline mr-2" />管理</Link>
          )}
        </div>
      )}

      {/* 统一的汉堡/用户菜单按钮 */}
      <motion.button
        onClick={toggleMenu}
        className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all"
        whileHover={{ scale: 1.02 }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-200">
          {avatarImg ? <img src={avatarImg} className="w-full h-full object-cover" /> : <FaUser className="text-indigo-400" />}
        </div>
        <span className="text-sm font-bold text-gray-700 hidden sm:block">{user.username}</span>
        <FaBars className="text-gray-400 ml-1" size={14} />
      </motion.button>

      {/* 菜单 Portal */}
      {isMenuOpen && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[9998]" onClick={() => setIsMenuOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed right-4 top-16 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[9999] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* 用户头 */}
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-b border-gray-100">
               <div className="flex items-center gap-3 mb-3">
                 <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden">
                   {avatarImg ? <img src={avatarImg} className="w-full h-full object-cover" /> : <FaUser className="text-indigo-300" />}
                 </div>
                 <div>
                   <p className="font-black text-gray-800 leading-none">{user.username}</p>
                   <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">{user.role}</p>
                 </div>
               </div>
               
               {/* 账号切换摘要 */}
               {savedAccounts.length > 1 && (
                 <button 
                  onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/60 hover:bg-white rounded-xl text-xs font-bold text-indigo-600 transition-all border border-indigo-100/50"
                 >
                   <span className="flex items-center gap-2"><FaExchangeAlt /> 切换账号</span>
                   <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded-md text-[9px]">{savedAccounts.length}</span>
                 </button>
               )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <AnimatePresence>
                {showAccountSwitcher ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1 pb-2 border-b border-gray-50 mb-2">
                    <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">选择账号</p>
                    {savedAccounts.map(account => (
                      <div key={account.user.id} className="flex items-center gap-2 group px-2">
                        <button 
                          onClick={() => switchAccount(account.user.id)}
                          className={`flex-1 flex items-center gap-3 p-2 rounded-xl transition-all ${account.user.id === user.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-gray-50'}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
                            {account.user.avatarUrl ? <img src={account.user.avatarUrl} className="w-full h-full object-cover" /> : <FaUser className="p-2 text-gray-400" />}
                          </div>
                          <div className="text-left overflow-hidden">
                            <p className={`text-xs font-bold truncate ${account.user.id === user.id ? 'text-indigo-600' : 'text-gray-700'}`}>{account.user.username}</p>
                            <p className="text-[9px] text-gray-400 truncate">{account.user.email}</p>
                          </div>
                        </button>
                        {account.user.id !== user.id && (
                          <button onClick={() => removeAccountFromList(account.user.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><FaTimes size={10} /></button>
                        )}
                      </div>
                    ))}
                    <Link to="/login" className="flex items-center gap-3 p-3 mx-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                      <FaPlusCircle className="text-lg" /> 使用新账号登录
                    </Link>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* 标准导航菜单 */}
              <div className="space-y-0.5">
                <Link to="/" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-sm font-medium text-gray-700 transition-all"><FaVolumeUp className="text-indigo-500" /> 语音合成</Link>
                <Link to="/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-sm font-medium text-gray-700 transition-all"><FaUser className="text-orange-500" /> 个人中心</Link>
                <button onClick={handleTOTPManager} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-sm font-medium text-gray-700 transition-all"><FaLock className="text-purple-500" /> 安全设置</button>
                <Link to="/support" className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-sm font-medium text-gray-700 transition-all"><FaHeadset className="text-cyan-500" /> 支持中心</Link>
                {user.role === 'admin' && (
                  <Link to="/admin" className="flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 text-sm font-medium text-gray-700 transition-all"><FaBars className="text-pink-500" /> 管理面板</Link>
                )}
              </div>
            </div>

            <div className="p-2 bg-gray-50/50 border-t border-gray-100">
               <button 
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white border border-red-100 text-red-600 text-sm font-bold hover:bg-red-50 transition-all"
               >
                 <FaSignOutAlt /> 退出当前账号
               </button>
            </div>
          </motion.div>
        </>,
        document.body
      )}
    </div>
  );
});

export default MobileNav;
