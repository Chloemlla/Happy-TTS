import React, { useEffect, useState } from 'react';

const PublicIP: React.FC = () => {
  const [ip, setIp] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetch('/api/get-ip')
      .then(res => res.json())
      .then(data => {
        setIp(data.ip || data.IPv4 || data.ipv4 || JSON.stringify(data));
      })
      .catch(() => setError('获取IP失败'));
  }, []);

  return (
    <div>
      <h3>公网IP</h3>
      {ip ? <p>{ip}</p> : <p>{error || '加载中...'}</p>}
    </div>
  );
};

export default PublicIP; 