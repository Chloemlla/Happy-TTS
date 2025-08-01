import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';
import { 
  FaCog, 
  FaLock, 
  FaList, 
  FaSync, 
  FaInfoCircle,
  FaTimes
} from 'react-icons/fa';

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
  source?: string; // 数据来源
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

// 根据环境变量名判断数据来源
function getEnvSource(key: string): string | undefined {
  const keyLower = key.toLowerCase();
  
  // 数据库相关
  if (keyLower.includes('db_') || keyLower.includes('database_') || keyLower.includes('mongo')) {
    return '数据库配置';
  }
  
  // 邮件相关
  if (keyLower.includes('email_') || keyLower.includes('mail_') || keyLower.includes('smtp')) {
    return '邮件服务配置';
  }
  
  // API相关
  if (keyLower.includes('api_') || keyLower.includes('openai') || keyLower.includes('token')) {
    return 'API配置';
  }
  
  // 安全相关
  if (keyLower.includes('secret_') || keyLower.includes('key_') || keyLower.includes('password')) {
    return '安全配置';
  }
  
  // 服务器相关
  if (keyLower.includes('port') || keyLower.includes('host') || keyLower.includes('url')) {
    return '服务器配置';
  }
  
  // 管理员相关
  if (keyLower.includes('admin_')) {
    return '管理员配置';
  }
  
  // 环境相关
  if (keyLower.includes('env') || keyLower.includes('node_env')) {
    return '环境配置';
  }
  
  return undefined; // 没有明确来源
}

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('');
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
            
            // 为环境变量添加数据来源信息
            envArr = envArr.map(item => {
              const source = getEnvSource(item.key);
              return { ...item, source };
            });
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

  // 管理员校验
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
            <FaLock className="text-2xl text-red-600" />
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              环境变量管理仅限管理员使用
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
          <FaCog className="text-2xl text-blue-600" />
          环境变量管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>查看系统环境变量配置，支持加密存储和传输。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>实时查看系统环境变量</li>
                <li>支持AES-256加密传输</li>
                <li>自动解密显示数据</li>
                <li>仅管理员可访问</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 环境变量表格 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            环境变量列表
          </h3>
          <motion.button
            onClick={fetchEnvs}
            disabled={loading}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        {/* 数据来源图例 */}
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3 text-base text-blue-700">
            <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
            <span className="font-medium leading-relaxed">带蓝色感叹号图标的变量表示有明确的数据来源信息</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : envs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FaList className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            暂无环境变量数据
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[200px] w-1/3">变量名</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[300px] w-2/3">值</th>
                </tr>
              </thead>
              <tbody>
                {envs.map((item, idx) => (
                  <motion.tr 
                    key={item.key} 
                    className={`border-b border-gray-100 last:border-b-0 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    whileHover={{ backgroundColor: '#f8fafc' }}
                  >
                    <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 align-top">
                      <div className="break-words whitespace-normal leading-relaxed flex items-start gap-1">
                        {item.source && (
                          <button
                            onClick={() => {
                              setSelectedSource(item.source!);
                              setShowSourceModal(true);
                            }}
                            className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 mt-0.5 flex-shrink-0 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <FaInfoCircle />
                          </button>
                        )}
                        <span>{item.key.split(':').pop() || item.key}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700 align-top">
                      <div className="break-words whitespace-pre-wrap leading-relaxed">
                        {item.value}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 统计信息 */}
        {!loading && envs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 pt-4 border-t border-gray-200"
          >
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>总计 {envs.length} 个环境变量</span>
              <span>最后更新: {new Date().toLocaleString()}</span>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 数据来源弹窗 */}
      <AnimatePresence>
        {showSourceModal && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[9999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setShowSourceModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[10000] border border-gray-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaInfoCircle className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">数据来源</h3>
                <p className="text-gray-600 mb-6">{selectedSource}</p>
                <button
                  onClick={() => setShowSourceModal(false)}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EnvManager; 