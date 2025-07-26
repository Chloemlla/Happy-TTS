import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrash, FaCopy, FaSearch, FaSync, FaDice } from 'react-icons/fa';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';

interface ShortLink {
  _id: string;
  code: string;
  target: string;
  createdAt: string;
  userId?: string;
  username?: string;
}

const PAGE_SIZE = 10;

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

const ShortLinkManager: React.FC = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [createTarget, setCreateTarget] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [codeValidation, setCodeValidation] = useState<{ isValid: boolean; message: string } | null>(null);
  const { setNotification } = useNotification();

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      // 检查是否为加密数据
      if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
        try {
          console.log('🔐 开始解密短链列表数据...');
          console.log('   加密数据长度:', data.data.length);
          console.log('   IV:', data.iv);
          console.log('   使用Token进行解密，Token长度:', token?.length || 0);
          
          // 解密数据
          const decryptedJson = decryptAES256(data.data, data.iv, token || '');
          const decryptedData = JSON.parse(decryptedJson);
          
          if (decryptedData.items && Array.isArray(decryptedData.items)) {
            console.log('✅ 解密成功，获取到', decryptedData.items.length, '个短链');
            setLinks(decryptedData.items);
            setTotal(decryptedData.total || 0);
          } else {
            console.error('❌ 解密数据格式错误，期望包含items数组');
            setLinks([]);
            setTotal(0);
          }
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setLinks([]);
          setTotal(0);
        }
      } else {
        // 兼容旧的未加密格式
        console.log('📝 使用未加密格式数据');
      setLinks(data.items || []);
      setTotal(data.total || 0);
      }
    } catch {
      setLinks([]);
      setTotal(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line
  }, [search, page]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该短链吗？')) return;
    
    // 添加删除前的视觉反馈
    setHighlightedId(id);
    
    const token = localStorage.getItem('token');
    await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // 删除成功后的动效
    setTimeout(() => setHighlightedId(null), 800);
    fetchLinks();
    setNotification({ message: '删除成功', type: 'success' });
  };

  const handleCopy = (code: string) => {
    const url = `${window.location.origin}/s/${code}`;
    navigator.clipboard.writeText(url);
    setNotification({ message: '短链已复制到剪贴板', type: 'info' });
    
    // 添加复制成功的视觉反馈
    const button = document.querySelector(`[data-copy-code="${code}"]`);
    if (button) {
      button.classList.add('bg-green-100', 'text-green-700');
      setTimeout(() => {
        button.classList.remove('bg-green-100', 'text-green-700');
      }, 500);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLinks().then(() => setRefreshing(false));
  };

  // 生成随机短链接码
  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // 添加生成动画效果
    setCustomCode('');
    setTimeout(() => {
      setCustomCode(result);
    }, 100);
  };

  // 清除自定义短链接码
  const clearCustomCode = () => {
    setCustomCode('');
    setCodeValidation(null);
  };

  // 验证自定义短链接码
  const validateCustomCode = (code: string) => {
    if (!code.trim()) {
      setCodeValidation(null);
      return;
    }
    
    const trimmedCode = code.trim();
    if (trimmedCode.length < 1 || trimmedCode.length > 200) {
      setCodeValidation({ isValid: false, message: '长度必须在1-200个字符之间' });
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
      setCodeValidation({ isValid: false, message: '只能包含字母、数字、连字符和下划线' });
      return;
    }
    
    setCodeValidation({ isValid: true, message: '格式正确' });
  };

  const handleCreate = async () => {
    if (!createTarget.trim()) {
      setNotification({ message: '请输入目标地址', type: 'warning' });
      return;
    }
    
    // 验证自定义短链接码格式
    if (customCode.trim()) {
      const trimmedCode = customCode.trim();
      if (trimmedCode.length < 1 || trimmedCode.length > 200) {
        setNotification({ message: '自定义短链接码长度必须在1-200个字符之间', type: 'warning' });
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        setNotification({ message: '自定义短链接码只能包含字母、数字、连字符和下划线', type: 'warning' });
        return;
      }
    }
    
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const requestBody: any = { target: createTarget.trim() };
      if (customCode.trim()) {
        requestBody.customCode = customCode.trim();
      }
      
      const res = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ message: '短链创建成功', type: 'success' });
        setCreateTarget('');
        setCustomCode('');
        setHighlightedId(data.doc?._id);
        setTimeout(() => setHighlightedId(null), 800);
        fetchLinks();
      } else {
        setNotification({ message: data.error || '创建失败', type: 'error' });
      }
    } catch {
      setNotification({ message: '创建失败', type: 'error' });
    }
    setCreating(false);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span style={{ fontSize: 120, lineHeight: 1 }}>🤡</span>
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">你不是管理员，禁止访问！</div>
        <div className="text-lg text-gray-500 mb-8">请用管理员账号登录后再来玩哦~<br/><span className="text-rose-400">（小丑竟是你自己）</span></div>
        <div className="text-base text-gray-400 italic mt-4">仅限管理员使用，恶搞界面仅供娱乐。</div>
      </div>
    );
  }

  return (
    <motion.div 
      className="p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div 
        className="flex flex-col sm:flex-row sm:items-center mb-4 gap-3"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      >
        <motion.input
            className="border border-gray-300 rounded-lg px-4 py-3 w-full focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-base bg-white shadow-sm"
          placeholder="搜索短链码或目标地址"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
            whileFocus={{ scale: 1.01, borderColor: '#3b82f6' }}
            whileHover={{ scale: 1.005, borderColor: '#60a5fa' }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <motion.button
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 hover:shadow-lg transition-all duration-150 text-base font-medium relative overflow-hidden min-w-[100px]"
          onClick={handleRefresh}
          disabled={refreshing}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <motion.div
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 1, repeat: refreshing ? Infinity : 0, ease: "linear" }}
        >
            <FaSync className="text-lg" />
          </motion.div>
          <span>刷新</span>
          {refreshing && (
            <motion.div
              className="absolute inset-0 bg-blue-400"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              style={{ transformOrigin: "left" }}
            />
          )}
        </motion.button>
      </motion.div>
      <motion.div 
        className="flex flex-col gap-2 mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <motion.div 
          className="flex flex-col gap-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        >
          {/* 目标地址输入 */}
        <motion.input
            className="border border-gray-300 rounded-lg px-4 py-3 w-full focus:ring-2 focus:ring-green-400 focus:border-green-400 text-base bg-white"
          placeholder="请输入要生成短链的目标地址（如 https://...）"
          value={createTarget}
          onChange={e => setCreateTarget(e.target.value)}
          disabled={creating}
            whileFocus={{ scale: 1.01, borderColor: '#22c55e' }}
            whileHover={{ scale: 1.005, borderColor: '#4ade80' }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          />
          
          {/* 自定义码输入区域 */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <div className="flex flex-1">
              <motion.input
                className="border border-gray-300 rounded-l-lg px-4 py-3 w-full focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-base bg-white"
                placeholder="自定义短链接码（可选）"
                value={customCode}
                onChange={e => {
                  setCustomCode(e.target.value);
                  validateCustomCode(e.target.value);
                }}
                disabled={creating}
                whileFocus={{ scale: 1.01, borderColor: codeValidation?.isValid ? '#22c55e' : codeValidation?.isValid === false ? '#ef4444' : '#f59e0b' }}
                whileHover={{ scale: 1.005, borderColor: '#fb923c' }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <motion.button
                className="border border-l-0 border-gray-300 rounded-r-lg px-4 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors relative overflow-hidden shadow-sm"
                onClick={generateRandomCode}
                disabled={creating}
                title="生成随机短链接码"
                whileHover={{ scale: 1.02, backgroundColor: '#fed7aa' }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <motion.div
                  animate={{ rotate: customCode ? 360 : 0 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                >
                  <FaDice className="text-lg" />
                </motion.div>
                <motion.div
                  className="absolute inset-0 bg-orange-300 opacity-0"
                  whileHover={{ opacity: 0.2 }}
                  transition={{ duration: 0.2 }}
                />
              </motion.button>
            </div>
            
            {/* 创建按钮 */}
            <motion.button
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-md hover:from-purple-600 hover:to-pink-600 hover:shadow-lg transition-all duration-150 text-base font-medium relative overflow-hidden min-w-[120px]"
          onClick={handleCreate}
          disabled={creating}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <motion.span
                animate={{ opacity: creating ? 0.7 : 1 }}
                transition={{ duration: 0.3 }}
        >
          {creating ? '创建中…' : '创建短链'}
              </motion.span>
                          {creating && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                style={{ transformOrigin: "left" }}
              />
            )}
            </motion.button>
          </motion.div>
        </motion.div>
        
        <AnimatePresence>
          {customCode.trim() && (
            <motion.div 
              className="flex items-center justify-between text-sm text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200"
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ 
                duration: 0.4, 
                ease: "easeInOut",
                opacity: { duration: 0.3 },
                height: { duration: 0.4 }
              }}
            >
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                💡 自定义短链接码提示：只能包含字母、数字、连字符(-)和下划线(_)，长度1-200个字符。留空则自动生成随机短链接码。
              </motion.span>
              <motion.button
                className="text-orange-600 hover:text-orange-800 text-xs underline relative"
                onClick={clearCustomCode}
                whileHover={{ scale: 1.1, color: '#ea580c' }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <motion.span
                  whileHover={{ x: 2 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  清除
                </motion.span>
        </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {codeValidation && (
            <motion.div 
              className={`flex items-center gap-2 text-xs p-2 rounded border ${
                codeValidation.isValid 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <motion.div
                animate={{ rotate: codeValidation.isValid ? 0 : 180 }}
                transition={{ duration: 0.3 }}
              >
                {codeValidation.isValid ? '✅' : '❌'}
              </motion.div>
              <span>{codeValidation.message}</span>
              {codeValidation.isValid && (
                <motion.div
                  className="flex-1 h-1 bg-green-200 rounded-full overflow-hidden"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <motion.div
                    className="h-full bg-green-500"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {/* 桌面端表格视图 */}
      <motion.div 
        className="hidden md:block overflow-x-auto rounded shadow bg-white"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      >
        <table className="min-w-full text-sm text-gray-700 bg-white rounded-lg shadow-sm">
          <motion.thead
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                              <th className="py-3 px-3 text-left font-semibold text-gray-700">短链码</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">目标地址</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">创建时间</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">用户</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">用户ID</th>
                <th className="py-3 px-3 text-center font-semibold text-gray-700">操作</th>
            </tr>
          </motion.thead>
          <motion.tbody
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            {loading ? (
              <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <td colSpan={6} className="text-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="inline-block mr-3 text-2xl"
                  >
                    ⏳
                  </motion.div>
                  <div className="text-lg font-medium text-gray-600">加载中…</div>
                </td>
              </motion.tr>
            ) : links.length === 0 ? (
              <motion.tr
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="inline-block mr-3 text-3xl"
                  >
                    📝
                  </motion.div>
                  <div className="text-lg font-medium text-gray-500">暂无短链</div>
                  <div className="text-sm text-gray-400 mt-1">快去生成吧！</div>
                </td>
              </motion.tr>
            ) : links.map((link, index) => (
              <motion.tr
                key={link._id}
                className={`border-b border-gray-100 hover:bg-gray-50 ${highlightedId === link._id ? 'bg-green-100' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.4, 
                  delay: index * 0.05,
                  type: "spring",
                  stiffness: 200,
                  damping: 20
                }}
                whileHover={{ y: -2, scale: 1.01, backgroundColor: highlightedId === link._id ? '#dcfce7' : '#f8fafc' }}
              >
                <motion.td 
                  className="py-3 px-3 font-mono text-blue-600 break-all max-w-[120px] sm:max-w-xs cursor-pointer hover:text-blue-800 transition font-semibold"
                  onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {link.code}
                </motion.td>
                <td className="py-3 px-3 break-all max-w-[180px] sm:max-w-xs text-gray-700">{link.target}</td>
                <td className="py-3 px-3 whitespace-nowrap text-gray-600">{new Date(link.createdAt).toLocaleString()}</td>
                <td className="py-3 px-3 break-all max-w-[80px] sm:max-w-[120px] text-gray-700 font-medium">{link.username || 'admin'}</td>
                <td className="py-3 px-3 break-all max-w-[80px] sm:max-w-[120px] text-gray-500 text-xs">{link.userId || 'admin'}</td>
                <td className="py-3 px-3 text-center flex gap-2 justify-center">
                  <motion.button
                    className="flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg px-2 py-1 sm:px-2 sm:py-1 text-lg sm:text-base shadow-sm hover:shadow-md transition-all duration-150 relative group"
                    title="复制短链"
                    onClick={() => handleCopy(link.code)}
                    data-copy-code={link.code}
                    whileHover={{ scale: 1.1, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <FaCopy />
                    <motion.span 
                      className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-20"
                      initial={{ opacity: 0, y: 5 }}
                      whileHover={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      复制
                    </motion.span>
                  </motion.button>
                  <motion.button
                    className="flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg px-2 py-1 sm:px-2 sm:py-1 text-lg sm:text-base shadow-sm hover:shadow-md transition-all duration-150 relative group"
                    title="删除"
                    onClick={() => handleDelete(link._id)}
                    whileHover={{ scale: 1.1, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <FaTrash />
                    <motion.span 
                      className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition whitespace-nowrap z-20"
                      initial={{ opacity: 0, y: 5 }}
                      whileHover={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      删除
                    </motion.span>
                  </motion.button>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </motion.div>

      {/* 移动端卡片列表视图 */}
      <motion.div 
        className="md:hidden space-y-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      >
        {loading ? (
          <motion.div
            className="bg-white rounded-lg shadow p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="inline-block mr-2 text-2xl"
            >
              ⏳
            </motion.div>
            <div className="text-lg font-medium text-gray-600">加载中…</div>
          </motion.div>
        ) : links.length === 0 ? (
          <motion.div
            className="bg-white rounded-lg shadow p-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block mr-2 text-3xl"
            >
              📝
            </motion.div>
            <div className="text-lg font-medium text-gray-500">暂无短链</div>
            <div className="text-sm text-gray-400 mt-1">快去生成吧！</div>
          </motion.div>
        ) : links.map((link, index) => (
          <motion.div
            key={link._id}
            className={`bg-white rounded-lg shadow-sm border border-gray-100 p-4 ${highlightedId === link._id ? 'ring-2 ring-green-200 bg-green-50' : ''}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 0.4, 
              delay: index * 0.05,
              type: "spring",
              stiffness: 200,
              damping: 20
            }}
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* 短链码区域 */}
            <div className="flex items-center justify-between mb-3">
              <motion.div
                className="font-mono text-lg font-bold text-blue-600 cursor-pointer"
                onClick={() => window.open(`${getApiBaseUrl()}/s/${link.code}`, '_blank')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {link.code}
              </motion.div>
              <div className="flex gap-2">
                <motion.button
                  className="flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-150"
                  title="复制短链"
                  onClick={() => handleCopy(link.code)}
                  data-copy-code={link.code}
                  whileHover={{ scale: 1.1, y: -1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <FaCopy className="text-sm" />
                </motion.button>
                <motion.button
                  className="flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg p-2 shadow-sm hover:shadow-md transition-all duration-150"
                  title="删除"
                  onClick={() => handleDelete(link._id)}
                  whileHover={{ scale: 1.1, y: -1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <FaTrash className="text-sm" />
                </motion.button>
              </div>
            </div>

            {/* 目标地址 */}
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">目标地址</div>
              <div className="text-sm text-gray-700 break-all line-clamp-2">{link.target}</div>
            </div>

            {/* 底部信息 */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-gray-400">用户:</span>
                  <span className="ml-1">{link.username || 'admin'}</span>
      </div>
                <div>
                  <span className="text-gray-400">时间:</span>
                  <span className="ml-1">{new Date(link.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
              <div className="text-gray-400">
                {new Date(link.createdAt).toLocaleTimeString()}
              </div>
    </div>
          </motion.div>
        ))}
      </motion.div>
      <motion.div 
        className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6, ease: "easeOut" }}
      >
        <motion.span 
          className="text-gray-500 text-base text-center sm:text-left"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          共 {total} 条短链
        </motion.span>
        <motion.div 
          className="flex flex-row gap-3 w-full sm:w-auto justify-center items-center"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
        >
          <motion.button 
            disabled={page <= 1} 
            onClick={() => setPage(page - 1)} 
            className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-base font-medium min-w-[80px] shadow-sm hover:shadow-md transition-all duration-150"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            上一页
          </motion.button>
          <motion.span 
            className="px-4 py-3 text-base font-medium flex items-center justify-center min-w-[80px] text-center bg-white border border-gray-300 rounded-lg shadow-sm"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.9 }}
          >
            {page} / {totalPages || 1}
          </motion.span>
          <motion.button 
            disabled={page >= totalPages} 
            onClick={() => setPage(page + 1)} 
            className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-base font-medium min-w-[80px] shadow-sm hover:shadow-md transition-all duration-150"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            下一页
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default ShortLinkManager; 