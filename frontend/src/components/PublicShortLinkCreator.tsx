import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FaLink, FaCopy, FaDice, FaArrowLeft } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';

const PublicShortLinkCreator: React.FC = () => {
  const [target, setTarget] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { setNotification } = useNotification();

  const handleCreate = async () => {
    if (!target.trim()) {
      setNotification({ message: '请输入目标地址', type: 'warning' });
      return;
    }
    if (!password.trim()) {
      setNotification({ message: '请输入服务密码', type: 'warning' });
      return;
    }
    try {
      new URL(target.trim());
    } catch {
      setNotification({ message: '请输入有效的URL格式', type: 'error' });
      return;
    }

    setCreating(true);
    setResult(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/shorturl/public/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: target.trim(),
          customCode: customCode.trim() || undefined,
          password: password.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.shortUrl);
        setNotification({ message: '短链创建成功', type: 'success' });
        setTarget('');
        setCustomCode('');
      } else {
        setNotification({ message: data.error || '创建失败', type: 'error' });
      }
    } catch (err: any) {
      setNotification({ message: err.message || '网络错误', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败，请手动复制', type: 'error' });
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 transition-colors text-sm">
          <FaArrowLeft className="mr-1" /> 返回首页
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg p-6 sm:p-8"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <FaLink className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">公共短链创建</h1>
            <p className="text-sm text-gray-500">无需登录，输入服务密码即可创建短链接</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* 目标地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目标地址</label>
            <input
              type="url"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://example.com/your-long-url"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
              aria-label="目标地址"
            />
          </div>

          {/* 自定义短码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              自定义短码 <span className="text-gray-400 font-normal">(可选)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="my-link"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm pr-10"
                aria-label="自定义短码"
              />
              <FaDice className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <p className="text-xs text-gray-400 mt-1">仅支持字母、数字、连字符和下划线，留空则自动生成</p>
          </div>

          {/* 服务密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">服务密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入 SERVER_PASSWORD"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
              aria-label="服务密码"
            />
          </div>

          {/* 创建按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center space-x-2"
            aria-label="创建短链"
          >
            {creating ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <FaLink />
                <span>创建短链</span>
              </>
            )}
          </motion.button>
        </div>

        {/* 结果展示 */}
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg"
          >
            <p className="text-sm text-green-700 font-medium mb-2">创建成功</p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={result}
                className="flex-1 px-3 py-2 bg-white border border-green-300 rounded-lg text-sm text-gray-800"
                aria-label="短链结果"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopy}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center space-x-1"
                aria-label="复制短链"
              >
                <FaCopy />
                <span>复制</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default PublicShortLinkCreator;
