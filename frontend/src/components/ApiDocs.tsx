import React, { useState } from 'react';

const ApiDocs: React.FC = () => {
  const [lang, setLang] = useState<'zh'|'en'>('zh');
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? 'dark bg-gray-900 min-h-screen' : ''}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">API 文档 / API Documentation</h1>
          <div className="flex gap-2 items-center">
            <button className={lang==='zh' ? 'font-bold underline' : ''} onClick={()=>setLang('zh')}>中文</button>
            <span className="text-gray-400">/</span>
            <button className={lang==='en' ? 'font-bold underline' : ''} onClick={()=>setLang('en')}>EN</button>
            <span className="ml-4 cursor-pointer" onClick={()=>setDark(d=>!d)} title="切换深色模式/Toggle dark mode">{dark ? '🌙' : '☀️'}</span>
          </div>
        </div>
        
        <div className="mb-8 bg-indigo-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <p className="text-gray-700 dark:text-gray-200 mb-2">
            {lang==='zh' ? '本页面内嵌 Synapse API 文档站点。' : 'This page embeds the Synapse API documentation site.'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {lang==='zh' ? '文档包含完整的 API 参考、教程和最佳实践。' : 'The documentation includes complete API reference, tutorials and best practices.'}
          </p>
        </div>

        {/* 内嵌 Docusaurus 文档页面 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <iframe
            src="https://tts-api-docs.hapxs.com"
            title="Synapse API Documentation"
            className="w-full h-[800px] border-0"
            style={{ minHeight: '800px' }}
          />
        </div>

        {/* 备用链接 */}
        <div className="mt-4 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {lang==='zh' ? '如果上方文档无法正常显示，请' : 'If the documentation above cannot be displayed properly, please '}
            <a 
              href="https://tts-api-docs.hapxs.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
            >
              {lang==='zh' ? '点击此处' : 'click here'}
            </a>
            {lang==='zh' ? '在新窗口中打开。' : ' to open in a new window.'}
          </p>
        </div>

        {/* 启动提示 */}
        <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {lang==='zh' ? '文档服务未启动' : 'Documentation service not started'}
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                <p className="mb-2">
                  {lang==='zh' ? '请先启动 Docusaurus 文档服务：' : 'Please start the Docusaurus documentation service first:'}
                </p>
                <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 font-mono text-xs">
                  <div className="mb-1">
                    <span className="text-green-600 dark:text-green-400">$</span> cd frontend/docs
                  </div>
                  <div className="mb-1">
                    <span className="text-green-600 dark:text-green-400">$</span> npm install
                  </div>
                  <div>
                    <span className="text-green-600 dark:text-green-400">$</span> npm start
                  </div>
                </div>
                <p className="mt-2 text-xs">
                  {lang==='zh' ? '或者双击' : 'Or double-click'} <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">start-docs.bat</code> {lang==='zh' ? '文件快速启动' : 'file to start quickly'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDocs; 