import React, { useState, useEffect } from 'react';
import { api } from '../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaShieldAlt, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaSync, FaArrowLeft } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';

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
  const OUTEMAIL_DOMAIN = 'arteam.dev';
  const [domains, setDomains] = useState<string[]>([OUTEMAIL_DOMAIN]);
  const [selectedDomain, setSelectedDomain] = useState(OUTEMAIL_DOMAIN);
  const [outemailStatus, setOutemailStatus] = useState<{ available: boolean; error?: string } | null>(null);
  const [domainExemptionStatus, setDomainExemptionStatus] = useState<{ exempted: boolean; message?: string } | null>(null);
  const [checkingExemption, setCheckingExemption] = useState(false);
  const { setNotification } = useNotification();
  const [quota, setQuota] = useState<{ used: number; total: number; resetAt: string } | null>(null);

  const [remoteAttachmentUrls, setRemoteAttachmentUrls] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [batchMode, setBatchMode] = useState(false);
  const [batchRecipients, setBatchRecipients] = useState('');

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = typeof result === 'string' && result.includes(',') ? result.split(',')[1] : result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  useEffect(() => { /* no-op */ }, []);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const loadStatus = async () => {
      try {
        const res = await fetch(getApiBaseUrl() + '/api/outemail/status');
        if (!res.ok) throw new Error('获取服务状态失败');
        let data: any;
        try { data = await res.json(); } catch { throw new Error('服务状态响应解析失败'); }
        if (typeof data.available === 'boolean') {
          setOutemailStatus({ available: data.available, error: data.error });
          if (data.domain && typeof data.domain === 'string') {
            setDomains([data.domain]);
            setSelectedDomain(prev => (prev === data.domain ? prev : data.domain));
          }
          if (!data.available) setNotification({ message: data.error || '对外邮件服务异常', type: 'error' });
        } else {
          setOutemailStatus({ available: false, error: '服务状态数据无效' });
        }
      } catch (e: any) {
        setOutemailStatus({ available: false, error: e.message || '无法获取服务状态' });
        setNotification({ message: e.message || '无法获取对外邮件服务状态', type: 'error' });
      }
    };
    loadStatus();
  }, [user]);

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const { data } = await api.get('/api/outemail/quota');
        if (data?.success) {
          setQuota({ used: Number(data.used) || 0, total: Number(data.total) || 0, resetAt: String(data.resetAt || '') });
        }
      } catch { }
    };
    fetchQuota();
    const t = setInterval(fetchQuota, 30_000);
    return () => clearInterval(t);
  }, []);

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
        credentials: 'include',
        body: JSON.stringify({ domain: selectedDomain })
      });
      if (!response.ok) {
        throw new Error('豁免检查请求失败');
      }
      let data: any;
      try { data = await response.json(); } catch { throw new Error('豁免检查响应解析失败'); }

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
    } catch (error: any) {
      setDomainExemptionStatus({
        exempted: false,
        message: error?.message || '网络错误'
      });
      setNotification({ message: error?.message || '网络错误，请重试', type: 'error' });
    } finally {
      setCheckingExemption(false);
    }
  };

  const handleSend = async () => {
    setError(''); setSuccess('');
    const toTrimmed = to.trim();
    const subjectTrimmed = subject.trim();
    const contentTrimmed = content.trim();
    const codeTrimmed = code.trim();
    const fromUserTrimmed = fromUser.trim();
    const displayNameTrimmed = displayName.trim();

    if (!displayNameTrimmed || !fromUserTrimmed || !subjectTrimmed || !contentTrimmed || !codeTrimmed) {
      setError('请填写必填字段');
      setNotification({ message: '请填写必填字段', type: 'warning' });
      return;
    }
    if (outemailStatus && !outemailStatus.available) {
      setError(outemailStatus.error || '对外邮件服务不可用');
      setNotification({ message: outemailStatus.error || '对外邮件服务不可用', type: 'error' });
      return;
    }
    const from = fromUserTrimmed;
    const domain = selectedDomain;

    setLoading(true);
    try {
      if (batchMode) {
        const recipients = batchRecipients
          .split(/\r?\n|[,;\s]+/)
          .map(s => s.trim())
          .filter(Boolean);
        const uniqueRecipients = Array.from(new Set(recipients));
        if (uniqueRecipients.length === 0) {
          throw new Error('请填写至少一个收件人');
        }
        if (uniqueRecipients.length > 100) {
          throw new Error('一次最多发送100个收件人');
        }
        const invalid = uniqueRecipients.filter(r => !emailRegex.test(r));
        if (invalid.length) {
          throw new Error(`存在无效邮箱：${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? ' 等' : ''}`);
        }
        const messages = uniqueRecipients.map(r => ({ to: r, subject: subjectTrimmed, content: contentTrimmed }));
        const res = await fetch(getApiBaseUrl() + '/api/outemail/batch-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, code: codeTrimmed, from, displayName: displayNameTrimmed, domain })
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || '批量发送失败');
        }
        const data = await res.json().catch(() => ({}));
        if (data && data.success) {
          setSuccess(`批量发送成功（${data.ids?.length ?? uniqueRecipients.length} 封）`);
          setNotification({ message: '批量发送成功', type: 'success' });
          setBatchRecipients('');
        } else {
          throw new Error(data?.error || '批量发送失败');
        }
      } else {
        if (!emailRegex.test(toTrimmed)) {
          throw new Error('收件人邮箱格式无效');
        }
        const remoteList = remoteAttachmentUrls
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean)
          .map((url) => {
            let filename = 'attachment';
            try {
              const u = new URL(url);
              const base = u.pathname.split('/').filter(Boolean).pop();
              if (base) filename = decodeURIComponent(base);
            } catch { }
            return { path: url, filename } as { path: string; filename: string };
          });
        const fileList = await Promise.all(selectedFiles.map(async (f) => ({ filename: f.name, content: await fileToBase64(f) })));
        const attachments = [...remoteList, ...fileList].slice(0, 10);

        const res = await fetch(getApiBaseUrl() + '/api/outemail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: toTrimmed, subject: subjectTrimmed, content: contentTrimmed, code: codeTrimmed, from, displayName: displayNameTrimmed, domain, ...(attachments.length ? { attachments } : {}) })
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || '发送失败');
        }
        const data = await res.json().catch(() => ({}));
        if (data && data.success) {
          setSuccess('发送成功');
          setNotification({ message: '发送成功', type: 'success' });
          setTo('');
          setSubject('');
          setContent('');
          setCode('');
          setFromUser('noreply');
          setDisplayName('Synapse');
          setSelectedDomain(domains[0] || '');
          setRemoteAttachmentUrls('');
          setSelectedFiles([]);
        } else {
          throw new Error(data?.error || '发送失败');
        }
      }
    } catch (e: any) {
      setError(e.message || (batchMode ? '批量发送失败' : '发送失败'));
      setNotification({ message: e.message || (batchMode ? '批量发送失败' : '发送失败'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16">
        <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-10 text-center shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.22),_transparent_68%)]" />
          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-500">
              Admin Only
            </div>
            <div className="mt-6 text-7xl">🤡</div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              你不是管理员，禁止访问
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              请用管理员账号登录后再来。<br />
              （仅限管理员使用，恶搞界面仅供娱乐。）
            </p>
          </div>
        </div>
      </section>
    );
  }

  const INPUT_CLASS =
    'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';
  const LABEL_CLASS =
    'block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:py-12 space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-700"
        >
          <FaArrowLeft className="text-[10px]" /> 返回管理后台
        </Link>
      </div>

      {/* Hero card */}
      <motion.div
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            <FaEnvelope className="text-[10px]" /> Outbound Email
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            对外邮件发送
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            支持自定义发件人域名与显示名称，需验证码防止滥用。可单封发送，亦可批量推送至最多 100 个收件人。
          </p>

          <div className="mt-6 flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50/60 px-5 py-4 text-sm leading-7 text-slate-600">
            <FaInfoCircle className="mt-1 flex-shrink-0 text-slate-500" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">功能说明</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>支持自定义发件人邮箱和显示名</li>
                <li>可选择不同的发件人域名</li>
                <li>自动验证邮箱格式</li>
                <li>需要验证码防止滥用</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quota card */}
      {quota && (
        <div className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">Daily Quota</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {quota.used} <span className="text-base text-slate-400">/ {quota.total}</span>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              重置时间：{quota.resetAt ? new Date(quota.resetAt).toLocaleString() : '-'}
            </div>
          </div>
        </div>
      )}

      {/* Service status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            <FaShieldAlt className="text-slate-500" />
            服务状态
          </div>
          <motion.button
            onClick={async () => {
              try {
                const statusRes = await fetch(getApiBaseUrl() + '/api/outemail/status');
                if (statusRes.ok) {
                  const d = await statusRes.json().catch(() => null);
                  if (d && typeof d.available === 'boolean') {
                    setOutemailStatus({ available: d.available, error: d.error });
                    if (d.domain && typeof d.domain === 'string') {
                      setDomains([d.domain]);
                      setSelectedDomain(prev => (prev === d.domain ? prev : d.domain));
                    }
                  }
                }
                setNotification({ message: '已刷新', type: 'success' });
              } catch {
                setNotification({ message: '刷新失败', type: 'error' });
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            whileTap={{ scale: 0.96 }}
          >
            <FaSync className="text-[10px]" />
            刷新
          </motion.button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-slate-200/70 bg-white/60 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">服务可用性</div>
            <div className={`mt-2 text-xl font-semibold ${outemailStatus?.available ? 'text-emerald-600' : 'text-rose-500'}`}>
              {outemailStatus?.available ? '正常' : '异常'}
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200/70 bg-white/60 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">可用域名</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{domains.length}</div>
          </div>
        </div>

        {outemailStatus?.error && (
          <div className="mt-4 flex items-center gap-2 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-3 text-sm text-rose-700">
            <FaExclamationTriangle className="flex-shrink-0" />
            <span>{outemailStatus.error}</span>
          </div>
        )}
      </motion.div>

      {/* Send form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            <FaEnvelope className="text-slate-500" />
            发送邮件
          </div>
          <label className="inline-flex select-none items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(e) => setBatchMode(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
            批量发送（最多 100 个）
          </label>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-center gap-2 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-4 text-sm text-rose-700"
            >
              <FaExclamationTriangle className="flex-shrink-0" />
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-center gap-2 rounded-[22px] border border-emerald-200/70 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-700"
            >
              <FaCheckCircle className="flex-shrink-0" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>
              {batchMode ? '批量收件人（用换行/逗号/分号/空格分隔）*' : '收件人邮箱 *'}
            </label>
            {batchMode ? (
              <textarea
                value={batchRecipients}
                onChange={(e) => setBatchRecipients(e.target.value)}
                className={`${INPUT_CLASS} mt-2 h-32 resize-y`}
                placeholder={'foo@example.com, bar@example.com\n或每行一个'}
              />
            ) : (
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${INPUT_CLASS} mt-2`}
                placeholder="收件人@example.com"
              />
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>邮件主题 *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`${INPUT_CLASS} mt-2`}
              placeholder="请输入邮件主题"
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>验证码 *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${INPUT_CLASS} mt-2`}
              placeholder="请输入验证码"
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>发件人邮箱 *</label>
            <div className="mt-2 flex items-center">
              <input
                type="text"
                value={fromUser}
                onChange={e => setFromUser(e.target.value)}
                className="flex-1 rounded-l-2xl border border-r-0 border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="noreply"
              />
              <span className="select-none rounded-r-2xl border border-l-0 border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                @{selectedDomain}
              </span>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>发件人显示名 *</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className={`${INPUT_CLASS} mt-2`}
              placeholder="Synapse"
            />
          </div>

          <div className="md:col-span-2">
            <label className={LABEL_CLASS}>发件人域名 *</label>
            <div className="mt-2 flex flex-wrap items-stretch gap-2">
              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value)}
                className={`${INPUT_CLASS} flex-1`}
              >
                {domains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <motion.button
                onClick={checkDomainExemption}
                disabled={checkingExemption || !selectedDomain}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
              >
                {checkingExemption ? (
                  <FaSync className="h-4 w-4 animate-spin" />
                ) : (
                  <FaCheckCircle className="h-4 w-4" />
                )}
                {checkingExemption ? '检查中…' : '豁免检查'}
              </motion.button>
            </div>

            {domainExemptionStatus && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-3 rounded-[22px] border px-5 py-3 ${
                  domainExemptionStatus.exempted
                    ? 'border-emerald-200/70 bg-emerald-50/80'
                    : 'border-amber-200/70 bg-amber-50/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  {domainExemptionStatus.exempted ? (
                    <FaCheckCircle className="text-emerald-500" />
                  ) : (
                    <FaExclamationTriangle className="text-amber-500" />
                  )}
                  <span className={`text-sm font-semibold ${domainExemptionStatus.exempted ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {domainExemptionStatus.exempted ? '已豁免' : '需要检查'}
                  </span>
                </div>
                {domainExemptionStatus.message && (
                  <p className={`mt-1 text-xs ${domainExemptionStatus.exempted ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {domainExemptionStatus.message}
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <label className={LABEL_CLASS}>邮件内容 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`${INPUT_CLASS} mt-2 h-48 resize-y`}
            placeholder="请输入邮件内容"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>附件 URL（每行一个，可选）</label>
            <textarea
              value={remoteAttachmentUrls}
              onChange={(e) => setRemoteAttachmentUrls(e.target.value)}
              disabled={batchMode}
              className={`${INPUT_CLASS} mt-2 h-32 resize-y ${batchMode ? 'cursor-not-allowed bg-slate-100/70' : ''}`}
              placeholder={'https://example.com/file1.pdf\nhttps://example.com/image.png'}
            />
            <p className="mt-2 text-xs text-slate-500">
              {batchMode ? '批量模式不支持附件' : '我们会自动从 URL 推断文件名。'}
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS}>本地文件（可多选，可选）</label>
            <input
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) setSelectedFiles(prev => [...prev, ...files]);
              }}
              disabled={batchMode}
              className={`mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 ${batchMode ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            {selectedFiles.length > 0 && (
              <div className="mt-2 max-h-32 overflow-auto rounded-[18px] border border-slate-200 bg-white/60 p-3">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {selectedFiles.map((f, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11px] text-slate-400">最多 10 个附件，单次邮件总大小 ≤ 40MB。</div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-7">
          <motion.button
            onClick={handleSend}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            whileHover={!loading ? { scale: 1.005 } : {}}
            whileTap={!loading ? { scale: 0.995 } : {}}
          >
            {loading ? (
              <>
                <FaSync className="h-4 w-4 animate-spin" />
                <span>{batchMode ? '批量发送中…' : '发送中…'}</span>
              </>
            ) : (
              <>
                <FaEnvelope className="text-[13px]" />
                <span>{batchMode ? '批量发送' : '发送邮件'}</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Help */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8"
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
          <FaInfoCircle className="text-slate-500" />
          使用帮助
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200/70 bg-white/60 p-5">
            <h4 className="text-sm font-semibold text-slate-900">功能说明</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />支持自定义发件人邮箱</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />可选择不同发件人域名</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />自动验证邮箱格式</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />需要验证码防止滥用</li>
            </ul>
          </div>

          <div className="rounded-[22px] border border-slate-200/70 bg-white/60 p-5">
            <h4 className="text-sm font-semibold text-slate-900">使用提示</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />确保收件人邮箱格式正确</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />邮件主题应简洁明了</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />内容应文明礼貌</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />每分钟最多发送 20 封</li>
            </ul>
          </div>

          <div className="rounded-[22px] border border-slate-200/70 bg-white/60 p-5">
            <h4 className="text-sm font-semibold text-slate-900">安全提醒</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />请勿发送垃圾邮件</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />注意保护收件人隐私</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />验证码仅防滥用</li>
              <li className="flex items-start gap-2"><span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />服务时间：24/7</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default OutEmail;
