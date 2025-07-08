import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="text-center text-gray-500 mt-8 mb-2 text-sm select-none flex flex-col items-center gap-1">
      <div>
        Copyright ©{' '}
        <a 
          href="https://github.com/Happy-clo" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="hover:text-blue-500 transition-colors duration-200"
        >
          Individual Developer Happy-clo
        </a>{' '}
        {year}
      </div>
      <div className="mt-1 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-xs max-w-xs">
        ⚠️ 本站为个人独立开发项目，与 OpenAI 官方无任何隶属或合作关系。请勿将本站内容视为 OpenAI 官方服务。
      </div>
    </footer>
  );
};

export default Footer; 