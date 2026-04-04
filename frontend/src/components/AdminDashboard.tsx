import React, { useState, Suspense, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import UserManagement from './UserManagement';
const AnnouncementManager = React.lazy(() => import('./AnnouncementManager'));
const EnvManager = React.lazy(() => import('./EnvManager'));
import { motion, AnimatePresence } from 'framer-motion';
const LotteryAdmin = React.lazy(() => import('./LotteryAdmin'));
const ModListEditor = React.lazy(() => import('./ModListEditor'));
const OutEmail = React.lazy(() => import('./OutEmail'));
const ShortLinkManager = React.lazy(() => import('./ShortLinkManager'));
const ShortUrlMigrationManager = React.lazy(() => import('./ShortUrlMigrationManager'));
const CommandManager = React.lazy(() => import('./CommandManager'));
const WebhookEventsManager = React.lazy(() => import('./WebhookEventsManager'));
const LogShare = React.lazy(() => import('./LogShare'));
const FBIWantedManager = React.lazy(() => import('./FBIWantedManager'));
const DataCollectionManager = React.lazy(() => import('./DataCollectionManager'));
const LibreChatAdminPage = React.lazy(() => import('./LibreChatAdminPage'));
import { useAuth } from '../hooks/useAuth';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import { FaCog, FaUsers, FaShieldAlt } from 'react-icons/fa';
const SmartHumanCheckTraces = React.lazy(() => import('./SmartHumanCheckTraces'));
const GitHubBillingCacheManager = React.lazy(() => import('./GitHubBillingCacheManager'));
const IPBanManager = React.lazy(() => import('./IPBanManager'));
const FingerprintManager = React.lazy(() => import('./FingerprintManager'));
const SystemManager = React.lazy(() => import('./SystemManager'));
const BroadcastManager = React.lazy(() => import('./BroadcastManager'));
const ApiKeyManager = React.lazy(() => import('./ApiKeyManager'));
const AuditLogViewer = React.lazy(() => import('./AuditLogViewer'));
const TranslationAuditViewer = React.lazy(() => import('./TranslationAuditViewer'));

const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState('users');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading, logout } = useAuth();
  const { setNotification } = useNotification();
  const navigate = useNavigate();

  const tabs = useMemo(() => ([
    { key: 'users', label: '用户管理' },
    { key: 'librechat', label: 'LibreChat 管理' },
    { key: 'announcement', label: '公告管理' },
    { key: 'env', label: '环境变量' },
    { key: 'lottery', label: '抽奖管理' },
    { key: 'modlist', label: 'Mod管理' },
    { key: 'outemail', label: '外部邮件' },
    { key: 'shortlink', label: '短链管理' },
    { key: 'shorturlmigration', label: '短链迁移' },
    { key: 'command', label: '命令管理' },
    { key: 'humancheck', label: '人机验证日志' },
    { key: 'logshare', label: '日志分享' },
    { key: 'fbiwanted', label: 'FBI通缉犯管理' },
    { key: 'webhookevents', label: 'Webhook事件' },
    { key: 'data-collection', label: '数据收集管理' },
    { key: 'github-billing-cache', label: 'GitHub账单缓存管理' },
    { key: 'ip-ban', label: 'IP封禁管理' },
    { key: 'fingerprint', label: '指纹管理' },
    { key: 'broadcast', label: '广播推送' },
    { key: 'apikeys', label: 'API Key 管理' },
    { key: 'audit-log', label: '操作审计' },
    { key: 'translation-audit', label: '翻译审计' },
    { key: 'system', label: '系统管理' },
  ] as const), []);

  // 多重权限验证
  useEffect(() => {
    const verifyAdminAccess = async () => {
      try {
        setIsLoading(true);

        if (loading) return;

        if (!user) {
          console.warn('[AdminDashboard] 未登录，重定向到登录页面');
          setNotification({ message: '请先登录', type: 'warning' });
          navigate('/login');
          return;
        }

        if (user.role !== 'admin') {
          console.warn('[AdminDashboard] 非管理员用户尝试访问管理后台', { userId: user.id, role: user.role });
          setNotification({ message: '权限不足，仅限管理员访问', type: 'error' });
          navigate('/');
          return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
          console.warn('[AdminDashboard] Token不存在');
          setNotification({ message: '登录已过期，请重新登录', type: 'error' });
          navigate('/login');
          return;
        }

        try {
          const response = await fetch(`${getApiBaseUrl()}/api/admin/verify-access`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: user.id,
              username: user.username,
              role: user.role
            })
          });

          if (!response.ok) throw new Error('后端权限验证失败');

          const result = await response.json();
          if (!result.success) throw new Error(result.message || '权限验证失败');

          console.log('[AdminDashboard] 权限验证通过', { userId: user.id, role: user.role });
          setIsAuthorized(true);
        } catch (error) {
          console.error('[AdminDashboard] 后端权限验证失败:', error);
          setNotification({ message: '权限验证失败，请重新登录', type: 'error' });
          navigate('/login');
          return;
        }
      } catch (error) {
        console.error('[AdminDashboard] 权限验证过程中发生错误:', error);
        setNotification({ message: '权限验证失败', type: 'error' });
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    verifyAdminAccess();
  }, [loading, user, navigate, setNotification]);

  // 定期检查权限（每5分钟）
  useEffect(() => {
    if (!isAuthorized) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.warn('[AdminDashboard] 定期检查：Token不存在');
          setNotification({ message: '登录已过期，请重新登录', type: 'warning' });
          navigate('/login');
          return;
        }

        const response = await fetch(`${getApiBaseUrl()}/api/admin/verify-access`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: user?.id,
            username: user?.username,
            role: user?.role
          })
        });

        if (!response.ok) {
          console.warn('[AdminDashboard] 定期检查：权限验证失败');
          setNotification({ message: '权限已失效，请重新登录', type: 'warning' });
          navigate('/login');
        }
      } catch (error) {
        console.error('[AdminDashboard] 定期权限检查失败:', error);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthorized, user, navigate, setNotification]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-4 rounded-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-8">
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFB703] mx-auto mb-4"></div>
                <p className="text-[#023047]/50">正在验证管理员权限...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 未授权状态
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-4 rounded-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 p-8">
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="text-red-500 text-6xl mb-4">🚫</div>
                <h2 className="text-2xl font-bold text-[#023047] mb-2 font-songti">访问被拒绝</h2>
                <p className="text-[#023047]/50 mb-4">您没有权限访问管理后台</p>
                <motion.button
                  onClick={() => navigate('/')}
                  className="px-6 py-2 bg-[#FFB703] text-[#023047] rounded-lg hover:bg-[#FB8500] transition"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  返回首页
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10 py-8 px-4 rounded-lg">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* 标题和管理员信息 */}
        <motion.div
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-[#023047] text-white p-6">
            <div className="text-center">
              <motion.div
                className="flex items-center justify-center gap-3 mb-4"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaShieldAlt className="text-4xl" />
                <h1 className="text-4xl font-bold font-songti">管理后台</h1>
              </motion.div>
              <motion.p
                className="text-[#8ECAE6] text-lg font-songti"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                系统管理与配置中心
              </motion.p>
            </div>
          </div>

          <div className="p-6 bg-[#8ECAE6]/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div className="flex items-center gap-2 p-3 bg-[#8ECAE6]/15 rounded-lg border border-[#8ECAE6]/30">
                <FaUsers className="text-[#219EBC]" />
                <span className="font-semibold text-[#023047] font-songti">管理员信息</span>
              </div>
              <div className="flex flex-row flex-wrap sm:flex-row items-center gap-2 sm:gap-4 text-xs sm:text-sm text-[#023047]/50 justify-center sm:justify-start">
                <span>管理员: {user?.username}</span>
                <span className="mx-1 text-[#023047]/20">•</span>
                <span>ID: {user?.id}</span>
                <span className="mx-1 text-[#023047]/20">•</span>
                <motion.button
                  onClick={async () => {
                    try {
                      await Promise.resolve(logout?.());
                    } finally {
                      try { localStorage.clear(); } catch { }
                      try { (sessionStorage as any)?.clear?.(); } catch { }
                      navigate('/welcome', { replace: true });
                    }
                  }}
                  className="text-[#FFB703] hover:text-[#FB8500] transition font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  退出登录
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 管理功能区域 */}
        <motion.div
          className="bg-white/80 rounded-2xl shadow-xl border border-[#8ECAE6]/30"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6 p-3 bg-[#8ECAE6]/10 rounded-lg border border-[#8ECAE6]/30">
              <FaCog className="text-[#FFB703]" />
              <span className="font-semibold text-[#023047] font-songti">管理功能</span>
            </div>
            <div className="flex space-x-3 mb-6 overflow-x-auto scrollbar-thin scrollbar-thumb-[#8ECAE6]/40 scrollbar-track-transparent pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {tabs.map(t => (
                <motion.button
                  key={t.key}
                  className={`flex items-center justify-center px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow whitespace-nowrap min-w-[3.5rem] max-w-xs text-center ${tab === t.key
                    ? 'bg-[#FFB703] text-[#023047] shadow-lg shadow-[#FFB703]/20'
                    : 'bg-[#8ECAE6]/10 text-[#023047]/70 border border-[#8ECAE6]/30 hover:bg-[#8ECAE6]/20 hover:text-[#023047] hover:border-[#219EBC]'
                    }`}
                  style={{ width: 'auto', minWidth: 'max-content' }}
                  onClick={() => setTab(t.key)}
                  whileTap={{ scale: 0.96 }}
                  whileHover={tab !== t.key ? { scale: 1.05 } : {}}
                >
                  <span className="w-full text-center block font-songti">{t.label}</span>
                </motion.button>
              ))}
            </div>
            <div style={{ minHeight: 400 }}>
              <AnimatePresence mode="wait">
                {tab === 'users' && (
                  <motion.div key="users" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <UserManagement />
                  </motion.div>
                )}
                {tab === 'librechat' && (
                  <motion.div key="librechat" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><LibreChatAdminPage /></Suspense>
                  </motion.div>
                )}
                {tab === 'announcement' && (
                  <motion.div key="announcement" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><AnnouncementManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'env' && (
                  <motion.div key="env" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><EnvManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'lottery' && (
                  <motion.div key="lottery" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><LotteryAdmin /></Suspense>
                  </motion.div>
                )}
                {tab === 'modlist' && (
                  <motion.div key="modlist" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><ModListEditor /></Suspense>
                  </motion.div>
                )}
                {tab === 'outemail' && (
                  <motion.div key="outemail" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><OutEmail /></Suspense>
                  </motion.div>
                )}
                {tab === 'shortlink' && (
                  <motion.div key="shortlink" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><ShortLinkManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'shorturlmigration' && (
                  <motion.div key="shorturlmigration" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><ShortUrlMigrationManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'webhookevents' && (
                  <motion.div key="webhookevents" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><WebhookEventsManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'command' && (
                  <motion.div key="command" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><CommandManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'humancheck' && (
                  <motion.div key="humancheck" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><SmartHumanCheckTraces /></Suspense>
                  </motion.div>
                )}
                {tab === 'logshare' && (
                  <motion.div key="logshare" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><LogShare /></Suspense>
                  </motion.div>
                )}
                {tab === 'fbiwanted' && (
                  <motion.div key="fbiwanted" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><FBIWantedManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'data-collection' && (
                  <motion.div key="data-collection" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><DataCollectionManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'github-billing-cache' && (
                  <motion.div key="github-billing-cache" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><GitHubBillingCacheManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'ip-ban' && (
                  <motion.div key="ip-ban" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><IPBanManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'fingerprint' && (
                  <motion.div key="fingerprint" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><FingerprintManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'broadcast' && (
                  <motion.div key="broadcast" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><BroadcastManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'apikeys' && (
                  <motion.div key="apikeys" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><ApiKeyManager /></Suspense>
                  </motion.div>
                )}
                {tab === 'audit-log' && (
                  <motion.div key="audit-log" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><AuditLogViewer /></Suspense>
                  </motion.div>
                )}
                {tab === 'translation-audit' && (
                  <motion.div key="translation-audit" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><TranslationAuditViewer /></Suspense>
                  </motion.div>
                )}
                {tab === 'system' && (
                  <motion.div key="system" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                    <Suspense fallback={<div className="text-[#023047]/30">加载中…</div>}><SystemManager /></Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminDashboard;
