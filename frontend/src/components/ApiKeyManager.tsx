import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { getApiBaseUrl } from '../api/api';
import {
  FaKey, FaPlus, FaTrash, FaBan, FaCheck, FaCopy,
  FaSyncAlt, FaShieldAlt, FaClock, FaEye, FaEyeSlash,
} from 'react-icons/fa';

interface ApiKeyItem {
  keyId: string;
  name: string;
  userId: string;
  permissions: string[];
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  enabled: boolean;
  createdAt: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});
const api = (path: string, opts?: RequestInit) =>
  fetch(`${getApiBaseUrl()}${path}`, { headers: authHeaders(), ...opts });

const ApiKeyManager: React.FC = () => {
  const { setNotification } = useNotification();
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // 创建表单
  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState<string[]>(['status']);
  const [newRate, setNewRate] = useState(60);
  const [newExpDays, setNewExpDays] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  // 新创建的明文 key（仅显示一次）
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/apikeys/all');
      const data = await res.json();
      if (data.success) setKeys(data.keys || []);
      else throw new Error(data.error);
    } catch {
      // 如果不是管理员，尝试获取自己的
      try {
        const res = await api('/api/apikeys/mine');
        const data = await res.json();
        if (data.success) setKeys(data.keys || []);
      } catch { setNotification({ message: '获取 API Key 列表失败', type: 'error' }); }
    } finally { setLoading(false); }
  }, [setNotification]);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await api('/api/apikeys/permissions');
      const data = await res.json();
      if (data.success) setAllPermissions(data.permissions || []);
    } catch {}
  }, []);

  useEffect(() => { fetchKeys(); fetchPermissions(); }, [fetchKeys, fetchPermissions]);

  const handleCreate = async () => {
    if (!newName.trim()) { setNotification({ message: '请输入名称', type: 'warning' }); return; }
    setCreating(true);
    try {
      const res = await api('/api/apikeys', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          permissions: newPerms,
          rateLimit: newRate,
          expiresInDays: newExpDays || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRevealedKey(data.plainKey);
      setShowKey(true);
      setNewName(''); setNewPerms(['status']); setNewRate(60); setNewExpDays('');
      setShowCreate(false);
      fetchKeys();
      setNotification({ message: 'API Key 创建成功，请立即复制保存', type: 'success' });
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : '创建失败', type: 'error' });
    } finally { setCreating(false); }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      const res = await api(`/api/apikeys/${keyId}/revoke`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      setNotification({ message: '已吊销', type: 'success' });
      fetchKeys();
    } catch (err) { setNotification({ message: err instanceof Error ? err.message : '操作失败', type: 'error' }); }
  };

  const handleEnable = async (keyId: string) => {
    try {
      const res = await api(`/api/apikeys/${keyId}/enable`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      setNotification({ message: '已启用', type: 'success' });
      fetchKeys();
    } catch (err) { setNotification({ message: err instanceof Error ? err.message : '操作失败', type: 'error' }); }
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm(`确定永久删除 ${keyId}？此操作不可恢复。`)) return;
    try {
      const res = await api(`/api/apikeys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      setNotification({ message: '已删除', type: 'success' });
      fetchKeys();
    } catch (err) { setNotification({ message: err instanceof Error ? err.message : '删除失败', type: 'error' }); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setNotification({ message: '已复制到剪贴板', type: 'success' }),
      () => setNotification({ message: '复制失败', type: 'error' }),
    );
  };

  const togglePerm = (perm: string) => {
    setNewPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <FaKey className="text-xl sm:text-2xl text-amber-600" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">API Key 管理</h2>
        </div>
        <div className="flex gap-2">
          <motion.button onClick={fetchKeys} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            whileTap={{ scale: 0.95 }}>
            <FaSyncAlt className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">刷新</span>
          </motion.button>
          <motion.button onClick={() => { setShowCreate(!showCreate); setRevealedKey(null); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition"
            whileTap={{ scale: 0.95 }}>
            <FaPlus /><span className="hidden sm:inline">创建</span>
          </motion.button>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-gray-500">
        为程序化调用和第三方集成创建 API Key。使用 <code className="bg-gray-100 px-1 rounded text-xs">X-API-Key</code> 请求头传递密钥。
      </p>

      {/* 新创建的 Key 明文展示 */}
      <AnimatePresence>
        {revealedKey && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-center gap-2 mb-2 text-amber-800 font-medium text-sm">
              <FaShieldAlt /> 新 API Key 已创建 — 请立即复制，此密钥不会再次显示
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 bg-white px-3 py-2 rounded border text-xs sm:text-sm font-mono break-all select-all overflow-hidden">
                {showKey ? revealedKey : '•'.repeat(40)}
              </code>
              <motion.button onClick={() => setShowKey(!showKey)}
                className="p-2 text-gray-500 hover:text-gray-700" whileTap={{ scale: 0.9 }}>
                {showKey ? <FaEyeSlash /> : <FaEye />}
              </motion.button>
              <motion.button onClick={() => copyToClipboard(revealedKey)}
                className="p-2 text-amber-600 hover:text-amber-800" whileTap={{ scale: 0.9 }}>
                <FaCopy />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 创建表单 */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={50}
                placeholder="例如：CI/CD 部署密钥"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">权限</label>
              <div className="flex flex-wrap gap-2">
                {allPermissions.map(p => (
                  <motion.button key={p} onClick={() => togglePerm(p)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                      newPerms.includes(p) ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`} whileTap={{ scale: 0.95 }}>
                    {p}
                  </motion.button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">限流（次/分钟）</label>
                <input type="number" value={newRate} onChange={e => setNewRate(Number(e.target.value) || 60)}
                  min={1} max={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">有效期（天，留空永不过期）</label>
                <input type="number" value={newExpDays} onChange={e => setNewExpDays(e.target.value === '' ? '' : Number(e.target.value))}
                  min={1} max={365} placeholder="永不过期"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              </div>
            </div>
            <motion.button onClick={handleCreate} disabled={creating || !newName.trim()}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg font-semibold text-white transition ${
                creating || !newName.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 shadow'
              }`} whileTap={{ scale: 0.98 }}>
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <FaPlus />}
              <span>{creating ? '创建中...' : '创建 API Key'}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Key 列表 */}
      {loading && keys.length === 0 ? (
        <div className="text-center py-10 text-gray-400">加载中...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-10 text-gray-400">暂无 API Key，点击「创建」开始</div>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <motion.div key={k.keyId} layout
              className={`p-3 sm:p-4 border rounded-lg transition ${k.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm">{k.name}</span>
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate max-w-[120px] sm:max-w-none">{k.keyId}</code>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${k.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {k.enabled ? '启用' : '已吊销'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {k.permissions.map(p => (
                      <span key={p} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">{p}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>限流: {k.rateLimit}/min</span>
                    <span>调用: {k.usageCount} 次</span>
                    {k.expiresAt && <span className="flex items-center gap-1"><FaClock /> {new Date(k.expiresAt).toLocaleDateString()}</span>}
                    {k.lastUsedAt && <span className="col-span-2 sm:col-span-1">最后使用: {new Date(k.lastUsedAt).toLocaleString()}</span>}
                    {k.lastUsedIp && <span>IP: {k.lastUsedIp}</span>}
                    <span>创建: {new Date(k.createdAt).toLocaleDateString()}</span>
                    <span className="truncate">用户: {k.userId}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {k.enabled ? (
                    <motion.button onClick={() => handleRevoke(k.keyId)} title="吊销"
                      className="p-2 sm:p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition" whileTap={{ scale: 0.9 }}>
                      <FaBan />
                    </motion.button>
                  ) : (
                    <motion.button onClick={() => handleEnable(k.keyId)} title="启用"
                      className="p-2 sm:p-1.5 text-green-600 hover:bg-green-50 rounded transition" whileTap={{ scale: 0.9 }}>
                      <FaCheck />
                    </motion.button>
                  )}
                  <motion.button onClick={() => handleDelete(k.keyId)} title="永久删除"
                    className="p-2 sm:p-1.5 text-red-500 hover:bg-red-50 rounded transition" whileTap={{ scale: 0.9 }}>
                    <FaTrash />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
