import React, { useState, Suspense } from 'react';
import UserManagement from './UserManagement';
const AnnouncementManager = React.lazy(() => import('./AnnouncementManager'));
const EnvManager = React.lazy(() => import('./EnvManager'));
import { motion, AnimatePresence } from 'framer-motion';
const LotteryAdmin = React.lazy(() => import('./LotteryAdmin'));
const ModListEditor = React.lazy(() => import('./ModListEditor'));
const OutEmail = React.lazy(() => import('./OutEmail'));

const TABS = [
  { key: 'users', label: '用户管理' },
  { key: 'announcement', label: '公告管理' },
  { key: 'env', label: '环境变量' },
  { key: 'lottery', label: '抽奖管理' },
  { key: 'modlist', label: 'Mod管理' },
  { key: 'outemail', label: '外部邮件' },
];

const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState('users');
  return (
    <div className="max-w-5xl mx-auto p-6 mt-8 bg-white rounded-xl shadow-lg">
      <h1 className="text-3xl font-bold mb-6">管理后台</h1>
      <div className="flex space-x-4 mb-6 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent" style={{ WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(t => (
          <motion.button
            key={t.key}
            className={`flex items-center justify-center px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow whitespace-nowrap min-w-[3.5rem] max-w-xs text-center ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-indigo-50'}`}
            style={{ width: 'auto', minWidth: 'max-content' }}
            onClick={() => setTab(t.key)}
            whileTap={{ scale: 0.96 }}
            whileHover={tab !== t.key ? { scale: 1.05 } : {}}
          >
            <span className="w-full text-center block">{t.label}</span>
          </motion.button>
        ))}
      </div>
      <div style={{ minHeight: 400 }}>
        <AnimatePresence mode="wait">
          {tab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <UserManagement />
            </motion.div>
          )}
          {tab === 'announcement' && (
            <motion.div
              key="announcement"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="text-gray-400">加载中…</div>}>
                <AnnouncementManager />
              </Suspense>
            </motion.div>
          )}
          {tab === 'env' && (
            <motion.div
              key="env"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="text-gray-400">加载中…</div>}>
                <EnvManager />
              </Suspense>
            </motion.div>
          )}
          {tab === 'lottery' && (
            <motion.div
              key="lottery"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="text-gray-400">加载中…</div>}>
                <LotteryAdmin />
              </Suspense>
            </motion.div>
          )}
          {tab === 'modlist' && (
            <motion.div
              key="modlist"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="text-gray-400">加载中…</div>}>
                <ModListEditor />
              </Suspense>
            </motion.div>
          )}
          {tab === 'outemail' && (
            <motion.div
              key="outemail"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<div className="text-gray-400">加载中…</div>}>
                <OutEmail />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminDashboard; 