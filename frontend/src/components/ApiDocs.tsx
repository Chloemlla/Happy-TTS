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
            {lang==='zh' ? '本页面内嵌线上 Swagger UI 文档。' : 'This page embeds the online Swagger UI documentation.'}
          </p>
        </div>

        {/* 内嵌线上 Swagger UI */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <iframe
            src="https://tts-api.hapxs.com/api-docs/"
            title="API Documentation"
            className="w-full h-[800px] border-0"
            style={{ minHeight: '800px' }}
          />
        </div>

        {/* 备用链接 */}
        <div className="mt-4 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {lang==='zh' ? '如果上方文档无法正常显示，请' : 'If the documentation above cannot be displayed properly, please '}
            <a 
              href="https://tts-api.hapxs.com/api-docs/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
            >
              {lang==='zh' ? '点击此处' : 'click here'}
            </a>
            {lang==='zh' ? '在新窗口中打开。' : ' to open in a new window.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiDocs; 