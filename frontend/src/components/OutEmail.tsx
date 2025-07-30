import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaUser, FaGlobe, FaShieldAlt, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaSync, FaArrowLeft } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';

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
  const { user } = useAuth();
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
  const [domainExemptionStatus, setDomainExemptionStatus] = useState<{ exempted: boolean; message?: string } | null>(null);
  const [checkingExemption, setCheckingExemption] = useState(false);
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
        if (typeof data.available === 'boolean') {
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

  // 检查域名豁免状态
  const checkDomainExemption = async () => {
    if (!selectedDomain) {
      setNotification({ message: '请先选择域名', type: 'warning' });
      return;
    }

    setCheckingExemption(true);
    try {
      const response = await fetch(getApiBaseUrl() + '/api/email/check-domain-exemption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: selectedDomain })
      });

      const data = await response.json();
      
      if (data.success) {
        setDomainExemptionStatus({
          exempted: data.exempted,
          message: data.message
        });
        setNotification({ 
          message: data.exempted ? '域名已豁免检查' : '域名需要检查', 
          type: data.exempted ? 'success' : 'info' 
        });
      } else {
        setDomainExemptionStatus({
          exempted: false,
          message: data.error || '检查失败'
        });
        setNotification({ message: data.error || '检查失败', type: 'error' });
      }
    } catch (error) {
      setDomainExemptionStatus({
        exempted: false,
        message: '网络错误'
      });
      setNotification({ message: '网络错误，请重试', type: 'error' });
    } finally {
      setCheckingExemption(false);
    }
  };

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
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            <FaEnvelope className="w-6 h-6" />
            对外邮件发送管理
          </h2>
          <Link 
            to="/"
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
          >
            <FaArrowLeft className="w-4 h-4" />
            返回主页
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于发送对外邮件，支持自定义发件人域名和显示名称，需要验证码防止滥用。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持自定义发件人邮箱和显示名</li>
                <li>可选择不同的发件人域名</li>
                <li>自动验证邮箱格式</li>
                <li>需要验证码防止滥用</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 服务状态卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaShieldAlt className="w-5 h-5 text-green-500" />
            服务状态
          </h3>
          <motion.button
            onClick={() => window.location.reload()}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className="w-4 h-4" />
            刷新
          </motion.button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">
              {outemailStatus?.available ? '正常' : '异常'}
            </div>
            <div className="text-sm text-gray-600">对外邮件服务</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{domains.length}</div>
            <div className="text-sm text-gray-600">可用域名</div>
          </div>
        </div>

        {outemailStatus?.error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FaExclamationTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-800">{outemailStatus.error}</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* 邮件发送表单 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaEnvelope className="w-5 h-5 text-indigo-500" />
          发送邮件
        </h3>

        {/* 错误和成功消息 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
            >
              <div className="flex items-center gap-2">
                <FaExclamationTriangle className="w-4 h-4 text-red-500" />
                <span className="font-medium text-red-800">{error}</span>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4"
            >
              <div className="flex items-center gap-2">
                <FaCheckCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium text-green-800">{success}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 收件人 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              收件人邮箱 *
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              placeholder="请输入邮件主题"
            />
          </div>

          {/* 发件人邮箱 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              发件人邮箱 *
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={fromUser}
                onChange={e => setFromUser(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                placeholder="noreply"
              />
              <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg select-none text-sm">@{selectedDomain}</span>
            </div>
          </div>

          {/* 发件人显示名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              发件人显示名 *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              placeholder="Synapse"
            />
          </div>

          {/* 发件人域名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              发件人域名 *
            </label>
            <div className="flex items-center space-x-2">
              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              >
                {domains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <motion.button
                onClick={checkDomainExemption}
                disabled={checkingExemption || !selectedDomain}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                {checkingExemption ? (
                  <FaSync className="animate-spin h-4 w-4" />
                ) : (
                  <FaCheckCircle className="w-4 h-4" />
                )}
                {checkingExemption ? '检查中...' : '豁免检查'}
              </motion.button>
            </div>
            
            {/* 豁免状态显示 */}
            {domainExemptionStatus && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-2 p-3 rounded-lg border ${
                  domainExemptionStatus.exempted 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {domainExemptionStatus.exempted ? (
                    <FaCheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <FaExclamationTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                  <span className={`text-sm font-medium ${
                    domainExemptionStatus.exempted ? 'text-green-800' : 'text-yellow-800'
                  }`}>
                    {domainExemptionStatus.exempted ? '已豁免' : '需要检查'}
                  </span>
                </div>
                {domainExemptionStatus.message && (
                  <p className={`text-xs mt-1 ${
                    domainExemptionStatus.exempted ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {domainExemptionStatus.message}
                  </p>
                )}
              </motion.div>
            )}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              placeholder="请输入验证码"
            />
          </div>
        </div>

        {/* 邮件内容 */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            邮件内容 *
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
            placeholder="请输入邮件内容"
          />
        </div>

        {/* 发送按钮 */}
        <div className="mt-6">
          <motion.button
            onClick={handleSend}
            disabled={loading}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }`}
            whileHover={!loading ? { scale: 1.02 } : {}}
            whileTap={!loading ? { scale: 0.98 } : {}}
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <FaSync className="animate-spin w-5 h-5" />
                <span>发送中...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <FaEnvelope className="w-5 h-5" />
                <span>发送邮件</span>
              </div>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* 使用帮助 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaInfoCircle className="w-5 h-5 text-blue-500" />
          使用帮助
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 功能说明 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">功能说明</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>支持自定义发件人邮箱</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>可选择不同发件人域名</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>自动验证邮箱格式</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>需要验证码防止滥用</p>
              </div>
            </div>
          </div>

          {/* 使用提示 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">使用提示</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>确保收件人邮箱格式正确</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>邮件主题应简洁明了</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>内容应文明礼貌</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>每分钟最多发送20封</p>
              </div>
            </div>
          </div>

          {/* 安全提醒 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">安全提醒</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>请勿发送垃圾邮件</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>注意保护收件人隐私</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>验证码仅防滥用</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                <p>服务时间：24/7</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OutEmail; 