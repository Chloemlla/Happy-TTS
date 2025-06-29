import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ApiDocs: React.FC = () => {
  const [lang, setLang] = useState<'zh'|'en'>('zh');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRedirect = () => {
    setShowConfirm(true);
  };

  const confirmRedirect = () => {
    window.open('https://tts-api-docs.hapxs.com', '_blank', 'noopener,noreferrer');
    setShowConfirm(false);
  };

  const cancelRedirect = () => {
    setShowConfirm(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div 
          className="flex justify-between items-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="text-3xl font-bold text-indigo-700">API 文档 / API Documentation</h1>
          <div className="flex gap-2 items-center">
            <motion.button 
              className={`px-3 py-1 rounded-lg transition-all duration-200 ${lang==='zh' ? 'font-bold bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`} 
              onClick={()=>setLang('zh')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              中文
            </motion.button>
            <span className="text-gray-400">/</span>
            <motion.button 
              className={`px-3 py-1 rounded-lg transition-all duration-200 ${lang==='en' ? 'font-bold bg-indigo-100 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`} 
              onClick={()=>setLang('en')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              EN
            </motion.button>
          </div>
        </motion.div>
        
        {/* 主要内容区域 */}
        <motion.div 
          className="bg-white rounded-2xl shadow-2xl p-8 text-center border border-gray-100"
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
              className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center shadow-lg"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, delay: 0.6, type: "spring", stiffness: 200 }}
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </motion.div>
            <motion.h2 
              className="text-2xl font-bold text-gray-900 mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              {lang==='zh' ? 'Synapse API 文档' : 'Synapse API Documentation'}
            </motion.h2>
            <motion.p 
              className="text-gray-600 mb-6 max-w-2xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              {lang==='zh' 
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
                <svg className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </motion.div>
              <motion.h3 
                className="text-sm font-semibold text-blue-800 mb-2"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1.1 }}
              >
                {lang==='zh' ? '附属网站说明' : 'Affiliate Site Notice'}
              </motion.h3>
              <motion.div 
                className="mt-2 text-sm text-blue-700"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 1.2 }}
              >
                <p>
                  {lang==='zh' 
                    ? 'tts-api-docs.hapxs.com 是本站点的附属网站，专门提供 API 文档服务。' 
                    : 'tts-api-docs.hapxs.com is an affiliate site of this website, specifically providing API documentation services.'
                  }
                </p>
              </motion.div>
            </div>
          </motion.div>

          <motion.button
            onClick={handleRedirect}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-4 px-10 rounded-xl transition-all duration-300 flex items-center mx-auto shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0, type: "spring", stiffness: 100 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.svg 
              className="w-5 h-5 mr-3" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              initial={{ x: -5, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </motion.svg>
            {lang==='zh' ? '查看 API 文档' : 'View API Documentation'}
          </motion.button>
        </motion.div>

        {/* 确认对话框 */}
        <AnimatePresence>
          {showConfirm && (
            <motion.div 
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setShowConfirm(false)}
            >
              <motion.div 
                className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-gray-100"
                initial={{ opacity: 0, scale: 0.8, y: 50 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 50 }}
                transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {lang==='zh' ? '确认跳转' : 'Confirm Redirect'}
                    </h3>
                  </div>
                </motion.div>
                
                <motion.p 
                  className="text-gray-600 mb-6 leading-relaxed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  {lang==='zh' 
                    ? '您即将跳转到附属网站 tts-api-docs.hapxs.com，该网站将在新窗口中打开。' 
                    : 'You are about to be redirected to the affiliate site tts-api-docs.hapxs.com, which will open in a new window.'
                  }
                </motion.p>
                
                <motion.div 
                  className="flex gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <motion.button
                    onClick={confirmRedirect}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {lang==='zh' ? '确认跳转' : 'Confirm'}
                  </motion.button>
                  <motion.button
                    onClick={cancelRedirect}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 border border-gray-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {lang==='zh' ? '取消' : 'Cancel'}
                  </motion.button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ApiDocs; 