import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaFileAlt, FaInfoCircle, FaExternalLinkAlt, FaLink, FaQuestionCircle, FaTimes } from 'react-icons/fa';

const MAIN_DOC_URL = 'https://tts-api-docs.hapx.one';
const BACKUP_DOC_URL = 'https://tts-api-docs.hapxs.com';

const ApiDocs: React.FC = () => {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [autoRedirect, setAutoRedirect] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 清理计时器
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 启动计时器
  const startTimer = useCallback(() => {
    clearTimer();
    setCountdown(5);
    
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
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

  // 处理跳转
  const handleRedirect = useCallback(() => {
    setShowConfirm(true);
    setAutoRedirect(true);
    startTimer();
  }, [startTimer]);

  // 确认跳转
  const confirmRedirect = useCallback((url: string) => {
    clearTimer();
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowConfirm(false);
  }, [clearTimer]);

  // 取消跳转
  const cancelRedirect = useCallback(() => {
    clearTimer();
    setShowConfirm(false);
  }, [clearTimer]);

  // 切换自动跳转
  const toggleAutoRedirect = useCallback(() => {
    const newAutoRedirect = !autoRedirect;
    setAutoRedirect(newAutoRedirect);
    
    if (newAutoRedirect) {
      startTimer();
    } else {
      clearTimer();
    }
  }, [autoRedirect, startTimer, clearTimer]);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showConfirm) return;
      
      switch (event.key) {
        case 'Escape':
          cancelRedirect();
          break;
        case 'Enter':
          confirmRedirect(MAIN_DOC_URL);
          break;
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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showConfirm, cancelRedirect, confirmRedirect, toggleAutoRedirect]);

  // 组件卸载时清理计时器
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // 焦点管理
  useEffect(() => {
    if (showConfirm && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [showConfirm]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* 标题和语言切换 */}
        <motion.div
          className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100 mb-4 sm:mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-700 flex items-center gap-2 sm:gap-3">
              <FaFileAlt className="text-xl sm:text-2xl lg:text-3xl text-blue-600 flex-shrink-0" />
              <span className="leading-tight">API 文档 / API Documentation</span>
            </h1>
            <div className="flex gap-2 items-center justify-center sm:justify-end">
              <motion.button
                className={`px-3 sm:px-4 py-2 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base ${lang === 'zh'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-blue-50 border border-blue-200'
                  }`}
                onClick={() => setLang('zh')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                中文
              </motion.button>
              <span className="text-gray-400">/</span>
              <motion.button
                className={`px-3 sm:px-4 py-2 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base ${lang === 'en'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-blue-50 border border-blue-200'
                  }`}
                onClick={() => setLang('en')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                EN
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* 主要内容区域 */}
        <motion.div
          className="bg-white rounded-xl shadow-lg p-4 sm:p-6 lg:p-8 text-center border border-gray-200"
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, type: "spring", stiffness: 100 }}
        >
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center shadow-lg"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, delay: 0.6, type: "spring", stiffness: 200 }}
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <FaFileAlt className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600" />
            </motion.div>
            <motion.h2
              className="text-2xl font-bold text-gray-900 mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              {lang === 'zh' ? 'Synapse API 文档' : 'Synapse API Documentation'}
            </motion.h2>
            <motion.p
              className="text-gray-600 mb-6 max-w-2xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              {lang === 'zh'
                ? '您即将跳转到 Synapse API 文档站点，该站点包含完整的 API 参考、教程和最佳实践。'
                : 'You are about to be redirected to the Synapse API documentation site, which contains complete API reference, tutorials and best practices.'
              }
            </motion.p>
          </motion.div>

          <motion.div
            className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-6 text-center shadow-sm"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9, type: "spring", stiffness: 100 }}
            whileHover={{ scale: 1.02, y: -2 }}
          >
            <div className="flex flex-col items-center">
              <motion.div
                className="flex-shrink-0 mb-3"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 1.0, type: "spring", stiffness: 300 }}
              >
                <FaInfoCircle className="h-6 w-6 text-blue-500" />
              </motion.div>
              <motion.h3
                className="text-sm font-semibold text-blue-800 mb-2"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1.1 }}
              >
                {lang === 'zh' ? '附属网站说明' : 'Affiliate Site Notice'}
              </motion.h3>
              <motion.div
                className="mt-2 text-sm text-blue-700"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1.2 }}
              >
                <p className="mb-1">
                  {lang === 'zh'
                    ? (
                      <>
                        <span className="font-semibold text-indigo-700">Synapse API 文档服务</span> 由以下两个附属站点联合提供，内容完全一致，均为官方维护：
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-indigo-700">Synapse API documentation</span> is provided by two official affiliate sites below. Content is identical and officially maintained:
                      </>
                    )
                  }
                </p>
                <ul className="text-left text-xs md:text-sm mt-2 ml-4 list-disc">
                  <li>
                    <span className="font-semibold text-blue-700">{lang === 'zh' ? '主站点：' : 'Main: '}</span>
                    <a href={MAIN_DOC_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900 font-bold">tts-api-docs.hapx.one</a>
                    <span className="ml-1 text-gray-500">{lang === 'zh' ? '（推荐，速度快，优先访问）' : ' (Recommended, fast, preferred)'} </span>
                  </li>
                  <li>
                    <span className="font-semibold text-blue-700">{lang === 'zh' ? '备用站点：' : 'Backup: '}</span>
                    <a href={BACKUP_DOC_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">tts-api-docs.hapxs.com</a>
                    <span className="ml-1 text-gray-500">{lang === 'zh' ? '（如主站点无法访问时使用）' : ' (Use if main is unavailable)'}</span>
                  </li>
                </ul>
                <div className="mt-2 text-xs text-gray-400">
                  {lang === 'zh' ? '所有文档均为 Synapse 官方团队维护，确保内容权威、及时更新。' : 'All docs are maintained by the Synapse official team, ensuring authority and timely updates.'}
                </div>
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <motion.button
              onClick={handleRedirect}
              className="group w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-3 text-base sm:text-lg relative overflow-hidden"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.6 }}
              />
              <FaExternalLinkAlt className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-12 transition-transform duration-300" />
              {lang === 'zh' ? '访问文档站点' : 'Visit Documentation'}
            </motion.button>
            <motion.div
              className="flex items-center gap-2 text-xs sm:text-sm text-gray-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.2 }}
            >
              <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>
                {lang === 'zh' ? '点击后将在新窗口打开' : 'Opens in a new window'}
              </span>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* 确认对话框 */}
        <AnimatePresence>
            {showConfirm && (
              <motion.div
                className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={cancelRedirect}
              >
                <motion.div
                  ref={dialogRef}
                  className="bg-white rounded-xl p-4 sm:p-6 max-w-lg w-full mx-2 sm:mx-4 shadow-xl border border-gray-200 relative my-4 sm:my-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto focus:outline-none"
                  initial={{ opacity: 0, scale: 0.8, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 50 }}
                  transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 25 }}
                  onClick={e => e.stopPropagation()}
                  tabIndex={-1}
                >
                  {/* 关闭按钮 */}
                  <motion.button
                    onClick={cancelRedirect}
                    className="absolute top-3 right-3 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: 0.3 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <FaTimes className="w-4 h-4 text-gray-600" />
                  </motion.button>

                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <div className="flex items-center mb-4 pr-8">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <FaInfoCircle className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                        {lang === 'zh' ? '请选择 API 文档站点' : 'Select API Documentation Site'}
                      </h3>
                    </div>
                  </motion.div>
                  <motion.p
                    className="text-gray-600 mb-4 leading-relaxed text-sm sm:text-base"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    {lang === 'zh'
                      ? (
                        <>
                          <span className="block mb-1 font-semibold text-blue-700">官方 API 文档站点</span>
                          <span className="block mb-1">Synapse 致力于为开发者提供权威、详尽、持续更新的 API 文档，助力高效集成与创新应用。</span>
                          <span className="block mb-1 text-blue-700">主站点响应速度快，稳定性高，推荐优先访问。</span>
                          <span className="block mb-1 text-gray-500">如遇网络问题，可选择备用站点，内容完全一致。</span>
                          <span className="block mt-2 text-xs text-gray-400">（为保障访问体验，5 秒后将自动跳转主站点）</span>
                        </>
                      ) : (
                        <>
                          <span className="block mb-1 font-semibold text-blue-700">Official API Documentation Sites</span>
                          <span className="block mb-1">Synapse is committed to providing developers with authoritative, detailed, and continuously updated API docs for efficient integration and innovation.</span>
                          <span className="block mb-1 text-blue-700">The main site is fast and highly stable. Recommended for most users.</span>
                          <span className="block mb-1 text-gray-500">If you have network issues, use the backup site. Content is identical.</span>
                          <span className="block mt-2 text-xs text-gray-400">(For your convenience, you will be redirected to the main site in 5 seconds)</span>
                        </>
                      )
                    }
                  </motion.p>
                  <motion.div className="flex flex-col gap-3 mb-4">
                    <motion.button
                      onClick={() => confirmRedirect(MAIN_DOC_URL)}
                      className="relative flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-3 sm:px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl text-base sm:text-lg flex items-center justify-center gap-2 border-2 border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <FaExternalLinkAlt className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="truncate">{lang === 'zh' ? '主站点：hapx.one（推荐）' : 'Main: hapx.one (Recommended)'}</span>
                      <span className="absolute top-1 right-1 text-xs bg-white bg-opacity-20 text-white rounded px-1.5 py-0.5 font-mono">1</span>
                      {autoRedirect && (
                        <span className="hidden sm:inline ml-2 text-xs bg-white bg-opacity-80 text-blue-700 rounded px-2 py-0.5 font-mono animate-pulse">{lang === 'zh' ? `（${countdown}秒后自动跳转）` : `(Auto in ${countdown}s)`}</span>
                      )}
                    </motion.button>
                    {autoRedirect && (
                      <motion.div 
                        className="text-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="sm:hidden text-xs text-blue-200 animate-pulse mb-2">
                          {lang === 'zh' ? `${countdown}秒后自动跳转主站点` : `Auto redirect in ${countdown}s`}
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                            initial={{ width: '100%' }}
                            animate={{ width: `${(countdown / 5) * 100}%` }}
                            transition={{ duration: 0.1, ease: 'linear' }}
                          />
                        </div>
                      </motion.div>
                    )}
                    <motion.button
                      onClick={() => confirmRedirect(BACKUP_DOC_URL)}
                      className="relative flex-1 bg-gradient-to-r from-blue-100 to-indigo-50 hover:from-blue-200 hover:to-indigo-100 text-blue-700 font-semibold py-3 px-3 sm:px-4 rounded-xl transition-all duration-200 border-2 border-blue-200 text-base sm:text-lg flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <FaLink className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="truncate">{lang === 'zh' ? '备用站点：hapxs.com' : 'Backup: hapxs.com'}</span>
                      <span className="absolute top-1 right-1 text-xs bg-blue-200 text-blue-700 rounded px-1.5 py-0.5 font-mono">2</span>
                    </motion.button>
                  </motion.div>
                  <motion.div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <motion.button
                      onClick={cancelRedirect}
                      className="relative flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-3 sm:px-4 rounded-xl transition-all duration-200 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm sm:text-base"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {lang === 'zh' ? '取消 (Esc)' : 'Cancel (Esc)'}
                    </motion.button>
                    <motion.button
                      onClick={toggleAutoRedirect}
                      className={`relative flex-1 py-3 px-3 sm:px-4 rounded-xl transition-all duration-200 border-2 focus:outline-none focus:ring-2 text-xs sm:text-sm font-semibold ${autoRedirect
                          ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 focus:ring-red-200'
                          : 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200 focus:ring-green-200'
                        }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {autoRedirect
                        ? (lang === 'zh' ? '取消自动跳转 (空格)' : 'Cancel Auto (Space)')
                        : (lang === 'zh' ? '启用自动跳转 (空格)' : 'Enable Auto (Space)')
                      }
                    </motion.button>
                  </motion.div>
                  {/* 键盘快捷键提示 */}
                  <motion.div 
                    className="mb-4 p-2 bg-blue-50 rounded-lg border border-blue-200"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    <div className="text-xs text-blue-700 text-center">
                      {lang === 'zh' ? '快捷键：' : 'Shortcuts: '}
                      <span className="font-mono bg-white px-1 rounded">1</span> {lang === 'zh' ? '主站点' : 'Main'} • 
                      <span className="font-mono bg-white px-1 rounded ml-1">2</span> {lang === 'zh' ? '备用' : 'Backup'} • 
                      <span className="font-mono bg-white px-1 rounded ml-1">Space</span> {lang === 'zh' ? '切换自动' : 'Toggle Auto'} • 
                      <span className="font-mono bg-white px-1 rounded ml-1">Esc</span> {lang === 'zh' ? '取消' : 'Cancel'}
                    </div>
                  </motion.div>
                  {/* FAQ 区域 */}
                  <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200 text-left">
                    <div className="font-bold text-blue-700 mb-2 text-sm sm:text-base flex items-center gap-2">
                      <FaQuestionCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                      {lang === 'zh' ? '常见问题 FAQ' : 'Frequently Asked Questions'}
                    </div>
                    <div className="mb-2">
                      <div className="font-semibold text-gray-800 text-sm mb-1">
                        {lang === 'zh' ? 'Q: 为什么有时会被连续跳转两次？' : 'Q: Why am I sometimes redirected twice?'}
                      </div>
                      <div className="text-gray-600 text-xs md:text-sm">
                        {lang === 'zh'
                          ? '部分浏览器或网络环境下，主站点可能因 CDN、缓存或安全策略导致首次跳转失败，系统会自动尝试再次跳转以确保您能顺利访问文档。若遇到此情况，建议检查网络或直接访问备用站点。'
                          : 'In some browsers or network environments, the main site may fail to load on the first attempt due to CDN, cache, or security policies. The system will automatically try a second redirect to ensure you can access the docs. If this happens, please check your network or use the backup site.'
                        }
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm mb-1">
                        {lang === 'zh' ? 'Q: 站点内容有区别吗？' : 'Q: Is there any difference between the two sites?'}
                      </div>
                      <div className="text-gray-600 text-xs md:text-sm">
                        {lang === 'zh'
                          ? '两个站点内容完全一致，均为 Synapse 官方团队同步维护。'
                          : 'Both sites have identical content and are maintained by the Synapse official team.'
                        }
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ApiDocs;