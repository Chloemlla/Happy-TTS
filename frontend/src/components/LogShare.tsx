import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import CryptoJS from 'crypto-js';

const isTextExt = (ext: string) => ['.txt', '.log', '.json', '.md'].includes(ext);

// 安全的解码函数，支持多种编码格式
const safeDecode = (decrypted: any): any => {
  console.log('🔓 [LogShare] 开始解码解密数据...');
  console.log('    解密数据类型:', typeof decrypted);
  console.log('    解密数据长度:', decrypted ? decrypted.length : 'undefined');
  
  // 首先尝试直接转换为UTF-8字符串
  try {
    const utf8String = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('🔓 [LogShare] UTF-8解码结果:', utf8String.substring(0, 100) + '...');
    const parsedData = JSON.parse(utf8String);
    console.log('🔓 [LogShare] JSON解析成功');
    return parsedData;
  } catch (error) {
    console.log('🔓 [LogShare] UTF-8解码失败:', error);
  }
  
  // 如果UTF-8失败，尝试其他编码
  const encodings = [
    { name: 'Base64', decoder: () => {
      const base64 = decrypted.toString(CryptoJS.enc.Base64);
      return atob(base64);
    }},
    { name: 'Hex', decoder: () => {
      const hex = decrypted.toString(CryptoJS.enc.Hex);
      const hexBytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
      return new TextDecoder().decode(hexBytes);
    }},
    { name: 'Latin1', decoder: () => {
      return decrypted.toString(CryptoJS.enc.Latin1);
    }}
  ];

  for (const encoding of encodings) {
    try {
      console.log(`🔓 [LogShare] 尝试${encoding.name}解码...`);
      const decodedString = encoding.decoder();
      console.log(`🔓 [LogShare] ${encoding.name}解码结果:`, decodedString.substring(0, 100) + '...');
      const parsedData = JSON.parse(decodedString);
      console.log(`🔓 [LogShare] ${encoding.name}解码成功`);
      return parsedData;
    } catch (error) {
      console.log(`🔓 [LogShare] ${encoding.name}解码失败:`, error);
      continue;
    }
  }
  
  // 如果所有编码都失败，尝试直接返回原始数据
  console.log('🔓 [LogShare] 所有编码方式都失败，尝试直接使用原始数据');
  try {
    if (typeof decrypted === 'object' && decrypted !== null) {
      return decrypted;
    }
  } catch (error) {
    console.log('🔓 [LogShare] 直接使用原始数据也失败:', error);
  }
  
  throw new Error('所有解码方式都失败，无法处理解密后的数据');
};

const LogShare: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [adminPassword, setAdminPassword] = useState('');
  const [logContent, setLogContent] = useState('');
  const [uploadResult, setUploadResult] = useState<{ link: string, ext: string } | null>(null);
  const [queryId, setQueryId] = useState('');
  const [queryResult, setQueryResult] = useState<{ content: string, ext: string, encoding?: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<{ link: string, ext: string, time: string }[]>(() => {
    const saved = localStorage.getItem('uploadHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [queryHistory, setQueryHistory] = useState<{ id: string, ext: string, time: string }[]>(() => {
    const saved = localStorage.getItem('queryHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const { setNotification } = useNotification();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [autoQueryId, setAutoQueryId] = useState<string | null>(null);
  const [allLogs, setAllLogs] = useState<{ id: string, ext: string, uploadTime: string, size: number }[]>([]);
  const [isLoadingAllLogs, setIsLoadingAllLogs] = useState(false);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);

  // 检查URL参数
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      setQueryId(id);
      setAutoQueryId(id);
    }
  }, [location.search]);

  // 管理员校验后自动弹窗输入密码
  useEffect(() => {
    if (user && user.role === 'admin' && autoQueryId) {
      setShowPwdModal(true);
    }
  }, [user, autoQueryId]);

  // 自动查询
  const handleAutoQuery = async () => {
    setShowPwdModal(false);
    if (adminPassword && autoQueryId) {
      setQueryId(autoQueryId);
      await handleQuery();
      setAutoQueryId(null);
    }
  };

  useEffect(() => {
    if (uploadResult && uploadResult.link) {
      // 安全地复制到剪贴板，处理焦点问题
      navigator.clipboard.writeText(uploadResult.link).then(() => {
        setNotification({ message: '上传成功，链接已复制', type: 'success' });
      }).catch((error) => {
        console.log('剪贴板复制失败:', error);
        setNotification({ message: '上传成功，但链接复制失败', type: 'success' });
      });
    }
  }, [uploadResult, setNotification]);

  // 上传日志/文件
  const handleUpload = async () => {
    setError('');
    setSuccess('');
    setUploadResult(null);
    setLoading(true);
    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('adminPassword', adminPassword);
        res = await axios.post(getApiBaseUrl() + '/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // 兼容纯文本上传
        const blob = new Blob([logContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, 'log.txt');
        formData.append('adminPassword', adminPassword);
        res = await axios.post(getApiBaseUrl() + '/api/sharelog', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      if (res.data.link) {
        setUploadResult({ link: res.data.link, ext: res.data.ext });
        setSuccess('上传成功！');
        const newItem = { link: res.data.link, ext: res.data.ext, time: new Date().toLocaleString() };
        const newHistory = [newItem, ...uploadHistory].slice(0, 10);
        setUploadHistory(newHistory);
        localStorage.setItem('uploadHistory', JSON.stringify(newHistory));
      } else {
        setError('上传失败');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 查询日志/文件
  const handleQuery = async () => {
    setError('');
    setSuccess('');
    setQueryResult(null);
    setLoading(true);
    
    console.log('🔓 [LogShare] 发送查询请求...');
    console.log('    查询ID:', queryId);
    console.log('    管理员密码长度:', adminPassword ? adminPassword.length : 0);
    console.log('    管理员密码预览:', adminPassword ? adminPassword.substring(0, 3) + '***' : 'undefined');
    
    try {
      const res = await axios.post(getApiBaseUrl() + `/api/sharelog/${queryId}`, {
        adminPassword,
        id: queryId
      });
      
      // 检查是否为加密数据
      if (res.data.data && res.data.iv) {
        console.log('🔓 [LogShare] 检测到加密数据，开始解密...');
        console.log('    数据类型:', typeof res.data);
        console.log('    数据字段:', Object.keys(res.data));
        
        if (!adminPassword) {
          throw new Error('管理员密码不存在，无法解密');
        }
        
        try {
          // 替换 CryptoJS.SHA256(adminPassword) 为 PBKDF2 派生
          const keyHash = CryptoJS.PBKDF2(adminPassword, 'logshare-salt', { keySize: 256/32, iterations: 10000, hasher: CryptoJS.algo.SHA512 }).toString(CryptoJS.enc.Hex);
          const key = CryptoJS.enc.Hex.parse(keyHash);
          const iv = CryptoJS.enc.Hex.parse(res.data.iv);
          const encryptedData = CryptoJS.enc.Hex.parse(res.data.data);
          
          const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encryptedData },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
          );
          
          console.log('🔓 [LogShare] CryptoJS解密结果:', decrypted);
          console.log('    解密结果类型:', typeof decrypted);
          console.log('    解密结果toString:', decrypted.toString());
          
          // 使用安全的解码函数
          const decryptedData = safeDecode(decrypted);
          
          console.log('🔓 [LogShare] 解密成功');
          console.log('    文件类型:', decryptedData.ext);
          
          setQueryResult(decryptedData);
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setError('数据解密失败: ' + (decryptError?.message || '未知错误'));
          return;
        }
      } else {
        // 未加密数据
        console.log('🔓 [LogShare] 未加密数据，直接使用');
        setQueryResult(res.data);
      }
      
      setSuccess('查询成功！');
      // 使用解密后的数据或原始数据来获取扩展名
      const ext = (res.data.data && res.data.iv) ? 
        (queryResult?.ext || 'unknown') : 
        (res.data.ext || 'unknown');
      const newItem = { id: queryId, ext: ext, time: new Date().toLocaleString() };
      const newHistory = [newItem, ...queryHistory].slice(0, 10);
      setQueryHistory(newHistory);
      localStorage.setItem('queryHistory', JSON.stringify(newHistory));
    } catch (e: any) {
      setError(e.response?.data?.error || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有日志列表
  const loadAllLogs = async () => {
    setIsLoadingAllLogs(true);
    try {
      const res = await axios.get(getApiBaseUrl() + '/api/sharelog/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      // 检查是否为加密数据
      if (res.data.data && res.data.iv) {
        console.log('🔓 [LogShare] 检测到加密数据，开始解密...');
        console.log('    数据类型:', typeof res.data);
        console.log('    数据字段:', Object.keys(res.data));
        
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Token不存在，无法解密');
        }
        
        try {
          // 替换 CryptoJS.SHA256(token) 为 PBKDF2 派生
          const keyHash = CryptoJS.PBKDF2(token, 'logshare-salt', { keySize: 256/32, iterations: 10000, hasher: CryptoJS.algo.SHA512 }).toString(CryptoJS.enc.Hex);
          const key = CryptoJS.enc.Hex.parse(keyHash);
          const iv = CryptoJS.enc.Hex.parse(res.data.iv);
          const encryptedData = CryptoJS.enc.Hex.parse(res.data.data);
          
          const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encryptedData },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
          );
          
          console.log('🔓 [LogShare] CryptoJS解密结果:', decrypted);
          console.log('    解密结果类型:', typeof decrypted);
          console.log('    解密结果toString:', decrypted.toString());
          
          // 使用安全的解码函数
          const decryptedData = safeDecode(decrypted);
          
          console.log('🔓 [LogShare] 解密成功');
          console.log('    日志数量:', decryptedData.logs?.length || 0);
          
          setAllLogs(decryptedData.logs || []);
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setNotification({ message: '数据解密失败: ' + (decryptError?.message || '未知错误'), type: 'error' });
          return;
        }
      } else {
        // 未加密数据
        console.log('🔓 [LogShare] 未加密数据，直接使用');
        setAllLogs(res.data.logs || []);
      }
      
      setNotification({ message: '日志列表加载成功', type: 'success' });
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '加载日志列表失败', type: 'error' });
    } finally {
      setIsLoadingAllLogs(false);
    }
  };

  // 查看指定日志
  const viewLog = async (logId: string) => {
    setLoading(true);
    try {
      const res = await axios.post(getApiBaseUrl() + `/api/sharelog/${logId}`, {
        adminPassword,
        id: logId
      });
      
      // 检查是否为加密数据
      if (res.data.data && res.data.iv) {
        console.log('🔓 [LogShare] 检测到加密数据，开始解密...');
        console.log('    数据类型:', typeof res.data);
        console.log('    数据字段:', Object.keys(res.data));
        
        if (!adminPassword) {
          throw new Error('管理员密码不存在，无法解密');
        }
        
        try {
          // 替换 CryptoJS.SHA256(adminPassword) 为 PBKDF2 派生
          const keyHash = CryptoJS.PBKDF2(adminPassword, 'logshare-salt', { keySize: 256/32, iterations: 10000, hasher: CryptoJS.algo.SHA512 }).toString(CryptoJS.enc.Hex);
          const key = CryptoJS.enc.Hex.parse(keyHash);
          const iv = CryptoJS.enc.Hex.parse(res.data.iv);
          const encryptedData = CryptoJS.enc.Hex.parse(res.data.data);
          
          const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encryptedData },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
          );
          
          console.log('🔓 [LogShare] CryptoJS解密结果:', decrypted);
          console.log('    解密结果类型:', typeof decrypted);
          console.log('    解密结果toString:', decrypted.toString());
          
          // 使用安全的解码函数
          const decryptedData = safeDecode(decrypted);
          
          console.log('🔓 [LogShare] 解密成功');
          console.log('    文件类型:', decryptedData.ext);
          
          setQueryResult(decryptedData);
        } catch (decryptError: any) {
          console.error('🔓 [LogShare] 解密失败:', decryptError);
          setNotification({ message: '数据解密失败: ' + (decryptError?.message || '未知错误'), type: 'error' });
          return;
        }
      } else {
        // 未加密数据
        console.log('🔓 [LogShare] 未加密数据，直接使用');
        setQueryResult(res.data);
      }
      
      setQueryId(logId);
      setSuccess('查看成功！');
    } catch (e: any) {
      setNotification({ message: e.response?.data?.error || '查看日志失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 下载文件
  const handleDownload = () => {
    if (!queryResult) return;
    const { content, ext, encoding } = queryResult;
    let blob;
    if (encoding === 'base64') {
      // 修正：base64转Uint8Array再转Blob，避免undefined
      const binaryString = atob(content);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes]);
    } else {
      blob = new Blob([content], { type: 'text/plain' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sharelog${ext || ''}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (error) {
      setNotification({ message: error, type: 'error' });
      setError('');
    }
  }, [error, setNotification]);

  useEffect(() => {
    if (success) {
      setNotification({ message: success, type: 'success' });
      setSuccess('');
    }
  }, [success, setNotification]);

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
            🤡
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              LogShare 仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <>
      {/* 全屏密码弹窗 */}
      <AnimatePresence>
        {showPwdModal && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-[9999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-xs relative"
              initial={{ scale: 0.95, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 40 }}
              transition={{ duration: 0.25 }}
            >
              <h3 className="text-lg font-bold mb-4 text-center">请输入管理员密码</h3>
              <input
                type="password"
                className="w-full border-2 border-green-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 transition-all"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                autoFocus
                placeholder="管理员密码"
                onKeyDown={e => { if (e.key === 'Enter') handleAutoQuery(); }}
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition"
                  onClick={handleAutoQuery}
                  disabled={!adminPassword}
                >查询日志</button>
                <button
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
                  onClick={() => setShowPwdModal(false)}
                >取消</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* 主体内容 */}
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
            📋
            日志/文件剪贴板上传 & 查询
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>支持文本、日志、json、压缩包等类型，单文件最大25KB。仅管理员可操作。</p>
            <div className="flex items-start gap-2 text-sm">
              <div>
                <p className="font-semibold text-blue-700">功能说明：</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>支持文件上传和文本粘贴</li>
                  <li>自动生成分享链接</li>
                  <li>支持加密存储和查询</li>
                  <li>提供历史记录管理</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* 上传区块 */}
        <motion.div 
          className="bg-blue-50 rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              📤
              上传日志/文件
            </h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                管理员密码
              </label>
              <input 
                type="password" 
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" 
                value={adminPassword} 
                onChange={e => setAdminPassword(e.target.value)} 
                autoComplete="off"
              />
            </div>
            
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                日志内容（粘贴或输入）或选择文件
              </label>
              <textarea 
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" 
                rows={6} 
                value={logContent} 
                onChange={e => setLogContent(e.target.value)} 
                disabled={!!file} 
                placeholder="可直接粘贴日志内容，或选择文件上传"
              />
            </div>
            
            <div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="mb-2" 
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <div className="text-xs text-gray-400 mb-2">
                支持 .txt .log .json .md .zip .tar.gz 等，最大25KB
              </div>
            </div>
            
            <AnimatePresence>
              {file && (
                <motion.div 
                  className="text-sm text-gray-600 mb-2"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  已选择文件: {file.name} 
                  <button 
                    className="ml-2 text-red-500 hover:underline" 
                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  >
                    移除
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            <motion.button 
              className={`px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 font-medium flex items-center gap-2`} 
              onClick={handleUpload} 
              disabled={loading || !adminPassword || (!logContent && !file)}
              whileTap={{ scale: 0.95 }}
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
              {loading ? '上传中...' : '上传日志/文件'}
            </motion.button>
            
            <AnimatePresence>
              {uploadResult && uploadResult.link && (
                <motion.div 
                  className="mt-3 text-green-600 font-semibold flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
                >
                  上传成功，访问链接：
                  <a href={uploadResult.link} className="underline" target="_blank" rel="noopener noreferrer">
                    {uploadResult.link}
                  </a> 
                  <span className="text-gray-500">({uploadResult.ext})</span>
                  <AnimatePresence>
                    {copied && (
                      <motion.span 
                        className="ml-2 text-green-500 text-sm"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                      >
                        已自动复制
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        
        {/* 查询区块 */}
        <motion.div 
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              🔍
              查询日志/文件内容
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <motion.button
                onClick={loadAllLogs}
                disabled={isLoadingAllLogs}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                {isLoadingAllLogs ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isLoadingAllLogs ? '加载中...' : '查看所有日志'}
              </motion.button>
            </div>

            {/* 所有日志列表 */}
            {allLogs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4"
              >
                <h4 className="text-sm font-semibold text-gray-700 mb-2">所有日志列表 ({allLogs.length})</h4>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {allLogs.map((log, index) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center justify-between p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                        selectedLogIndex === index ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                      onClick={() => {
                        setSelectedLogIndex(index);
                        viewLog(log.id);
                      }}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {log.id}
                        </div>
                        <div className="text-xs text-gray-500">
                          {log.ext} • {new Date(log.uploadTime).toLocaleString()} • {(log.size / 1024).toFixed(1)}KB
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
            
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                日志/文件ID
              </label>
              <input 
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" 
                value={queryId} 
                onChange={e => setQueryId(e.target.value)} 
                placeholder="请输入上传后返回的ID"
              />
            </div>
            
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                管理员密码
              </label>
              <input 
                type="password" 
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" 
                value={adminPassword} 
                onChange={e => setAdminPassword(e.target.value)} 
                autoComplete="off"
              />
            </div>
            
            <motion.button 
              className={`px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 font-medium flex items-center gap-2`} 
              onClick={handleQuery} 
              disabled={loading || !adminPassword || !queryId}
              whileTap={{ scale: 0.95 }}
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              {loading ? '查询中...' : '查询日志/文件'}
            </motion.button>
            
            <AnimatePresence>
              {queryResult && (
                <motion.div 
                  className="mt-4"
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
                >
                  <div className="mb-2 text-gray-600">
                    类型: {queryResult.ext ? queryResult.ext : '未知'} {queryResult.encoding && <span>({queryResult.encoding})</span>}
                  </div>
                  {isTextExt(queryResult.ext) ? (
                    <div>
                      <div className="mb-2 text-yellow-700">
                        文本文件预览：
                      </div>
                      <pre className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap max-h-64 overflow-auto border border-gray-200 mb-3">
                        {queryResult.content}
                      </pre>
                      <motion.button 
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 flex items-center gap-2" 
                        onClick={handleDownload}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        下载文本文件
                      </motion.button>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-yellow-700">
                        二进制/非文本文件，点击下载：
                      </div>
                      <motion.button 
                        className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all duration-200 flex items-center gap-2" 
                        onClick={handleDownload}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        下载文件
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        
        {/* 历史记录 */}
        <motion.div 
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            📋
            历史记录
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 上传历史 */}
            <div>
              <h4 className="text-md font-semibold text-blue-700 mb-3">上传历史</h4>
              <div className="space-y-2">
                {uploadHistory.length === 0 && (
                  <div className="text-gray-400 text-sm">暂无上传记录</div>
                )}
                {uploadHistory.map((item, idx) => (
                  <motion.div 
                    key={idx} 
                    className="text-sm flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 * idx }}
                    whileHover={{ scale: 1.02, x: 5 }}
                  >
                    <a 
                      href={item.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="underline text-blue-600 truncate flex-1"
                    >
                      {item.link}
                    </a>
                    <span className="text-gray-500 text-xs">({item.ext})</span>
                    <span className="text-gray-400 text-xs">{item.time}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            
            {/* 查询历史 */}
            <div>
              <h4 className="text-md font-semibold text-green-700 mb-3">查询历史</h4>
              <div className="space-y-2">
                {queryHistory.length === 0 && (
                  <div className="text-gray-400 text-sm">暂无查询记录</div>
                )}
                {queryHistory.map((item, idx) => (
                  <motion.div 
                    key={idx} 
                    className="text-sm flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 * idx }}
                    whileHover={{ scale: 1.02, x: -5 }}
                  >
                    <button 
                      className="underline text-green-600 truncate flex-1 text-left" 
                      onClick={() => { setQueryId(item.id); setQueryResult(null); setSuccess(''); setError(''); }}
                    >
                      {item.id}
                    </button>
                    <span className="text-gray-500 text-xs">{item.ext ? `(${item.ext})` : ''}</span>
                    <span className="text-gray-400 text-xs">{item.time}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* 全局提示 */}
        {/* 所有提示已用 setNotification 全局弹窗替换 */}
      </motion.div>
    </>
  );
};

export default LogShare;
