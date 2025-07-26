import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';

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
        let envArr: EnvItem[] = [];
        
        // 检查是否为加密数据（通过检测data和iv字段来判断）
        if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
          try {
            console.log('🔐 开始解密环境变量数据...');
            console.log('   加密数据长度:', data.data.length);
            console.log('   IV:', data.iv);
            
            const token = localStorage.getItem('token');
            if (!token) {
              console.error('❌ Token不存在，无法解密数据');
              setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
              setLoading(false);
              return;
            }
            
            console.log('   使用Token进行解密，Token长度:', token.length);
            
            // 解密数据
            const decryptedJson = decryptAES256(data.data, data.iv, token);
            const decryptedData = JSON.parse(decryptedJson);
            
            if (Array.isArray(decryptedData)) {
              console.log('✅ 解密成功，获取到', decryptedData.length, '个环境变量');
              envArr = decryptedData;
            } else {
              console.error('❌ 解密数据格式错误，期望数组格式');
              setNotification({ message: '解密数据格式错误', type: 'error' });
              setLoading(false);
              return;
            }
          } catch (decryptError) {
            console.error('❌ 解密失败:', decryptError);
            setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
            setLoading(false);
            return;
          }
        } else {
          // 兼容旧的未加密格式
        if (Array.isArray(data.envs)) {
          envArr = data.envs;
        } else if (data.envs && typeof data.envs === 'object') {
          envArr = Object.entries(data.envs).map(([key, value]) => ({ key, value: String(value) }));
        }
        }
        
        setEnvs(envArr);
      } else {
        setNotification({ message: data.error || '获取失败', type: 'error' });
      }
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