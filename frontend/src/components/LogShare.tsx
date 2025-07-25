import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';

const isTextExt = (ext: string) => ['.txt', '.log', '.json', '.md'].includes(ext);

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
      navigator.clipboard.writeText(uploadResult.link).then(() => {
        setNotification({ message: '上传成功，链接已复制', type: 'success' });
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
    try {
      const res = await axios.post(getApiBaseUrl() + `/api/sharelog/${queryId}`, {
        adminPassword,
        id: queryId
      });
      setQueryResult(res.data);
      setSuccess('查询成功！');
      const newItem = { id: queryId, ext: res.data.ext, time: new Date().toLocaleString() };
      const newHistory = [newItem, ...queryHistory].slice(0, 10);
      setQueryHistory(newHistory);
      localStorage.setItem('queryHistory', JSON.stringify(newHistory));
    } catch (e: any) {
      setError(e.response?.data?.error || '查询失败');
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
        className="flex flex-col items-center justify-center min-h-[60vh] text-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <span style={{ fontSize: 120, lineHeight: 1 }}>
          🤡
        </span>
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">
          你不是管理员，禁止访问！
        </div>
        <div className="text-lg text-gray-500 mb-8">
          请用管理员账号登录后再来玩哦~<br/>
          <span className="text-rose-400">（小丑竟是你自己）</span>
        </div>
        <div className="text-base text-gray-400 italic mt-4">
          LogShare 仅限管理员使用，恶搞界面仅供娱乐。
        </div>
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
        className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl p-10 mt-12 border border-blue-100"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.h2 
          className="text-3xl font-extrabold mb-2 text-blue-700 flex items-center gap-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <motion.i 
            className="fas fa-clipboard-list text-blue-500 text-2xl"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
            whileHover={{ scale: 1.1, rotate: 5 }}
          />
          日志/文件剪贴板上传 & 查询
        </motion.h2>
        
        <motion.p 
          className="text-gray-500 mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          支持文本、日志、json、压缩包等类型，单文件最大25KB。仅管理员可操作。
        </motion.p>
        
        {/* 上传区块 */}
        <motion.div 
          className="mb-10 p-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 shadow-sm"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          whileHover={{ scale: 1.01, y: -2 }}
        >
          <motion.div 
            className="mb-4 text-lg font-semibold text-blue-800 flex items-center gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <motion.i 
              className="fas fa-upload"
              whileHover={{ scale: 1.1, rotate: 5 }}
            />
            上传日志/文件
          </motion.div>
          
          <motion.label 
            className="block mb-2 font-semibold"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.6 }}
          >
            管理员密码
          </motion.label>
          <motion.input 
            type="password" 
            className="w-full border-2 border-blue-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200 hover:border-blue-300" 
            value={adminPassword} 
            onChange={e => setAdminPassword(e.target.value)} 
            autoComplete="off"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.7 }}
            whileFocus={{ scale: 1.02 }}
          />
          
          <motion.label 
            className="block mb-2 font-semibold"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.8 }}
          >
            日志内容（粘贴或输入）或选择文件
          </motion.label>
          <motion.textarea 
            className="w-full border-2 border-blue-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200 hover:border-blue-300" 
            rows={6} 
            value={logContent} 
            onChange={e => setLogContent(e.target.value)} 
            disabled={!!file} 
            placeholder="可直接粘贴日志内容，或选择文件上传"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.9 }}
            whileFocus={{ scale: 1.01 }}
          />
          
          <motion.input 
            type="file" 
            ref={fileInputRef} 
            className="mb-2" 
            onChange={e => setFile(e.target.files?.[0] || null)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 1.0 }}
          />
          
          <motion.div 
            className="text-xs text-gray-400 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 1.1 }}
          >
            支持 .txt .log .json .md .zip .tar.gz 等，最大25KB
          </motion.div>
          
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
                <motion.button 
                  className="ml-2 text-red-500 hover:underline" 
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  移除
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          
          <motion.button 
            className={`mt-2 bg-gradient-to-r from-blue-500 to-blue-400 text-white px-6 py-2 rounded-lg shadow hover:from-blue-600 hover:to-blue-500 transition-all font-bold flex items-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`} 
            onClick={handleUpload} 
            disabled={loading || !adminPassword || (!logContent && !file)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.2 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? (
              <motion.span 
                className="mr-2"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <i className="fas fa-spinner" />
              </motion.span>
            ) : (
              <motion.i 
                className="fas fa-cloud-upload-alt"
                whileHover={{ scale: 1.1 }}
              />
            )}
            上传日志/文件
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
        </motion.div>
        
        {/* 查询区块 */}
        <motion.div 
          className="mb-6 p-6 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 shadow-sm"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          whileHover={{ scale: 1.01, y: -2 }}
        >
          <motion.div 
            className="mb-4 text-lg font-semibold text-green-800 flex items-center gap-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <motion.i 
              className="fas fa-search"
              whileHover={{ scale: 1.1, rotate: 5 }}
            />
            查询日志/文件内容
          </motion.div>
          
          <motion.label 
            className="block mb-2 font-semibold"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.7 }}
          >
            日志/文件ID
          </motion.label>
          <motion.input 
            className="w-full border-2 border-green-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 transition-all duration-200 hover:border-green-300" 
            value={queryId} 
            onChange={e => setQueryId(e.target.value)} 
            placeholder="请输入上传后返回的ID"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.8 }}
            whileFocus={{ scale: 1.02 }}
          />
          
          <motion.label 
            className="block mb-2 font-semibold"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.9 }}
          >
            管理员密码
          </motion.label>
          <motion.input 
            type="password" 
            className="w-full border-2 border-green-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 transition-all duration-200 hover:border-green-300" 
            value={adminPassword} 
            onChange={e => setAdminPassword(e.target.value)} 
            autoComplete="off"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 1.0 }}
            whileFocus={{ scale: 1.02 }}
          />
          
          <motion.button 
            className={`bg-gradient-to-r from-green-500 to-green-400 text-white px-6 py-2 rounded-lg shadow hover:from-green-600 hover:to-green-500 transition-all font-bold flex items-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`} 
            onClick={handleQuery} 
            disabled={loading || !adminPassword || !queryId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.1 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? (
              <motion.span 
                className="mr-2"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <i className="fas fa-spinner" />
              </motion.span>
            ) : (
              <motion.i 
                className="fas fa-search"
                whileHover={{ scale: 1.1 }}
              />
            )}
            查询日志/文件
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
                <motion.div 
                  className="mb-2 text-gray-600"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  类型: {queryResult.ext ? queryResult.ext : '未知'} {queryResult.encoding && <span>({queryResult.encoding})</span>}
                </motion.div>
                {isTextExt(queryResult.ext) ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <motion.div 
                      className="mb-2 text-yellow-700"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      文本文件预览：
                    </motion.div>
                    <pre className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap max-h-64 overflow-auto border border-gray-200 mb-3">
                      {queryResult.content}
                    </pre>
                    <motion.button 
                      className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-lg" 
                      onClick={handleDownload}
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.i 
                        className="fas fa-download mr-2"
                        whileHover={{ scale: 1.1 }}
                      />
                      下载文本文件
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <motion.div 
                      className="mb-2 text-yellow-700"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      二进制/非文本文件，点击下载：
                    </motion.div>
                    <motion.button 
                      className="bg-gradient-to-r from-yellow-600 to-yellow-500 text-white px-4 py-2 rounded-lg hover:from-yellow-700 hover:to-yellow-600 transition-all duration-200 shadow-lg" 
                      onClick={handleDownload}
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.i 
                        className="fas fa-download mr-2"
                        whileHover={{ scale: 1.1 }}
                      />
                      下载文件
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        {/* 全局提示 */}
        {/* 所有提示已用 setNotification 全局弹窗替换 */}
        
        <motion.div 
          className="mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <motion.h3 
            className="text-xl font-bold mb-2 text-blue-700"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
          >
            上传历史
          </motion.h3>
          <motion.ul 
            className="mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.8 }}
          >
            {uploadHistory.length === 0 && (
              <motion.li 
                className="text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.9 }}
              >
                暂无上传记录
              </motion.li>
            )}
            {uploadHistory.map((item, idx) => (
              <motion.li 
                key={idx} 
                className="mb-1 text-sm flex items-center gap-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * idx }}
                whileHover={{ scale: 1.02, x: 5 }}
              >
                <motion.a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="underline text-blue-600"
                  whileHover={{ scale: 1.05 }}
                >
                  {item.link}
                </motion.a>
                <span className="text-gray-500">({item.ext})</span>
                <span className="text-gray-400 ml-2">{item.time}</span>
              </motion.li>
            ))}
          </motion.ul>
          
          <motion.h3 
            className="text-xl font-bold mb-2 text-green-700"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.9 }}
          >
            查询历史
          </motion.h3>
          <motion.ul
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.0 }}
          >
            {queryHistory.length === 0 && (
              <motion.li 
                className="text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 1.1 }}
              >
                暂无查询记录
              </motion.li>
            )}
            {queryHistory.map((item, idx) => (
              <motion.li 
                key={idx} 
                className="mb-1 text-sm flex items-center gap-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * idx }}
                whileHover={{ scale: 1.02, x: -5 }}
              >
                <motion.button 
                  className="underline text-green-600" 
                  onClick={() => { setQueryId(item.id); setQueryResult(null); setSuccess(''); setError(''); }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {item.id}
                </motion.button>
                <span className="text-gray-500">{item.ext ? `(${item.ext})` : ''}</span>
                <span className="text-gray-400 ml-2">{item.time}</span>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      </motion.div>
    </>
  );
};

export default LogShare;
