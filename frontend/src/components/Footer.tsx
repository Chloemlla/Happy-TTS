import React, { useState, useEffect } from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  const [uptime, setUptime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [userIP, setUserIP] = useState<string>('');

  useEffect(() => {
    const startDate = new Date('2025-06-15T09:30:00');
    
    const updateUptime = () => {
      const now = new Date();
      const diff = now.getTime() - startDate.getTime();
      
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setUptime({ days, hours, minutes, seconds });
      }
    };

    updateUptime();
    const interval = setInterval(updateUptime, 1000); // 每秒更新一次

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchIP = async () => {
      try {
        // 尝试获取IPv6地址
        const response = await fetch('https://api64.ipify.org?format=json');
        const data = await response.json();
        setUserIP(data.ip);
      } catch (error) {
        try {
          // 如果IPv6失败，尝试IPv4
          const response = await fetch('https://api.ipify.org?format=json');
          const data = await response.json();
          setUserIP(data.ip);
        } catch (fallbackError) {
          setUserIP('获取失败');
        }
      }
    };

    fetchIP();
  }, []);

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
      <div className="mt-1 px-2 py-1 bg-green-50 border border-green-200 rounded text-green-700 text-xs max-w-xs">
        🚀 自 2025年6月15日 9:30 以来，本站已稳定运行{' '}
        <span className="font-bold text-green-800">
          {uptime.days} 天 {uptime.hours} 小时 {uptime.minutes} 分钟 {uptime.seconds} 秒
        </span>
      </div>
      <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-blue-700 text-xs max-w-xs">
        🌐 您的IP地址：{' '}
        <span className="font-mono font-bold text-blue-800">
          {userIP || '获取中...'}
        </span>
      </div>
    </footer>
  );
};

export default Footer; 