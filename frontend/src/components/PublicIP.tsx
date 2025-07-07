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

  return null;
};

export default PublicIP; 