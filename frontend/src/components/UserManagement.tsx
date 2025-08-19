import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../api/api';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';
import { useNotification } from './Notification';
import {
  FaUsers,
  FaUserPlus,
  FaEdit,
  FaTrash,
  FaSave,
  FaTimes,
  FaUser,
  FaEnvelope,
  FaKey,
  FaUserTag,
  FaList
} from 'react-icons/fa';

interface FingerprintRecord {
  id: string;
  ts: number;
  ua?: string;
  ip?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  createdAt: string;
  fingerprints?: FingerprintRecord[];
  requireFingerprint?: boolean;
  requireFingerprintAt?: number;
}

const emptyUser = { id: '', username: '', email: '', password: '', role: 'user', createdAt: '' };

// 使用全局 API 实例，统一 baseURL/拦截器

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    console.log('   开始AES-256解密...');
    console.log('   密钥长度:', key.length);
    console.log('   加密数据长度:', encryptedData.length);
    console.log('   IV长度:', iv.length);

    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

    console.log('   密钥哈希完成，开始解密...');

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('   解密完成，结果长度:', result.length);

    return result;
  } catch (error) {
    console.error('❌ AES-256解密失败:', error);
    throw new Error('解密失败');
  }
}

const ROW_INITIAL = { opacity: 0, x: -20 } as const;
const ROW_ANIMATE = { opacity: 1, x: 0 } as const;

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<User>(emptyUser);
  const [showForm, setShowForm] = useState(false);
  const [fpUser, setFpUser] = useState<User | null>(null);
  const [showFpModal, setShowFpModal] = useState(false);
  // 记录管理员对各用户发起“请求下次上报”的最新时间（仅前端展示用）
  const [fpRequireMap, setFpRequireMap] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();
  const hoverScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);
  const tapScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      if (!token) {
        setError('未找到有效的认证令牌，请重新登录');
        setNotification({ type: 'warning', message: '未找到认证令牌，请重新登录后重试' });
        return;
      }

      const res = await api.get('/api/admin/users', { params: { includeFingerprints: 1 } });

      // 检查是否为加密数据
      if (res.data.data && res.data.iv && typeof res.data.data === 'string' && typeof res.data.iv === 'string') {
        try {
          console.log('🔐 开始解密用户列表数据...');
          console.log('   加密数据长度:', res.data.data.length);
          console.log('   IV:', res.data.iv);
          console.log('   使用Token进行解密，Token长度:', token.length);

          // 解密数据
          const decryptedJson = decryptAES256(res.data.data, res.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);

          if (Array.isArray(decryptedData)) {
            console.log('✅ 解密成功，获取到', decryptedData.length, '个用户');
            setUsers(decryptedData);
            const initMap: Record<string, number> = {};
            for (const u of decryptedData) {
              const ts = Number((u as any).requireFingerprintAt || 0);
              if (ts > 0) initMap[(u as any).id] = ts;
            }
            setFpRequireMap(initMap);
            setNotification({ type: 'success', message: `已获取 ${decryptedData.length} 个用户` });
          } else {
            console.error('❌ 解密数据格式错误，期望数组格式');
            setError('解密数据格式错误');
            setNotification({ type: 'error', message: '解密数据格式错误' });
          }
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setError('数据解密失败，请检查登录状态');
          setNotification({ type: 'error', message: '数据解密失败，请检查登录状态' });
        }
      } else {
        // 兼容旧的未加密格式
        console.log('📝 使用未加密格式数据');
        setUsers(res.data);
        const count = Array.isArray(res.data) ? res.data.length : 0;
        if (count) setNotification({ type: 'success', message: `已获取 ${count} 个用户` });
      }
    } catch (e: any) {
      console.error('获取用户列表失败:', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '获取用户列表失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // 表单变更
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // 添加或编辑用户
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      const method = editingUser ? 'put' : 'post';
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const res = await api.request({
        url,
        method,
        data: form
      });
      setShowForm(false);
      setEditingUser(null);
      setForm(emptyUser);
      setNotification({ type: 'success', message: editingUser ? '用户信息已更新' : '用户已创建' });
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '操作失败');
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '操作失败' });
    } finally {
      setLoading(false);
    }
  };

  // 删除用户
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || '';
      await api.delete(`/api/admin/users/${id}`);
      setNotification({ type: 'success', message: '用户已删除' });
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '删除失败');
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除失败' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const openEdit = useCallback((u: User) => { setEditingUser(u); setForm(u); setShowForm(true); }, []);
  const openFp = useCallback((u: User) => { setFpUser(u); setShowFpModal(true); }, []);

  if (!user || user.role !== 'admin') {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2">
            🔒
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              用户管理仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          👥
          用户管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理系统用户账户，包括添加、编辑、删除用户和权限管理。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>查看所有用户账户信息</li>
                <li>添加新用户账户</li>
                <li>编辑用户信息和权限</li>
                <li>删除用户账户</li>
                <li>数据加密传输保护</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="bg-red-50 border border-red-200 rounded-xl p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
            {error.includes('认证失败') && (
              <div className="mt-3">
                <motion.button
                  onClick={() => navigate('/welcome')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  whileHover={hoverScale(1.02)}
                  whileTap={tapScale(0.95)}
                >
                  重新登录
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 添加用户按钮 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            用户列表
          </h3>
          <motion.button
            onClick={() => { setShowForm(true); setEditingUser(null); setForm(emptyUser); }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
            whileHover={hoverScale(1.02)}
            whileTap={tapScale(0.95)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            添加用户
          </motion.button>
        </div>

        {/* 添加用户表单 */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              onSubmit={handleSubmit}
              className="mb-6 space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200"
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    用户名
                  </label>
                  <input
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="请输入用户名"
                    required
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    邮箱
                  </label>
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="请输入邮箱"
                    required
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    密码
                  </label>
                  <input
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="请输入密码"
                    required
                    type="text"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    角色
                  </label>
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all appearance-none bg-white"
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <motion.button
                  type="submit"
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                  whileHover={hoverScale(1.02)}
                  whileTap={tapScale(0.95)}
                >
                  {editingUser ? '保存修改' : '添加用户'}
                </motion.button>
                <motion.button
                  type="button"
                  className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                  onClick={() => { setShowForm(false); setEditingUser(null); }}
                  whileHover={hoverScale(1.02)}
                  whileTap={tapScale(0.95)}
                >
                  取消
                </motion.button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* 用户列表 */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="px-4 py-3 text-left font-semibold">用户名</th>
                  <th className="px-4 py-3 text-left font-semibold">邮箱</th>
                  <th className="px-4 py-3 text-left font-semibold">角色</th>
                  <th className="px-4 py-3 text-left font-semibold">创建时间</th>
                  <th className="px-4 py-3 text-left font-semibold">指纹</th>
                  <th className="px-4 py-3 text-left font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <motion.tr
                    key={u.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    initial={ROW_INITIAL}
                    animate={ROW_ANIMATE}
                    transition={{ duration: 0.3, delay: 0.1 * idx }}
                    whileHover={{ backgroundColor: '#f0f9ff' }}
                  >
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          管理员
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          普通用户
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {u.fingerprints && u.fingerprints.length > 0 ? (
                        <div className="space-y-1">
                          <div>
                            最新: <span className="font-mono" title={u.fingerprints[0].id}>{u.fingerprints[0].id.slice(0, 12)}{u.fingerprints[0].id.length > 12 ? '…' : ''}</span>
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {new Date(u.fingerprints[0].ts).toLocaleString()} · {u.fingerprints.length} 条
                          </div>
                          <motion.button
                            className="text-blue-600 hover:underline text-[11px]"
                            onClick={() => openFp(u)}
                            whileHover={hoverScale(1.02)}
                            whileTap={tapScale(0.95)}
                          >查看全部</motion.button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {fpRequireMap[u.id] ? (
                            <>
                              <div className="text-blue-600 text-[12px]">已在预约列表</div>
                              <div className="text-[10px] text-gray-500">上次预约：{new Date(fpRequireMap[u.id]).toLocaleString()}</div>
                              <motion.button
                                className="text-blue-600 hover:underline text-[11px]"
                                onClick={async () => {
                                  try {
                                    await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                    setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                    setNotification({ type: 'success', message: '已再次请求该用户下次上报指纹' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                                  }
                                }}
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.95)}
                              >再次请求</motion.button>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400">暂无</span>
                              <motion.button
                                className="text-blue-600 hover:underline text-[11px]"
                                onClick={async () => {
                                  try {
                                    await api.post(`/api/admin/users/${u.id}/fingerprint/require`, { require: true });
                                    setFpRequireMap(prev => ({ ...prev, [u.id]: Date.now() }));
                                    setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
                                  } catch (e: any) {
                                    setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                                  }
                                }}
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.95)}
                              >请求上报</motion.button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <motion.button
                          className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition"
                          onClick={() => openEdit(u)}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >
                          编辑
                        </motion.button>
                        <motion.button
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition"
                          onClick={() => handleDelete(u.id)}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >
                          删除
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                暂无用户数据
              </div>
            )}
          </div>
        )}
      </motion.div>
      {/* 指纹详情弹窗 */}
      <AnimatePresence>
        {showFpModal && fpUser && (
          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6"
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">指纹详情 - {fpUser.username}</h3>
                <div className="flex items-center gap-2">
                  <motion.button
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={async () => {
                      if (!fpUser) return;
                      try {
                        await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                        setFpRequireMap(prev => ({ ...prev, [fpUser.id]: Date.now() }));
                        setNotification({ type: 'success', message: '已请求该用户下次上报指纹' });
                      } catch (e: any) {
                        setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                      }
                    }}
                    whileHover={hoverScale(1.02)}
                    whileTap={tapScale(0.95)}
                  >请求下次上报</motion.button>
                  <motion.button
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    onClick={async () => {
                      if (!fpUser) return;
                      if (!window.confirm('确定要清空该用户的全部指纹记录吗？此操作不可撤销')) return;
                      try {
                        const res = await api.delete(`/api/admin/users/${fpUser.id}/fingerprints`);
                        const next = res?.data?.fingerprints || [];
                        setFpUser({ ...fpUser, fingerprints: next });
                        setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, fingerprints: next } : u));
                        setNotification({ type: 'success', message: '已清空全部指纹记录' });
                      } catch (e: any) {
                        setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '清空指纹失败' });
                      }
                    }}
                    whileHover={hoverScale(1.02)}
                    whileTap={tapScale(0.95)}
                  >清空全部</motion.button>
                  <motion.button className="text-gray-500 hover:text-gray-700" onClick={() => setShowFpModal(false)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.95)}>✕</motion.button>
                </div>
              </div>
              {fpUser.fingerprints && fpUser.fingerprints.length > 0 ? (
                <div className="max-h-96 overflow-auto space-y-3">
                  {fpUser.fingerprints.map((fp, i) => (
                    <div key={i} className="p-3 border border-gray-200 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">{new Date(fp.ts).toLocaleString()} · IP {fp.ip || '-'} </div>
                      <div className="font-mono break-all text-sm">{fp.id}</div>
                      {fp.ua && <div className="text-[11px] text-gray-500 mt-1 break-all">{fp.ua}</div>}
                      <div className="mt-2">
                        <motion.button
                          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          onClick={async () => {
                            try {
                              await navigator.clipboard?.writeText(fp.id);
                              setNotification({ type: 'success', message: '已复制指纹ID到剪贴板' });
                            } catch {
                              setNotification({ type: 'error', message: '复制失败，请手动选择文本复制' });
                            }
                          }}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >复制ID</motion.button>
                        <motion.button
                          className="ml-2 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          onClick={async () => {
                            if (!fpUser) return;
                            if (!window.confirm('确定要删除该指纹记录吗？')) return;
                            try {
                              const res = await api.delete(`/api/admin/users/${fpUser.id}/fingerprints/${encodeURIComponent(fp.id)}`, {
                                params: { ts: fp.ts }
                              });
                              const next = res?.data?.fingerprints || [];
                              setFpUser({ ...fpUser, fingerprints: next });
                              setUsers(prev => prev.map(u => u.id === fpUser.id ? { ...u, fingerprints: next } : u));
                              setNotification({ type: 'success', message: '已删除指纹记录' });
                            } catch (e: any) {
                              setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除指纹失败' });
                            }
                          }}
                          whileHover={hoverScale(1.02)}
                          whileTap={tapScale(0.95)}
                        >删除</motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  暂无指纹数据
                  {fpUser && fpRequireMap[fpUser.id] ? (
                    <div className="mt-2">
                      <div className="text-blue-600 text-sm">已在预约列表</div>
                      <div className="text-[12px] text-gray-500">上次预约：{new Date(fpRequireMap[fpUser.id]).toLocaleString()}</div>
                      <motion.button
                        className="mt-2 text-blue-600 hover:underline text-[12px]"
                        onClick={async () => {
                          if (!fpUser) return;
                          try {
                            const r = await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                            const ts = Number(r?.data?.requireFingerprintAt || Date.now());
                            setFpRequireMap(prev => ({ ...prev, [fpUser.id]: ts }));
                            const timeStr = new Date(ts).toLocaleString();
                            setNotification({ type: 'success', message: `已再次请求该用户下次上报指纹，已在预约列表\n上次预约：${timeStr}` });
                          } catch (e: any) {
                            setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                          }
                        }}
                        whileHover={hoverScale(1.02)}
                        whileTap={tapScale(0.95)}
                      >再次请求</motion.button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <motion.button
                        className="text-blue-600 hover:underline text-[12px]"
                        onClick={async () => {
                          if (!fpUser) return;
                          try {
                            const r = await api.post(`/api/admin/users/${fpUser.id}/fingerprint/require`, { require: true });
                            const ts = Number(r?.data?.requireFingerprintAt || Date.now());
                            setFpRequireMap(prev => ({ ...prev, [fpUser.id]: ts }));
                            const timeStr = new Date(ts).toLocaleString();
                            setNotification({ type: 'success', message: `已请求该用户下次上报指纹，已在预约列表\n上次预约：${timeStr}` });
                          } catch (e: any) {
                            setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '请求失败' });
                          }
                        }}
                        whileHover={hoverScale(1.02)}
                        whileTap={tapScale(0.95)}
                      >请求上报</motion.button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 text-right">
                <motion.button className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600" onClick={() => setShowFpModal(false)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.95)}>关闭</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default UserManagement; 