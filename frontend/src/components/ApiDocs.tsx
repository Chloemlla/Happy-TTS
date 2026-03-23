import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FaFileAlt, FaInfoCircle, FaExternalLinkAlt, FaLink, FaQuestionCircle, FaTimes } from 'react-icons/fa';

const MAIN_DOC_URL = 'https://tts-api-docs.hapx.one';
const BACKUP_DOC_URL = 'https://tts-api-docs.hapxs.com';

const NO_TRANSITION = { duration: 0 } as const;
const FADE_VARIANTS = { hidden: { opacity: 0 }, visible: { opacity: 1 } } as const;
const cardVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const ApiDocs: React.FC = () => {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [autoRedirect, setAutoRedirect] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const effectiveCardVariants = React.useMemo(() => prefersReducedMotion ? FADE_VARIANTS : cardVariants, [prefersReducedMotion]);
  const ITEM_HOVER = prefersReducedMotion ? undefined : { scale: 1.04 };
  const BUTTON_TAP = prefersReducedMotion ? undefined : { scale: 0.96 };

  const clearTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);

  const startTimer = useCallback(() => {
    clearTimer(); setCountdown(5);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearTimer(); window.open(MAIN_DOC_URL, '_blank', 'noopener,noreferrer'); setShowConfirm(false); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const handleRedirect = useCallback(() => { setShowConfirm(true); setAutoRedirect(true); startTimer(); }, [startTimer]);
  const confirmRedirect = useCallback((url: string) => { clearTimer(); window.open(url, '_blank', 'noopener,noreferrer'); setShowConfirm(false); }, [clearTimer]);
  const cancelRedirect = useCallback(() => { clearTimer(); setShowConfirm(false); }, [clearTimer]);
  const toggleAutoRedirect = useCallback(() => {
    const newAutoRedirect = !autoRedirect; setAutoRedirect(newAutoRedirect);
    if (newAutoRedirect) startTimer(); else clearTimer();
  }, [autoRedirect, startTimer, clearTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showConfirm) return;
      switch (event.key) {
        case 'Escape': cancelRedirect(); break;
        case 'Enter': confirmRedirect(MAIN_DOC_URL); break;
        case '1': confirmRedirect(MAIN_DOC_URL); break;
        case '2': confirmRedirect(BACKUP_DOC_URL); break;
        case ' ': event.preventDefault(); toggleAutoRedirect(); break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showConfirm, cancelRedirect, confirmRedirect, toggleAutoRedirect]);

  useEffect(() => () => clearTimer(), [clearTimer]);
  useEffect(() => { if (showConfirm && dialogRef.current) dialogRef.current.focus(); }, [showConfirm]);

  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.6 }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

          {/* Header card */}
          <m.div
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30 overflow-hidden mb-4 sm:mb-6"
            variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.6 }}
          >
            <div className="bg-[#023047] px-6 py-5 text-white">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-xl sm:text-2xl font-bold font-songti flex items-center gap-3">
                  <FaFileAlt className="text-[#FFB703] flex-shrink-0" />
                  <span>API 文档 / API Documentation</span>
                </h1>
                <div className="flex gap-2 items-center">
                  {([['zh', '中文'], ['en', 'EN']] as const).map(([key, label]) => (
                    <m.button key={key}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${lang === key ? 'bg-[#FFB703] text-[#023047]' : 'bg-white/10 text-white hover:bg-white/20'}`}
                      onClick={() => setLang(key)} whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                      {label}
                    </m.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="p-6 sm:p-8 text-center">
              <m.div className="mb-6" variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.3 }}>
                <m.div
                  className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gradient-to-br from-[#8ECAE6]/30 to-[#219EBC]/20 rounded-full flex items-center justify-center shadow-lg border border-[#8ECAE6]/30"
                  initial={prefersReducedMotion ? undefined : { scale: 0, rotate: -180 }}
                  animate={prefersReducedMotion ? undefined : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.6, delay: 0.4, type: "spring", stiffness: 200 }}
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.1, rotate: 5 }}
                >
                  <FaFileAlt className="w-8 h-8 sm:w-10 sm:h-10 text-[#219EBC]" />
                </m.div>
                <h2 className="text-2xl font-bold font-songti text-[#023047] mb-3">
                  {lang === 'zh' ? 'Happy-TTS API 文档' : 'Happy-TTS API Documentation'}
                </h2>
                <p className="text-[#023047]/60 mb-6 max-w-2xl mx-auto leading-relaxed text-sm">
                  {lang === 'zh'
                    ? '您即将跳转到 Happy-TTS API 文档站点，该站点包含完整的 API 参考、教程和最佳实践。'
                    : 'You are about to be redirected to the Happy-TTS API documentation site, which contains complete API reference, tutorials and best practices.'
                  }
                </p>
              </m.div>

              {/* Info box */}
              <m.div className="bg-[#8ECAE6]/10 border border-[#8ECAE6]/30 rounded-xl p-5 mb-6 text-center"
                variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.5 }}>
                <div className="flex flex-col items-center">
                  <FaInfoCircle className="h-5 w-5 text-[#219EBC] mb-2" />
                  <h3 className="text-sm font-semibold text-[#023047] mb-2">
                    {lang === 'zh' ? '附属网站说明' : 'Affiliate Site Notice'}
                  </h3>
                  <div className="mt-1 text-sm text-[#023047]/70">
                    <p className="mb-2">
                      {lang === 'zh'
                        ? <><span className="font-semibold text-[#219EBC]">Happy-TTS API 文档服务</span> 由以下两个附属站点联合提供，内容完全一致，均为官方维护：</>
                        : <><span className="font-semibold text-[#219EBC]">Happy-TTS API documentation</span> is provided by two official affiliate sites below. Content is identical and officially maintained:</>
                      }
                    </p>
                    <ul className="text-left text-xs md:text-sm mt-2 ml-4 list-disc space-y-1">
                      <li>
                        <span className="font-semibold text-[#023047]">{lang === 'zh' ? '主站点：' : 'Main: '}</span>
                        <a href={MAIN_DOC_URL} target="_blank" rel="noopener noreferrer" className="text-[#219EBC] underline hover:text-[#023047] font-bold">tts-api-docs.hapx.one</a>
                        <span className="ml-1 text-[#023047]/40">{lang === 'zh' ? '（推荐，速度快，优先访问）' : ' (Recommended, fast, preferred)'}</span>
                      </li>
                      <li>
                        <span className="font-semibold text-[#023047]">{lang === 'zh' ? '备用站点：' : 'Backup: '}</span>
                        <a href={BACKUP_DOC_URL} target="_blank" rel="noopener noreferrer" className="text-[#219EBC] underline hover:text-[#023047]">tts-api-docs.hapxs.com</a>
                        <span className="ml-1 text-[#023047]/40">{lang === 'zh' ? '（如主站点无法访问时使用）' : ' (Use if main is unavailable)'}</span>
                      </li>
                    </ul>
                    <div className="mt-2 text-xs text-[#023047]/30">
                      {lang === 'zh' ? '所有文档均为 Happy-TTS 官方团队维护，确保内容权威、及时更新。' : 'All docs are maintained by the Happy-TTS official team, ensuring authority and timely updates.'}
                    </div>
                  </div>
                </div>
              </m.div>

              {/* CTA */}
              <m.div className="flex flex-col gap-3 justify-center items-center" variants={effectiveCardVariants} initial="hidden" animate="visible" transition={{ duration: 0.5, delay: 0.6 }}>
                <m.button onClick={handleRedirect}
                  className="group w-full sm:w-auto bg-[#FFB703] hover:bg-[#FB8500] text-[#023047] font-semibold py-3 sm:py-4 px-6 sm:px-10 rounded-xl shadow-lg shadow-[#FFB703]/20 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-3 text-base sm:text-lg relative overflow-hidden"
                  whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                  <FaExternalLinkAlt className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-12 transition-transform duration-300" />
                  {lang === 'zh' ? '访问文档站点' : 'Visit Documentation'}
                </m.button>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-[#023047]/40">
                  <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{lang === 'zh' ? '点击后将在新窗口打开' : 'Opens in a new window'}</span>
                </div>
              </m.div>
            </div>
          </m.div>

          {/* Confirmation dialog */}
          <AnimatePresence>
            {showConfirm && (
              <m.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={cancelRedirect}>
                <m.div ref={dialogRef}
                  className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 sm:p-7 max-w-lg w-full mx-2 sm:mx-4 shadow-2xl border border-[#8ECAE6]/30 relative my-4 sm:my-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto focus:outline-none"
                  initial={{ opacity: 0, scale: 0.85, y: 50 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: 50 }}
                  transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 28 }} onClick={e => e.stopPropagation()} tabIndex={-1}>

                  {/* Close */}
                  <m.button onClick={cancelRedirect} className="absolute top-3 right-3 w-8 h-8 bg-[#8ECAE6]/20 hover:bg-[#8ECAE6]/40 rounded-full flex items-center justify-center transition-colors"
                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, delay: 0.25 }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <FaTimes className="w-3.5 h-3.5 text-[#023047]" />
                  </m.button>

                  {/* Header banner */}
                  <div className="bg-[#023047] text-white rounded-xl p-4 mb-5 flex items-center gap-3 pr-10">
                    <div className="w-9 h-9 bg-[#FFB703] rounded-lg flex items-center justify-center flex-shrink-0">
                      <FaInfoCircle className="w-4 h-4 text-[#023047]" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold font-songti">
                      {lang === 'zh' ? '请选择 API 文档站点' : 'Select API Documentation Site'}
                    </h3>
                  </div>

                  <p className="text-[#023047]/70 mb-4 leading-relaxed text-sm sm:text-base">
                    {lang === 'zh' ? (
                      <>
                        <span className="block mb-1 font-semibold text-[#219EBC]">官方 API 文档站点</span>
                        <span className="block mb-1">Happy-TTS 致力于为开发者提供权威、详尽、持续更新的 API 文档，助力高效集成与创新应用。</span>
                        <span className="block mb-1 text-[#219EBC]">主站点响应速度快，稳定性高，推荐优先访问。</span>
                        <span className="block mb-1 text-[#023047]/50">如遇网络问题，可选择备用站点，内容完全一致。</span>
                        <span className="block mt-2 text-xs text-[#023047]/30">（为保障访问体验，5 秒后将自动跳转主站点）</span>
                      </>
                    ) : (
                      <>
                        <span className="block mb-1 font-semibold text-[#219EBC]">Official API Documentation Sites</span>
                        <span className="block mb-1">Happy-TTS is committed to providing developers with authoritative, detailed, and continuously updated API docs.</span>
                        <span className="block mb-1 text-[#219EBC]">The main site is fast and highly stable. Recommended for most users.</span>
                        <span className="block mb-1 text-[#023047]/50">If you have network issues, use the backup site. Content is identical.</span>
                        <span className="block mt-2 text-xs text-[#023047]/30">(Auto redirect to main site in 5 seconds)</span>
                      </>
                    )}
                  </p>

                  {/* Site buttons */}
                  <div className="flex flex-col gap-3 mb-4">
                    <m.button onClick={() => confirmRedirect(MAIN_DOC_URL)}
                      className="relative flex-1 bg-[#FFB703] hover:bg-[#FB8500] text-[#023047] font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-[#FFB703]/20 text-base flex items-center justify-center gap-2"
                      whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                      <FaExternalLinkAlt className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lang === 'zh' ? '主站点：hapx.one（推荐）' : 'Main: hapx.one (Recommended)'}</span>
                      <span className="absolute top-1 right-1 text-xs bg-[#023047]/20 text-[#023047] rounded px-1.5 py-0.5 font-mono">1</span>
                      {autoRedirect && (
                        <span className="hidden sm:inline ml-2 text-xs bg-[#023047]/10 text-[#023047] rounded px-2 py-0.5 font-mono animate-pulse">
                          {lang === 'zh' ? `（${countdown}秒后自动跳转）` : `(Auto in ${countdown}s)`}
                        </span>
                      )}
                    </m.button>

                    {autoRedirect && (
                      <div className="text-center">
                        <div className="sm:hidden text-xs text-[#023047]/40 animate-pulse mb-2">
                          {lang === 'zh' ? `${countdown}秒后自动跳转主站点` : `Auto redirect in ${countdown}s`}
                        </div>
                        <div className="w-full bg-[#8ECAE6]/20 rounded-full h-1.5 overflow-hidden">
                          <m.div className="h-full bg-gradient-to-r from-[#219EBC] to-[#FFB703] rounded-full"
                            initial={{ width: '100%' }} animate={{ width: `${(countdown / 5) * 100}%` }} transition={{ duration: 0.1, ease: 'linear' }} />
                        </div>
                      </div>
                    )}

                    <m.button onClick={() => confirmRedirect(BACKUP_DOC_URL)}
                      className="relative flex-1 border-2 border-[#8ECAE6]/40 bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 text-[#023047] font-semibold py-3 px-4 rounded-xl transition-all duration-200 text-base flex items-center justify-center gap-2"
                      whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                      <FaLink className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lang === 'zh' ? '备用站点：hapxs.com' : 'Backup: hapxs.com'}</span>
                      <span className="absolute top-1 right-1 text-xs bg-[#8ECAE6]/30 text-[#023047] rounded px-1.5 py-0.5 font-mono">2</span>
                    </m.button>
                  </div>

                  {/* Control row */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <m.button onClick={cancelRedirect} className="flex-1 bg-[#8ECAE6]/10 hover:bg-[#8ECAE6]/20 text-[#023047]/70 font-semibold py-2.5 px-4 rounded-xl border border-[#8ECAE6]/30 text-sm transition-all"
                      whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                      {lang === 'zh' ? '取消 (Esc)' : 'Cancel (Esc)'}
                    </m.button>
                    <m.button onClick={toggleAutoRedirect}
                      className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${autoRedirect ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' : 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200'}`}
                      whileHover={ITEM_HOVER} whileTap={BUTTON_TAP}>
                      {autoRedirect ? (lang === 'zh' ? '取消自动跳转 (空格)' : 'Cancel Auto (Space)') : (lang === 'zh' ? '启用自动跳转 (空格)' : 'Enable Auto (Space)')}
                    </m.button>
                  </div>

                  {/* Shortcuts */}
                  <div className="p-3 bg-[#8ECAE6]/10 rounded-xl border border-[#8ECAE6]/20 mb-5">
                    <div className="text-xs text-[#023047]/60 text-center">
                      {lang === 'zh' ? '快捷键：' : 'Shortcuts: '}
                      {[['1', lang === 'zh' ? '主站点' : 'Main'], ['2', lang === 'zh' ? '备用' : 'Backup'], ['Space', lang === 'zh' ? '切换自动' : 'Toggle Auto'], ['Esc', lang === 'zh' ? '取消' : 'Cancel']].map(([key, label], i) => (
                        <span key={key}>{i > 0 && ' • '}<span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#8ECAE6]/30 text-[#023047]">{key}</span> {label}</span>
                      ))}
                    </div>
                  </div>

                  {/* FAQ */}
                  <div className="p-4 bg-[#8ECAE6]/10 rounded-xl border border-[#8ECAE6]/20 text-left">
                    <div className="font-bold text-[#023047] mb-3 text-sm flex items-center gap-2">
                      <FaQuestionCircle className="w-4 h-4 text-[#219EBC]" />
                      {lang === 'zh' ? '常见问题 FAQ' : 'Frequently Asked Questions'}
                    </div>
                    {[
                      {
                        q: lang === 'zh' ? 'Q: 为什么有时会被连续跳转两次？' : 'Q: Why am I sometimes redirected twice?',
                        a: lang === 'zh' ? '部分浏览器或网络环境下，主站点可能因 CDN、缓存或安全策略导致首次跳转失败，系统会自动尝试再次跳转以确保您能顺利访问文档。若遇到此情况，建议检查网络或直接访问备用站点。' : 'In some browsers or network environments, the main site may fail to load on the first attempt due to CDN, cache, or security policies. The system will automatically try a second redirect. Please check your network or use the backup site.'
                      },
                      {
                        q: lang === 'zh' ? 'Q: 站点内容有区别吗？' : 'Q: Is there any difference between the two sites?',
                        a: lang === 'zh' ? '两个站点内容完全一致，均为 Happy-TTS 官方团队同步维护。' : 'Both sites have identical content and are maintained by the Happy-TTS official team.'
                      }
                    ].map(({ q, a }) => (
                      <div key={q} className="mb-3 last:mb-0">
                        <div className="font-semibold text-[#023047] text-sm mb-1">{q}</div>
                        <div className="text-[#023047]/60 text-xs leading-relaxed">{a}</div>
                      </div>
                    ))}
                  </div>
                </m.div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.div>
    </LazyMotion>
  );
};

export default ApiDocs;