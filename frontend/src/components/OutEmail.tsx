import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import EmailSender from './EmailSender';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';

interface EmailSenderProps {
  to: string;
  subject: string;
  content: string;
  code: string;
  setTo: (v: string) => void;
  setSubject: (v: string) => void;
  setContent: (v: string) => void;
  setCode: (v: string) => void;
  loading: boolean;
  success: string;
  error: string;
  handleSend: () => void;
  isOutEmail?: boolean;
}

const OutEmail: React.FC = () => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [fromUser, setFromUser] = useState('noreply');
  const [displayName, setDisplayName] = useState('Synapse');
  const OUTEMAIL_DOMAIN = 'arteam.dev'; // 可通过接口/环境变量动态获取
  const [domains, setDomains] = useState<string[]>([OUTEMAIL_DOMAIN]);
  const [selectedDomain, setSelectedDomain] = useState(OUTEMAIL_DOMAIN);
  const [outemailStatus, setOutemailStatus] = useState<{ available: boolean; error?: string } | null>(null);
  const { setNotification } = useNotification();

  // 获取后端支持的所有域名
  useEffect(() => {
    fetch(getApiBaseUrl() + '/api/email/domains')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.domains) && data.domains.length > 0) {
          setDomains(data.domains);
          setSelectedDomain(data.domains[0]);
        }
      });
  }, []);

  // 获取对外邮件服务状态
  useEffect(() => {
    fetch(getApiBaseUrl() + '/api/email/outemail-status')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOutemailStatus({
            available: data.available,
            error: data.error
          });
          if (!data.available) {
            setNotification({ message: data.error || '对外邮件服务异常', type: 'error' });
          }
        }
      })
      .catch(() => {
        setOutemailStatus({ available: false, error: '无法获取服务状态' });
        setNotification({ message: '无法获取对外邮件服务状态', type: 'error' });
      });
  }, []);

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!displayName.trim() || !fromUser.trim() || !to.trim() || !subject.trim() || !content.trim() || !code.trim()) {
      setError('请填写所有字段');
      setNotification({ message: '请填写所有字段', type: 'warning' });
      return;
    }
    const from = fromUser.trim();
    const domain = selectedDomain;
    if (!emailRegex.test(to.trim())) {
      setError('收件人邮箱格式无效');
      setNotification({ message: '收件人邮箱格式无效', type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(getApiBaseUrl() + '/api/email/outemail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, displayName, to, subject, content, code, domain })
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        setError('服务器响应异常，请联系管理员');
        setNotification({ message: '服务器响应异常，请联系管理员', type: 'error' });
        setLoading(false);
        return;
      }
      if (data.success) {
        setSuccess('邮件发送成功！');
        setNotification({ message: '邮件发送成功！', type: 'success' });
        setTo('');
        setSubject('');
        setContent('');
        setCode('');
        setFromUser('noreply');
        setDisplayName('');
        setSelectedDomain(domains[0] || '');
      } else {
        setError(data.error || '发送失败');
        setNotification({ message: data.error || '发送失败', type: 'error' });
      }
    } catch (e: any) {
      setError(e.message || '发送失败');
      setNotification({ message: e.message || '发送失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* 顶部导航栏 */}
      <motion.div 
        className="bg-white shadow-sm border-b border-gray-100"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div 
              className="flex items-center space-x-4"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Link 
                to="/"
                className="flex items-center space-x-2 text-gray-600 hover:text-indigo-600 transition-colors duration-200"
              >
                <motion.svg 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  whileHover={{ scale: 1.1, rotate: -5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </motion.svg>
                <span className="font-medium">返回主页</span>
              </Link>
            </motion.div>

            <motion.div
              className="flex items-center space-x-2"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <motion.svg 
                className="w-6 h-6 text-indigo-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </motion.svg>
              <h1 className="text-xl font-bold text-gray-900">对外邮件发送</h1>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* 主要内容 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* 左侧表单 */}
          <div className="lg:col-span-2">
            <motion.div 
              className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {/* 表单头部 */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">发送邮件</h2>
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 bg-white/20 text-white text-sm rounded-lg">
                      对外发送模式
                    </span>
                  </div>
                </div>
              </div>

              {/* 表单内容 */}
              <div className="p-6 space-y-6">
                {/* 错误和成功消息 */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-red-50 border border-red-200 rounded-lg p-4"
                    >
                      <div className="flex items-center space-x-2">
                        <motion.svg 
                          className="w-5 h-5 text-red-500" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ duration: 0.5 }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </motion.svg>
                        <span className="font-medium text-red-800">{error}</span>
                      </div>
                    </motion.div>
                  )}
                  {success && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-green-50 border border-green-200 rounded-lg p-4"
                    >
                      <div className="flex items-center space-x-2">
                        <motion.svg 
                          className="w-5 h-5 text-green-500" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </motion.svg>
                        <span className="font-medium text-green-800">{success}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 收件人 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    收件人邮箱 *
                  </label>
                  <input
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    placeholder="收件人@example.com"
                  />
                </div>

                {/* 邮件主题 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    邮件主题 *
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    placeholder="请输入邮件主题"
                  />
                </div>

                {/* 邮件内容 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    邮件内容 *
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    placeholder="请输入邮件内容"
                  />
                </div>

                {/* 验证码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    验证码 *
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    placeholder="请输入验证码"
                  />
                </div>

                {/* 新增发件人输入框 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    发件人邮箱 *
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={fromUser}
                      onChange={e => setFromUser(e.target.value)}
                      className="w-1/2 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                      placeholder="noreply"
                    />
                    <span className="px-3 py-3 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg select-none">@{selectedDomain}</span>
                  </div>
                </div>

                {/* 新增发件人显示名输入框 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    发件人显示名 *
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    placeholder="Synapse"
                  />
                </div>

                {/* 新增发件人域名下拉选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    发件人域名 *
                  </label>
                  <select
                    value={selectedDomain}
                    onChange={e => setSelectedDomain(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  >
                    {domains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* 发送按钮 */}
                <motion.button
                  onClick={handleSend}
                  disabled={loading}
                  className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                    loading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
                  }`}
                  whileHover={!loading ? { scale: 1.02 } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                >
                  {loading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <motion.div
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <span>发送中...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>发送邮件</span>
                    </div>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>

          {/* 右侧帮助面板 */}
          <div className="lg:col-span-1">
            <motion.div 
              className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {/* 面板头部 */}
              <div className="bg-gradient-to-r from-green-500 to-teal-600 px-6 py-4">
                <h3 className="text-lg font-bold text-white">使用帮助</h3>
              </div>

              {/* 面板内容 */}
              <div className="p-6 space-y-6">
                {/* 功能说明 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">功能说明</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>无需登录即可发送邮件</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>支持简单文本邮件格式</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>自动验证邮箱格式</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>需要验证码防止滥用</p>
                    </div>
                  </div>
                </div>

                {/* 使用提示 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">使用提示</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>请确保收件人邮箱格式正确</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>邮件主题应简洁明了</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>内容应文明礼貌</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>每分钟最多发送20封邮件</p>
                    </div>
                  </div>
                </div>

                {/* 安全提醒 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">安全提醒</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>请勿发送垃圾邮件或恶意内容</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>注意保护收件人隐私</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p>验证码仅用于防止滥用</p>
                    </div>
                  </div>
                </div>

                {/* 服务状态 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">服务状态</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">对外邮件服务</span>
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${outemailStatus?.available ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium">
                          {outemailStatus?.available ? '正常' : '异常'}
                        </span>
                      </div>
                    </div>
                    {outemailStatus?.error && (
                      <div className="text-xs text-red-500">
                        {outemailStatus.error}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      服务时间：24/7
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default OutEmail; 