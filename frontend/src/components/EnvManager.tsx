import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';

const API_URL = getApiBaseUrl() + '/api/admin/envs';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

interface EnvItem {
  key: string;
  value: string;
  desc?: string;
  updatedAt?: string;
}

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const { setNotification } = useNotification();

  const fetchEnvs = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setNotification({ message: '请先登录后再操作', type: 'error' });
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
            break;
          case '用户不存在':
            setNotification({ message: '用户不存在，请重新登录', type: 'error' });
            break;
          case '需要管理员权限':
          case '无权限':
            setNotification({ message: '需要管理员权限', type: 'error' });
            break;
          default:
            setNotification({ message: data.error || '获取失败', type: 'error' });
        }
        setLoading(false);
        return;
      }
      if (data.success) {
        // 兼容对象格式
        let envArr: EnvItem[] = [];
        if (Array.isArray(data.envs)) {
          envArr = data.envs;
        } else if (data.envs && typeof data.envs === 'object') {
          envArr = Object.entries(data.envs).map(([key, value]) => ({ key, value: String(value) }));
        }
        setEnvs(envArr);
      } else setNotification({ message: data.error || '获取失败', type: 'error' });
    } catch (e) {
      setNotification({ message: '获取失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEnvs(); }, []);

  // 删除所有编辑、添加、删除相关UI和逻辑，只保留只读表格
  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6">环境变量（只读）</h2>
      {loading ? (
        <div className="text-gray-400">加载中…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded-xl overflow-hidden shadow-md">
            <thead>
              <tr className="bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800">
                <th className="p-3 whitespace-pre-wrap break-all">变量名</th>
                <th className="p-3 whitespace-pre-wrap break-all">值</th>
              </tr>
            </thead>
            <tbody>
              {envs.map((item, idx) => (
                <tr key={item.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                  <td className="p-3 font-mono font-bold whitespace-pre-wrap break-all max-w-xs md:max-w-md">{item.key}</td>
                  <td className="p-3 font-mono break-all whitespace-pre-wrap max-w-xs md:max-w-lg">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EnvManager; 