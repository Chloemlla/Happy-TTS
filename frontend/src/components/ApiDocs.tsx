import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExternalLinkAlt, FaFileAlt, FaInfoCircle, FaLink, FaQuestionCircle, FaTimes } from 'react-icons/fa';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

const MAIN_DOC_URL = 'https://tts-api-docs.hapx.one';
const BACKUP_DOC_URL = 'https://tts-api-docs.chloemlla.com';

const ApiDocs: React.FC = () => {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [autoRedirect, setAutoRedirect] = useState(true);
  const timerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setCountdown(5);
    timerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer();
          window.open(MAIN_DOC_URL, '_blank', 'noopener,noreferrer');
          setShowConfirm(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const handleRedirect = useCallback(() => {
    setShowConfirm(true);
    setAutoRedirect(true);
    startTimer();
  }, [startTimer]);

  const confirmRedirect = useCallback((url: string) => {
    clearTimer();
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowConfirm(false);
  }, [clearTimer]);

  const cancelRedirect = useCallback(() => {
    clearTimer();
    setShowConfirm(false);
  }, [clearTimer]);

  const toggleAutoRedirect = useCallback(() => {
    const nextAutoRedirect = !autoRedirect;
    setAutoRedirect(nextAutoRedirect);
    if (nextAutoRedirect) {
      startTimer();
    } else {
      clearTimer();
    }
  }, [autoRedirect, clearTimer, startTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showConfirm) {
        return;
      }

      switch (event.key) {
        case 'Escape':
          cancelRedirect();
          break;
        case 'Enter':
        case '1':
          confirmRedirect(MAIN_DOC_URL);
          break;
        case '2':
          confirmRedirect(BACKUP_DOC_URL);
          break;
        case ' ':
          event.preventDefault();
          toggleAutoRedirect();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showConfirm, cancelRedirect, confirmRedirect, toggleAutoRedirect]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (showConfirm && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [showConfirm]);

  const content = {
    title: lang === 'zh' ? 'Synapse API 文档' : 'Synapse API Documentation',
    description: lang === 'zh'
      ? '即将跳转到 Synapse API 文档站点，包含完整的 API 参考、教程和最佳实践。'
      : 'You are about to open the Synapse API documentation site with API reference, tutorials, and best practices.',
    primary: lang === 'zh' ? '访问文档站点' : 'Visit Documentation',
    noticeTitle: lang === 'zh' ? '附属网站说明' : 'Affiliate Site Notice',
  };

  return (
    <InfoQueryShell maxWidthClassName="max-w-5xl">
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="Developer Reference"
          title="API 文档"
          description={content.description}
          icon={FaFileAlt}
          tone="sky"
          meta={(
            <>
              <InfoBadge tone="sky">主备站点</InfoBadge>
              <InfoBadge tone="slate">新窗口打开</InfoBadge>
              <InfoBadge tone="emerald">官方维护</InfoBadge>
            </>
          )}
          actions={(
            <div className="flex rounded-2xl border border-slate-200 bg-white/72 p-1 shadow-sm">
              {([['zh', '中文'], ['en', 'EN']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLang(key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${lang === key ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoMetricCard label={lang === 'zh' ? '主站点' : 'Main Site'} value="hapx.one" detail={lang === 'zh' ? '推荐优先访问' : 'Recommended first'} icon={FaExternalLinkAlt} tone="sky" />
          <InfoMetricCard label={lang === 'zh' ? '备用站点' : 'Backup Site'} value="chloemlla.com" detail={lang === 'zh' ? '主站不可用时使用' : 'Use when main is unavailable'} icon={FaLink} tone="slate" />
        </div>

        <InfoPanel>
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[32px] bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <FaFileAlt className="h-9 w-9" />
            </div>
            <h1 className="mt-5 text-3xl font-semibold text-slate-950">{content.title}</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">{content.description}</p>

            <div className="mx-auto mt-6 max-w-3xl rounded-[26px] border border-sky-100 bg-sky-50/70 p-5 text-left">
              <InfoSectionTitle
                title={content.noticeTitle}
                description={lang === 'zh'
                  ? '文档服务由两个官方附属站点联合提供，内容保持一致。'
                  : 'Documentation is served by two official affiliate sites with identical content.'}
                icon={FaInfoCircle}
                tone="sky"
              />
              <div className="space-y-3 text-sm leading-6 text-slate-700">
                <p>
                  <span className="font-semibold text-sky-700">{lang === 'zh' ? '主站点：' : 'Main: '}</span>
                  tts-api-docs.hapx.one
                  <span className="ml-2 text-slate-500">{lang === 'zh' ? '推荐，速度快，优先访问。' : 'Recommended, fast, preferred.'}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-700">{lang === 'zh' ? '备用站点：' : 'Backup: '}</span>
                  tts-api-docs.chloemlla.com
                  <span className="ml-2 text-slate-500">{lang === 'zh' ? '如主站点无法访问时使用。' : 'Use if the main site is unavailable.'}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <InfoPrimaryButton tone="sky" onClick={handleRedirect} className="px-8 py-3 text-base">
                <FaExternalLinkAlt /> {content.primary}
              </InfoPrimaryButton>
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <FaInfoCircle />
                {lang === 'zh' ? '点击后将在新窗口打开' : 'Opens in a new window'}
              </p>
            </div>
          </div>
        </InfoPanel>

        <InfoPanel compact>
          <InfoSectionTitle
            title={lang === 'zh' ? '常见问题' : 'FAQ'}
            description={lang === 'zh' ? '关于跳转与主备站点的说明。' : 'Notes about redirect and site selection.'}
            icon={FaQuestionCircle}
            tone="slate"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200 bg-white/75 p-4">
              <h3 className="font-semibold text-slate-950">{lang === 'zh' ? '为什么有时会连续跳转？' : 'Why can redirect happen twice?'}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {lang === 'zh'
                  ? '部分浏览器或网络环境下，主站点可能因 CDN、缓存或安全策略导致首次跳转失败，可改用备用站点。'
                  : 'Some browsers or networks may fail on the first redirect because of CDN, cache, or security policy behavior. Use the backup if needed.'}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white/75 p-4">
              <h3 className="font-semibold text-slate-950">{lang === 'zh' ? '两个站点内容有区别吗？' : 'Are the two sites different?'}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {lang === 'zh'
                  ? '两个站点内容完全一致，均为 Synapse 官方团队同步维护。'
                  : 'Both sites have identical content and are maintained by the Synapse team.'}
              </p>
            </div>
          </div>
        </InfoPanel>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelRedirect}
          >
            <motion.div
              ref={dialogRef}
              className="w-full max-w-xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl focus:outline-none"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Site Selector</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">
                    {lang === 'zh' ? '请选择 API 文档站点' : 'Select API Documentation Site'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={cancelRedirect}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={lang === 'zh' ? '关闭' : 'Close'}
                >
                  <FaTimes />
                </button>
              </div>

              <p className="text-sm leading-7 text-slate-600">
                {lang === 'zh'
                  ? '主站点响应速度快，稳定性高，推荐优先访问。如遇网络问题，可选择备用站点，内容完全一致。'
                  : 'The main site is fast and stable. If you have network issues, use the backup site. Content is identical.'}
              </p>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => confirmRedirect(MAIN_DOC_URL)}
                  className="relative flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-800"
                >
                  <FaExternalLinkAlt />
                  {lang === 'zh' ? '主站点：hapx.one（推荐）' : 'Main: hapx.one (Recommended)'}
                  <span className="absolute right-3 top-3 rounded bg-white/20 px-1.5 py-0.5 text-xs">1</span>
                </button>

                {autoRedirect && (
                  <div>
                    <div className="mb-2 text-center text-xs font-medium text-slate-500">
                      {lang === 'zh' ? `${countdown} 秒后自动跳转主站点` : `Auto redirect in ${countdown}s`}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-sky-600"
                        initial={{ width: '100%' }}
                        animate={{ width: `${(countdown / 5) * 100}%` }}
                        transition={{ duration: 0.1, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => confirmRedirect(BACKUP_DOC_URL)}
                  className="relative flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <FaLink />
                  {lang === 'zh' ? '备用站点：chloemlla.com' : 'Backup: chloemlla.com'}
                  <span className="absolute right-3 top-3 rounded bg-slate-100 px-1.5 py-0.5 text-xs">2</span>
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={cancelRedirect}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {lang === 'zh' ? '取消 (Esc)' : 'Cancel (Esc)'}
                </button>
                <button
                  type="button"
                  onClick={toggleAutoRedirect}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${autoRedirect ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                >
                  {autoRedirect
                    ? (lang === 'zh' ? '取消自动跳转 (空格)' : 'Cancel Auto (Space)')
                    : (lang === 'zh' ? '启用自动跳转 (空格)' : 'Enable Auto (Space)')}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-center text-xs leading-6 text-slate-500">
                {lang === 'zh' ? '快捷键：' : 'Shortcuts: '}
                <span className="font-mono text-slate-700">1</span> {lang === 'zh' ? '主站点' : 'Main'} ·{' '}
                <span className="font-mono text-slate-700">2</span> {lang === 'zh' ? '备用' : 'Backup'} ·{' '}
                <span className="font-mono text-slate-700">Space</span> {lang === 'zh' ? '切换自动' : 'Toggle Auto'} ·{' '}
                <span className="font-mono text-slate-700">Esc</span> {lang === 'zh' ? '取消' : 'Cancel'}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </InfoQueryShell>
  );
};

export default ApiDocs;
