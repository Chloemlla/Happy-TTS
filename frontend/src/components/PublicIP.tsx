import React, { useEffect, useState } from 'react';

const IP_APIS = [
  {
    name: 'ipify',
    url: 'https://api.ipify.org?format=json',
    parse: (data: any) => data.ip,
  },
  {
    name: 'ip.sb',
    url: 'https://api.ip.sb/jsonip',
    parse: (data: any) => data.ip,
  },
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (data: any) => data.ip,
  },
  {
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    parse: (data: any) => data.ip,
  },
];

async function getPublicIPWithFallback(): Promise<string> {
  for (const api of IP_APIS) {
    try {
      const res = await fetch(api.url);
      if (!res.ok) continue;
      const data = await res.json();
      const ip = api.parse(data);
      if (ip && typeof ip === 'string') {
        return ip;
      }
    } catch (e) {
      // 继续尝试下一个
      continue;
    }
  }
  throw new Error('所有公网IP API均不可用');
}

const PublicIP: React.FC = () => {
  const [ip, setIP] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    getPublicIPWithFallback()
      .then(ip => {
        setIP(ip);
        // 上报后端，增加更多内容
        fetch('/api/report-ip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip,
            userAgent: navigator.userAgent,
            url: window.location.href,
            referrer: document.referrer,
            timestamp: Date.now(),
          }),
        }).catch(err => {
          // 可选：console.error('上报公网IP失败:', err);
        });
      })
      .catch(err => {
        setError('获取公网IP失败');
        // 可选：console.error('获取公网IP失败:', err);
      });
  }, []);

  return null;
};

export default PublicIP; 