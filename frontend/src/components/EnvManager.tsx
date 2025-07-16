import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = '/api/admin/envs';

interface EnvItem {
  key: string;
  value: string;
  desc?: string;
  updatedAt?: string;
}

const EnvManager: React.FC = () => {
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchEnvs = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(API_URL, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '获取失败');
        }
        setLoading(false);
        return;
      }
      if (data.success) setEnvs(data.envs || []);
      else setError(data.error || '获取失败');
    } catch (e) {
      setError('获取失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEnvs(); }, []);

  const handleEdit = (item: EnvItem) => {
    setEditingKey(item.key);
    setForm({ ...item });
    setError('');
    setSuccess('');
  };
  const handleAdd = () => {
    setEditingKey('');
    setForm({ key: '', value: '', desc: '' });
    setError('');
    setSuccess('');
  };
  const handleCancel = () => {
    setEditingKey(null);
    setForm({});
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSave = async () => {
    setError(''); setSuccess('');
    if (!form.key || !form.value) { setError('key和value不能为空'); return; }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '保存失败');
        }
        return;
      }
      if (data.success) {
        setSuccess('保存成功');
        setEditingKey(null);
        setForm({});
        setEnvs(data.envs || []);
      } else setError(data.error || '保存失败');
    } catch (e) {
      setError('保存失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    }
  };
  const handleDelete = async (key: string) => {
    if (!window.confirm('确定要删除该环境变量吗？')) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch(API_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '删除失败');
        }
        return;
      }
      if (data.success) {
        setSuccess('已删除');
        setEnvs(data.envs || []);
        if (editingKey === key) handleCancel();
      } else setError(data.error || '删除失败');
    } catch (e) {
      setError('删除失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6">环境变量管理</h2>
      {loading ? (
        <div className="text-gray-400">加载中…</div>
      ) : (
        <>
          {error && <div className="text-red-500 mb-2">{error}</div>}
          {success && <div className="text-green-600 mb-2">{success}</div>}
          <div className="mb-4 flex justify-end">
            <button
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
              onClick={handleAdd}
            >新增环境变量</button>
          </div>
          <div className="space-y-4">
            <AnimatePresence>
              {editingKey === '' && (
                <motion.div
                  key="add"
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.25 }}
                  className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-2"
                >
                  <div className="flex gap-4">
                    <input name="key" className="border rounded px-2 py-1 flex-1" placeholder="key" value={form.key || ''} onChange={handleChange} />
                    <input name="value" className="border rounded px-2 py-1 flex-1" placeholder="value" value={form.value || ''} onChange={handleChange} />
                  </div>
                  <textarea name="desc" className="border rounded px-2 py-1 w-full" placeholder="描述（可选）" value={form.desc || ''} onChange={handleChange} />
                  <div className="flex gap-3 mt-2">
                    <button className="bg-indigo-600 text-white px-4 py-1 rounded-lg font-semibold shadow hover:bg-indigo-700 transition" onClick={handleSave}>保存</button>
                    <button className="bg-gray-100 text-gray-700 px-4 py-1 rounded-lg font-semibold shadow hover:bg-gray-200 transition" onClick={handleCancel}>取消</button>
                  </div>
                </motion.div>
              )}
              {envs.map(item => (
                editingKey === item.key ? (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                    className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-2"
                  >
                    <div className="flex gap-4">
                      <input name="key" className="border rounded px-2 py-1 flex-1" placeholder="key" value={form.key || ''} onChange={handleChange} disabled />
                      <input name="value" className="border rounded px-2 py-1 flex-1" placeholder="value" value={form.value || ''} onChange={handleChange} />
                    </div>
                    <textarea name="desc" className="border rounded px-2 py-1 w-full" placeholder="描述（可选）" value={form.desc || ''} onChange={handleChange} />
                    <div className="flex gap-3 mt-2">
                      <button className="bg-indigo-600 text-white px-4 py-1 rounded-lg font-semibold shadow hover:bg-indigo-700 transition" onClick={handleSave}>保存</button>
                      <button className="bg-gray-100 text-gray-700 px-4 py-1 rounded-lg font-semibold shadow hover:bg-gray-200 transition" onClick={handleCancel}>取消</button>
                      <button className="bg-red-500 text-white px-4 py-1 rounded-lg font-semibold shadow hover:bg-red-600 transition" onClick={() => handleDelete(item.key)}>删除</button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                    className="border rounded-lg p-4 bg-gray-50 flex flex-col gap-2"
                  >
                    <div className="flex gap-4 items-center">
                      <div className="font-mono text-sm flex-1"><b>{item.key}</b></div>
                      <div className="font-mono text-sm flex-1 text-gray-700 break-all">{item.value}</div>
                    </div>
                    {item.desc && <div className="text-gray-500 text-sm">{item.desc}</div>}
                    <div className="flex gap-3 mt-2">
                      <button className="bg-indigo-600 text-white px-4 py-1 rounded-lg font-semibold shadow hover:bg-indigo-700 transition" onClick={() => handleEdit(item)}>编辑</button>
                      <button className="bg-red-500 text-white px-4 py-1 rounded-lg font-semibold shadow hover:bg-red-600 transition" onClick={() => handleDelete(item.key)}>删除</button>
                    </div>
                    <div className="text-gray-400 text-xs mt-1">更新时间：{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}</div>
                  </motion.div>
                )
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
};

export default EnvManager; 