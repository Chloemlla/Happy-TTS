import React, { useState, Suspense } from 'react';
import UserManagement from './UserManagement';
const AnnouncementManager = React.lazy(() => import('./AnnouncementManager'));
const EnvManager = React.lazy(() => import('./EnvManager'));
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
  { key: 'users', label: '用户管理' },
  { key: 'announcement', label: '公告管理' },
  { key: 'env', label: '环境变量' },
];

const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState('users');
  return (
    <div className="max-w-5xl mx-auto p-6 mt-8 bg-white rounded-xl shadow-lg">
      <h1 className="text-3xl font-bold mb-6">管理后台</h1>
      <div className="flex space-x-4 mb-6">
        {TABS.map(t => (
          <motion.button
            key={t.key}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-indigo-50'}`}
            onClick={() => setTab(t.key)}
            whileTap={{ scale: 0.96 }}
            whileHover={tab !== t.key ? { scale: 1.05 } : {}}
          >
            {t.label}
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
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminDashboard; 