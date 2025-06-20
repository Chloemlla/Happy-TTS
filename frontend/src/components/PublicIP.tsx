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

const REPORT_DEBOUNCE_KEY = 'lastPublicIPReport';
const REPORT_DEBOUNCE_INTERVAL = 10 * 1000; // 30秒

const PublicIP: React.FC = () => {
  const [ip, setIP] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // 防抖：10秒内只上报一次
    const lastReport = Number(localStorage.getItem(REPORT_DEBOUNCE_KEY) || 0);
    const now = Date.now();
    if (now - lastReport < REPORT_DEBOUNCE_INTERVAL) return;

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
            timestamp: now,
          }),
        }).then(() => {
          localStorage.setItem(REPORT_DEBOUNCE_KEY, String(now));
        }).catch(() => {});
      })
      .catch(() => {
        setError('获取公网IP失败');
      });
  }, []);

  return null;
};

export default PublicIP; 