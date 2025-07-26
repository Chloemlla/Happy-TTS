import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';
import { api } from '../api/index';
import { useAuth } from '../hooks/useAuth';
import CryptoJS from 'crypto-js';

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

interface CommandHistory {
  historyId: string;
  command: string;
  result: string;
  executedAt: string;
  status: 'success' | 'failed';
  executionTime: number;
  errorMessage: string;
}

interface CommandQueueItem {
  commandId: string;
  command: string;
  addedAt: string;
  status: string;
}

interface ServerStatus {
  uptime: number;
  memory_usage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu_usage_percent: number;
  platform: string;
  arch: string;
  node_version: string;
}

const CommandManager: React.FC = () => {
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const [command, setCommand] = useState('');
  const [password, setPassword] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [commandQueue, setCommandQueue] = useState<CommandQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 检查管理员权限
  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center text-white"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="text-8xl mb-6"
          >
            🚀
          </motion.div>
          <h1 className="text-4xl font-bold mb-4">🚀 火箭发射中心 🚀</h1>
          <p className="text-xl mb-6">正在准备发射到火星...</p>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="text-6xl mb-4"
          >
            🌌
          </motion.div>
          <p className="text-lg opacity-75">只有管理员才能访问命令控制台</p>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-8 text-2xl"
          >
            🛸 👾 🎮
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // 获取服务器状态
  const fetchServerStatus = async () => {
    try {
      const response = await api.post('/api/command/status', { password });
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          console.log('🔐 开始解密服务器状态数据...');
          console.log('   加密数据长度:', response.data.data.length);
          console.log('   IV:', response.data.iv);
          
          const token = localStorage.getItem('token');
          if (!token) {
            console.error('❌ Token不存在，无法解密数据');
            setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
            return;
          }
          
          console.log('   使用Token进行解密，Token长度:', token.length);
          
          // 解密数据
          const decryptedJson = decryptAES256(response.data.data, response.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);
          
          console.log('✅ 解密成功，获取到服务器状态数据');
          setServerStatus(decryptedData);
          setNotification({ message: '服务器状态获取成功', type: 'success' });
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
        console.log('📝 使用未加密格式数据');
        setServerStatus(response.data);
        setNotification({ message: '服务器状态获取成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '获取服务器状态失败', 
        type: 'error' 
      });
    }
  };

  // 执行命令
  const executeCommand = async () => {
    if (!command.trim() || !password.trim()) {
      setNotification({ message: '请输入命令和管理员密码', type: 'warning' });
      return;
    }

    setIsExecuting(true);
    try {
      const response = await api.post('/api/command/execute', { command, password });
      
      const newHistory: CommandHistory = {
        historyId: Date.now().toString(),
        command: command,
        result: response.data.output,
        executedAt: new Date().toISOString(),
        status: 'success',
        executionTime: 0,
        errorMessage: ''
      };
      
      setCommandHistory(prev => [newHistory, ...prev.slice(0, 9)]); // 保留最近10条
      setCommand('');
      setNotification({ message: '命令执行成功', type: 'success' });
    } catch (error: any) {
      const newHistory: CommandHistory = {
        historyId: Date.now().toString(),
        command: command,
        result: error.response?.data?.error || '命令执行失败',
        executedAt: new Date().toISOString(),
        status: 'failed',
        executionTime: 0,
        errorMessage: error.response?.data?.error || '命令执行失败'
      };
      
      setCommandHistory(prev => [newHistory, ...prev.slice(0, 9)]);
      setNotification({ 
        message: error.response?.data?.error || '命令执行失败', 
        type: 'error' 
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 添加命令到队列
  const addToQueue = async () => {
    if (!command.trim() || !password.trim()) {
      setNotification({ message: '请输入命令和管理员密码', type: 'warning' });
      return;
    }

    try {
      await api.post('/api/command/y', { command, password });
      // 这里暂时不更新本地队列，因为现在队列数据来自后端
      // setCommandQueue(prev => [...prev, command]);
      setCommand('');
      setNotification({ message: '命令已添加到队列', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '添加命令失败', 
        type: 'error' 
      });
    }
  };

  // 加载命令队列
  const loadCommandQueue = async () => {
    if (isLoadingQueue || queueLoaded) return;
    
    setIsLoadingQueue(true);
    try {
      const response = await api.get('/api/command/q');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          console.log('🔐 开始解密命令队列数据...');
          console.log('   加密数据长度:', response.data.data.length);
          console.log('   IV:', response.data.iv);
          
          const token = localStorage.getItem('token');
          if (!token) {
            console.error('❌ Token不存在，无法解密数据');
            setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
            return;
          }
          
          console.log('   使用Token进行解密，Token长度:', token.length);
          
          // 解密数据
          const decryptedJson = decryptAES256(response.data.data, response.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);
          
          console.log('✅ 解密成功，获取到命令队列数据');
          
          if (Array.isArray(decryptedData)) {
            setCommandQueue(decryptedData);
          } else if (decryptedData.command) {
            setCommandQueue([decryptedData]);
          } else {
            setCommandQueue([]);
          }
          setQueueLoaded(true);
          setNotification({ message: '命令队列加载成功', type: 'success' });
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
        console.log('📝 使用未加密格式数据');
        if (Array.isArray(response.data)) {
          setCommandQueue(response.data);
        } else if (response.data.command) {
          setCommandQueue([response.data]);
        } else {
          setCommandQueue([]);
        }
        setQueueLoaded(true);
        setNotification({ message: '命令队列加载成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '加载命令队列失败', 
        type: 'error' 
      });
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // 获取下一个命令（保持原有功能）
  const getNextCommand = async () => {
    try {
      const response = await api.get('/api/command/q');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          console.log('🔐 开始解密命令队列数据...');
          console.log('   加密数据长度:', response.data.data.length);
          console.log('   IV:', response.data.iv);
          
          const token = localStorage.getItem('token');
          if (!token) {
            console.error('❌ Token不存在，无法解密数据');
            setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
            return;
          }
          
          console.log('   使用Token进行解密，Token长度:', token.length);
          
          // 解密数据
          const decryptedJson = decryptAES256(response.data.data, response.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);
          
          console.log('✅ 解密成功，获取到命令队列数据');
          
          if (decryptedData.command) {
            setNotification({ 
              message: `下一个命令: ${decryptedData.command}`, 
              type: 'info' 
            });
          } else {
            setNotification({ message: '队列中没有命令', type: 'info' });
          }
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
        console.log('📝 使用未加密格式数据');
        if (response.data.command) {
          setNotification({ 
            message: `下一个命令: ${response.data.command}`, 
            type: 'info' 
          });
        } else {
          setNotification({ message: '队列中没有命令', type: 'info' });
        }
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '获取命令失败', 
        type: 'error' 
      });
    }
  };

  // 移除命令
  const removeCommand = async (commandId: string) => {
    try {
      await api.post('/api/command/p', { commandId });
      setCommandQueue(prev => prev.filter(cmd => cmd.commandId !== commandId));
      setNotification({ message: '命令已从队列移除', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '移除命令失败', 
        type: 'error' 
      });
    }
  };

  // 加载执行历史
  const loadExecutionHistory = async () => {
    if (isLoadingHistory || historyLoaded) return;
    
    setIsLoadingHistory(true);
    try {
      const response = await api.get('/api/command/history');
      
      // 检查是否为加密数据
      if (response.data.data && response.data.iv && typeof response.data.data === 'string' && typeof response.data.iv === 'string') {
        try {
          console.log('🔐 开始解密执行历史数据...');
          console.log('   加密数据长度:', response.data.data.length);
          console.log('   IV:', response.data.iv);
          
          const token = localStorage.getItem('token');
          if (!token) {
            console.error('❌ Token不存在，无法解密数据');
            setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
            return;
          }
          
          console.log('   使用Token进行解密，Token长度:', token.length);
          
          // 解密数据
          const decryptedJson = decryptAES256(response.data.data, response.data.iv, token);
          const decryptedData = JSON.parse(decryptedJson);
          
          console.log('✅ 解密成功，获取到执行历史数据');
          
          if (Array.isArray(decryptedData)) {
            setCommandHistory(decryptedData);
          } else {
            setCommandHistory([]);
          }
          setHistoryLoaded(true);
          setNotification({ message: '执行历史加载成功', type: 'success' });
        } catch (decryptError) {
          console.error('❌ 解密失败:', decryptError);
          setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
        }
      } else {
        // 兼容未加密格式
        console.log('📝 使用未加密格式数据');
        if (Array.isArray(response.data)) {
          setCommandHistory(response.data);
        } else {
          setCommandHistory([]);
        }
        setHistoryLoaded(true);
        setNotification({ message: '执行历史加载成功', type: 'success' });
      }
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '加载执行历史失败', 
        type: 'error' 
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // 清空历史记录
  const clearHistory = async () => {
    try {
      await api.post('/api/command/clear-history', { password });
      setCommandHistory([]);
      setHistoryLoaded(false);
      setNotification({ message: '历史记录已清空', type: 'success' });
    } catch (error: any) {
      setNotification({ 
        message: error.response?.data?.error || '清空历史记录失败', 
        type: 'error' 
      });
    }
  };

  // 格式化内存使用量
  const formatMemory = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  // 格式化运行时间
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          命令执行管理
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 命令执行区域 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                命令输入
              </label>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="输入要执行的命令..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={3}
              />
            </div>
            
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                管理员密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入管理员密码"
                  className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors duration-200 flex items-center justify-center w-8 h-8"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                💡 默认管理员密码: <code className="bg-gray-100 px-1 rounded">admin</code>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <motion.button
                onClick={executeCommand}
                disabled={isExecuting}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 sm:px-6 py-3 rounded-lg hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isExecuting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    执行中...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    执行命令
                  </span>
                )}
              </motion.button>
              
              <motion.button
                onClick={addToQueue}
                className="px-4 sm:px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl flex items-center justify-center"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </motion.button>
            </div>
          </div>

          {/* 服务器状态区域 */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">服务器状态</h3>
              <motion.button
                onClick={fetchServerStatus}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新
              </motion.button>
            </div>
            
            {serverStatus ? (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">运行时间:</span>
                    <div className="font-medium">{formatUptime(serverStatus.uptime)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">平台:</span>
                    <div className="font-medium">{serverStatus.platform}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">架构:</span>
                    <div className="font-medium">{serverStatus.arch}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Node版本:</span>
                    <div className="font-medium">{serverStatus.node_version}</div>
                  </div>
                </div>
                
                <div>
                  <span className="text-gray-600 text-sm">内存使用:</span>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                    <div>RSS: {formatMemory(serverStatus.memory_usage.rss)}</div>
                    <div>堆内存: {formatMemory(serverStatus.memory_usage.heapUsed)}</div>
                  </div>
                </div>
                
                <div>
                  <span className="text-gray-600 text-sm">CPU使用率:</span>
                  <div className="font-medium">{serverStatus.cpu_usage_percent.toFixed(2)}%</div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                点击刷新获取服务器状态
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 命令队列管理 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            命令队列
          </h3>
          <div className="flex gap-2">
            {!queueLoaded && (
              <motion.button
                onClick={loadCommandQueue}
                disabled={isLoadingQueue}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoadingQueue ? (
                  <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isLoadingQueue ? '加载中...' : '加载队列'}
              </motion.button>
            )}
            <motion.button
              onClick={getNextCommand}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              查看下一个
            </motion.button>
          </div>
        </div>
        
        {!queueLoaded ? (
          <div className="text-center text-gray-500 py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p>点击"加载队列"查看命令队列</p>
          </div>
        ) : commandQueue.length > 0 ? (
          <div className="space-y-2">
            {commandQueue.map((cmd, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3 gap-3"
              >
                <span className="font-mono text-sm text-gray-700 break-all flex-1">{cmd.command}</span>
                <motion.button
                  onClick={() => removeCommand(cmd.commandId)}
                  className="text-red-500 hover:text-red-700 transition-colors p-2 rounded-full hover:bg-red-50 flex items-center justify-center"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </motion.button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p>命令队列为空</p>
          </div>
        )}
      </motion.div>

      {/* 执行历史 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            执行历史
          </h3>
          <div className="flex gap-2">
            {!historyLoaded && (
              <motion.button
                onClick={loadExecutionHistory}
                disabled={isLoadingHistory}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoadingHistory ? (
                  <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isLoadingHistory ? '加载中...' : '加载历史'}
              </motion.button>
            )}
            <motion.button
              onClick={clearHistory}
              className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg hover:from-red-600 hover:to-pink-700 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              清空历史
            </motion.button>
          </div>
        </div>
        
        <AnimatePresence>
          {!historyLoaded ? (
            <div className="text-center text-gray-500 py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>点击"加载历史"查看执行历史</p>
            </div>
          ) : commandHistory.length > 0 ? (
            <div className="space-y-4">
              {commandHistory.map((item) => (
                <motion.div
                  key={item.historyId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`border rounded-lg p-4 ${
                    item.status === 'success' 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${
                        item.status === 'success' ? 'text-green-600' : 'text-red-600'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-mono text-sm font-medium">{item.command}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === 'success' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.status === 'success' ? '成功' : '失败'}
                      </span>
                      <span className="text-xs text-gray-500">{item.executedAt}</span>
                    </div>
                  </div>
                  <div className="bg-white rounded p-3 border">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap overflow-x-auto">
                      {item.result}
                    </pre>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>暂无执行历史</p>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default CommandManager; 