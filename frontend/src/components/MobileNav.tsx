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
  FaBirthdayCake, FaHeadset, FaUserPlus, FaExchangeAlt, FaTimes, FaPlusCircle,
  FaShareAlt, FaLink, FaFont, FaChartBar, FaGamepad, FaSearch, FaBook, FaGavel,
  FaFlask, FaPaperPlane, FaDatabase, FaUserShield, FaRobot, FaLockOpen
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
  const { savedAccounts, switchAccount, removeAccountFromList, logoutAll } = useAuth();
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

  // 头像加载逻辑
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

  const MENU_GROUPS = useMemo(() => [
    {
      title: '核心功能',
      items: [
        { to: '/', label: '语音合成', icon: FaVolumeUp, color: 'text-indigo-500' },
        { to: '/store', label: '资源商店', icon: FaStore, color: 'text-emerald-500' },
        { to: '/profile', label: '个人中心', icon: FaUser, color: 'text-orange-500' },
        { to: '/support', label: '支持中心', icon: FaHeadset, color: 'text-cyan-500' },
      ]
    },
    {
      title: '实用工具',
      items: [
        { to: '/logshare', label: '日志分享', icon: FaShareAlt, color: 'text-blue-500' },
        { to: '/image-upload', label: '图片上传', icon: FaImage, color: 'text-purple-500' },
        { to: '/public-shortlink', label: '公共短链', icon: FaLink, color: 'text-sky-500' },
        { to: '/case-converter', label: '大小写转换', icon: FaFont, color: 'text-slate-500' },
        { to: '/word-count', label: '字数统计', icon: FaChartBar, color: 'text-amber-500' },
        { to: '/age-calculator', label: '年龄计算', icon: FaBirthdayCake, color: 'text-pink-500' },
        { to: '/markdown-export', label: 'MD 导出', icon: FaFileAlt, color: 'text-gray-600' },
        { to: '/github-billing', label: 'GitHub 账单', icon: FaDollarSign, color: 'text-green-600' },
        { to: '/outemail', label: '外部邮件', icon: FaEnvelope, color: 'text-blue-400' },
      ]
    },
    {
      title: '娱乐与探索',
      items: [
        { to: '/lottery', label: '抽奖系统', icon: FaGift, color: 'text-red-500' },
        { to: '/tiger-adventure', label: '老虎冒险', icon: FaGamepad, color: 'text-orange-600' },
        { to: '/coin-flip', label: '硬币翻转', icon: FaExchangeAlt, color: 'text-yellow-600' },
        { to: '/librechat', label: 'LibreChat', icon: FaComments, color: 'text-teal-500' },
      ]
    },
    {
      title: '信息与查询',
      items: [
        { to: '/fbi-wanted', label: 'FBI 通缉', icon: FaSearch, color: 'text-blue-800' },
        { to: '/anti-counterfeit', label: '安踏防伪', icon: FaShieldAlt, color: 'text-red-700' },
        { to: '/campus-emergency', label: '校园紧急', icon: FaExclamationTriangle, color: 'text-amber-600' },
        { to: '/modlist', label: '模组列表', icon: FaList, color: 'text-indigo-400' },
        { to: '/api-docs', label: 'API 文档', icon: FaBook, color: 'text-blue-400' },
        { to: '/policy', label: '服务条款', icon: FaGavel, color: 'text-slate-400' },
      ]
    },
    {
      title: '测试与演示',
      items: [
        { to: '/demo', label: '演示中心', icon: FaFlask, color: 'text-purple-400' },
        { to: '/smart-human-check', label: '人机验证', icon: FaBug, color: 'text-rose-400' },
        { to: '/notification-test', label: '通知测试', icon: FaEnvelope, color: 'text-blue-300' },
        { to: '/hcaptcha-verify', label: 'hCaptcha', icon: FaLockOpen, color: 'text-gray-400' },
      ]
    }
  ], []);

  const ADMIN_GROUPS = useMemo(() => [
    {
      title: '管理功能',
      items: [
        { to: '/admin', label: '管理后台', icon: FaBars, color: 'text-pink-500' },
        { to: '/admin/users', label: '用户管理', icon: FaUserShield, color: 'text-indigo-600' },
        { to: '/nexai-security', label: '安全监控', icon: FaShieldAlt, color: 'text-red-600' },
        { to: '/admin/lottery', label: '抽奖管理', icon: FaGift, color: 'text-rose-500' },
        { to: '/email-sender', label: '邮件发送', icon: FaPaperPlane, color: 'text-blue-500' },
        { to: '/admin/store', label: '商店管理', icon: FaStore, color: 'text-emerald-600' },
        { to: '/admin/store/resources', label: '资源管理', icon: FaDatabase, color: 'text-cyan-600' },
        { to: '/admin/store/cdks', label: 'CDK 管理', icon: FaList, color: 'text-sky-600' },
        { to: '/tamper-detection-demo', label: '篡改检测', icon: FaBug, color: 'text-orange-500' },
      ]
    }
  ], []);

  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      {/* 桌面端部分导航 */}
      {!isMobile && (
        <div className="flex items-center gap-2" ref={navRef}>
          <Link to="/" className={`px-4 py-2 rounded-xl transition-all ${location.pathname === '/' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white/50 text-gray-700 hover:bg-white hover:shadow-sm'}`}>
            <FaVolumeUp className="inline mr-2" /> 语音合成
          </Link>
          <Link to="/store" className={`px-4 py-2 rounded-xl transition-all ${location.pathname === '/store' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white/50 text-gray-700 hover:bg-white hover:shadow-sm'}`}>
            <FaStore className="inline mr-2" /> 资源商店
          </Link>
          <Link to="/support" className={`px-4 py-2 rounded-xl transition-all ${location.pathname === '/support' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white/50 text-gray-700 hover:bg-white hover:shadow-sm'}`}>
            <FaHeadset className="inline mr-2" /> 支持中心
          </Link>
          {user.role === 'admin' && (
             <Link to="/admin" className="px-4 py-2 rounded-xl bg-pink-100 text-pink-700 hover:bg-pink-200 transition-all shadow-sm">
               <FaBars className="inline mr-2" />管理
             </Link>
          )}
        </div>
      )}

      {/* 统一的汉堡/用户菜单按钮 */}
      <motion.button
        onClick={toggleMenu}
        className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all z-20"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-200">
          {avatarImg ? <img src={avatarImg} alt="" className="w-full h-full object-cover" /> : <FaUser className="text-indigo-400" />}
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
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed right-4 top-16 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[9999] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* 用户头 */}
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-b border-gray-100 flex-shrink-0">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden">
                     {avatarImg ? <img src={avatarImg} alt="" className="w-full h-full object-cover" /> : <FaUser className="text-indigo-300" />}
                   </div>
                   <div>
                     <p className="font-black text-gray-800 leading-none">{user.username}</p>
                     <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">{user.role}</p>
                   </div>
                 </div>
                 <button onClick={() => setIsMenuOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                   <FaTimes size={18} />
                 </button>
               </div>
               
               {/* 账号管理/切换引导 */}
               <div className="mt-1">
                 <button 
                  onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    showAccountSwitcher 
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' 
                    : 'bg-white/60 text-indigo-600 border-indigo-100/50 hover:bg-white hover:shadow-sm'
                  }`}
                 >
                   <span className="flex items-center gap-2">
                     <FaUserPlus className={showAccountSwitcher ? 'text-white' : 'text-indigo-500'} /> 
                     {savedAccounts.length > 1 ? '切换与管理账号' : '多账号登录管理'}
                     <span className="bg-amber-100 text-amber-700 text-[8px] px-1 rounded-sm ml-1 border border-amber-200 font-normal">多用户操作</span>
                   </span>
                   <span className={`${showAccountSwitcher ? 'bg-white/20' : 'bg-indigo-600 text-white'} px-1.5 py-0.5 rounded-md text-[9px]`}>
                     {savedAccounts.length}
                   </span>
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <AnimatePresence>
                {showAccountSwitcher ? (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                    animate={{ opacity: 1, height: 'auto', marginBottom: 16 }} 
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }} 
                    className="space-y-1 pb-3 border-b border-gray-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">已保存的账号</p>
                    </div>
                    {savedAccounts.map(account => (
                      <div key={account.user.id} className="flex items-center gap-2 group px-1">
                        <button 
                          onClick={() => switchAccount(account.user.id)}
                          className={`flex-1 flex items-center gap-3 p-2 rounded-xl transition-all ${account.user.id === user.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-gray-50'}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                            {account.user.avatarUrl ? <img src={account.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : <FaUser className="p-2 text-gray-400" />}
                          </div>
                          <div className="text-left overflow-hidden">
                            <p className={`text-xs font-bold truncate ${account.user.id === user.id ? 'text-indigo-600' : 'text-gray-700'}`}>
                              {account.user.username}
                              {account.user.id === user.id ? (
                                <span className="ml-2 text-[8px] bg-indigo-100 text-indigo-500 px-1 rounded">当前</span>
                              ) : (
                                <span className="ml-2 text-[8px] bg-amber-50 text-amber-600 px-1 rounded border border-amber-100">多用户操作</span>
                              )}
                            </p>
                            <p className="text-[9px] text-gray-400 truncate">{account.user.email}</p>
                          </div>
                        </button>
                        {account.user.id !== user.id && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if(window.confirm('确定要移除此账号的保存状态吗？')) {
                                removeAccountFromList(account.user.id);
                              }
                            }} 
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            title="移除此账号"
                          >
                            <FaTimes size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2 mt-2 px-1">
                      <Link to="/login" className="flex items-center justify-center gap-2 p-2 rounded-xl text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100">
                        <FaPlusCircle /> 添加账号
                      </Link>
                      <button 
                        onClick={() => {
                          if(window.confirm('确定要退出并清除所有已登录账号的保存状态吗？')) {
                            logoutAll();
                          }
                        }}
                        className="flex items-center justify-center gap-2 p-2 rounded-xl text-[11px] font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-all border border-red-100"
                      >
                        <FaSignOutAlt /> 退出所有
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* 标准导航菜单 - 分组展示 */}
              {MENU_GROUPS.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.title}</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {group.items.map((item, iIdx) => (
                      <Link 
                        key={iIdx} 
                        to={item.to} 
                        className={`flex items-center gap-3 p-2.5 rounded-xl transition-all text-sm font-medium ${location.pathname === item.to ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <item.icon className={item.color} size={16} /> {item.label}
                      </Link>
                    ))}
                    {group.title === '核心功能' && (
                      <button 
                        onClick={handleTOTPManager} 
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all text-left"
                      >
                        <FaLock className="text-purple-500" size={16} /> 安全设置
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* 管理员分组 */}
              {user.role === 'admin' && ADMIN_GROUPS.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1 pt-2 border-t border-gray-50">
                  <p className="px-3 py-1 text-[10px] font-bold text-pink-400 uppercase tracking-widest">{group.title}</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {group.items.map((item, iIdx) => (
                      <Link 
                        key={iIdx} 
                        to={item.to} 
                        className={`flex items-center gap-3 p-2.5 rounded-xl transition-all text-sm font-medium ${location.pathname === item.to ? 'bg-pink-50 text-pink-700' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <item.icon className={item.color} size={16} /> {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-gray-50/50 border-t border-gray-100 flex-shrink-0">
               <button 
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white border border-red-100 text-red-600 text-sm font-bold hover:bg-red-50 transition-all shadow-sm"
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
