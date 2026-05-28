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
    <section className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 backdrop-blur-xl transition hover:border-slate-300 hover:text-slate-700"
        >
          <FaArrowLeft className="text-[10px]" /> 返回首页
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
      >
        <div className="pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Public Shortlink
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            公共短链创建
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            无需登录，输入服务密码即可创建短链接。生成的短链可以分享给任何人访问。
          </p>

          <div className="mt-8 space-y-5">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                目标地址
              </label>
              <input
                type="url"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://example.com/your-long-url"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="目标地址"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                自定义短码{' '}
                <span className="ml-1 normal-case tracking-normal text-slate-400">(可选)</span>
              </label>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="my-link"
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                  aria-label="自定义短码"
                />
                <FaDice className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                仅支持字母、数字、连字符和下划线，留空则自动生成。
              </p>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                服务密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入公共短链访问口令"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="服务密码"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleCreate}
              disabled={creating}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              aria-label="创建短链"
            >
              {creating ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <FaLink className="text-[13px]" />
                  <span>创建短链</span>
                </>
              )}
            </motion.button>
          </div>

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-7 rounded-[22px] border border-emerald-200/70 bg-emerald-50/80 px-5 py-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-600">
                创建成功
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={result}
                  className="flex-1 rounded-xl border border-emerald-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  aria-label="短链结果"
                />
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  aria-label="复制短链"
                >
                  <FaCopy className="text-[12px]" />
                  <span>复制</span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </section>
  );
};

export default PublicShortLinkCreator;
