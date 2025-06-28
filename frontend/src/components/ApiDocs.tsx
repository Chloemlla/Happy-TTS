import React, { useState } from 'react';

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
    <div>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-indigo-700">API 文档 / API Documentation</h1>
          <div className="flex gap-2 items-center">
            <button className={lang==='zh' ? 'font-bold underline' : ''} onClick={()=>setLang('zh')}>中文</button>
            <span className="text-gray-400">/</span>
            <button className={lang==='en' ? 'font-bold underline' : ''} onClick={()=>setLang('en')}>EN</button>
          </div>
        </div>
        
        {/* 主要内容区域 */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {lang==='zh' ? 'Synapse API 文档' : 'Synapse API Documentation'}
            </h2>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              {lang==='zh' 
                ? '您即将跳转到 Synapse API 文档站点，该站点包含完整的 API 参考、教程和最佳实践。' 
                : 'You are about to be redirected to the Synapse API documentation site, which contains complete API reference, tutorials and best practices.'
              }
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 mb-2">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-blue-800 mb-1">
                {lang==='zh' ? '附属网站说明' : 'Affiliate Site Notice'}
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  {lang==='zh' 
                    ? 'tts-api-docs.hapxs.com 是本站点的附属网站，专门提供 API 文档服务。' 
                    : 'tts-api-docs.hapxs.com is an affiliate site of this website, specifically providing API documentation services.'
                  }
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleRedirect}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center mx-auto"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {lang==='zh' ? '查看 API 文档' : 'View API Documentation'}
          </button>
        </div>

        {/* 确认对话框 */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {lang==='zh' ? '确认跳转' : 'Confirm Redirect'}
              </h3>
              <p className="text-gray-600 mb-6">
                {lang==='zh' 
                  ? '您即将跳转到附属网站 tts-api-docs.hapxs.com，该网站将在新窗口中打开。' 
                  : 'You are about to be redirected to the affiliate site tts-api-docs.hapxs.com, which will open in a new window.'
                }
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmRedirect}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {lang==='zh' ? '确认跳转' : 'Confirm'}
                </button>
                <button
                  onClick={cancelRedirect}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {lang==='zh' ? '取消' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiDocs; 