import { useEffect, useState } from 'react';
import { passkeyApi } from '../api/passkey';
import axios from 'axios';

export function useTwoFactorStatus() {
  const [status, setStatus] = useState<{ enabled: boolean, type: string[] }>({ enabled: false, type: [] });

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [totpRes, passkeyRes] = await Promise.all([
          axios.get('/api/totp/status', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          passkeyApi.getCredentials()
        ]);
        const totpEnabled = totpRes.data?.enabled;
        const passkeyEnabled = Array.isArray(passkeyRes.data) && passkeyRes.data.length > 0;
        const type = [];
        if (totpEnabled) type.push('TOTP');
        if (passkeyEnabled) type.push('Passkey');
        setStatus({ enabled: totpEnabled || passkeyEnabled, type });
      } catch {
        setStatus({ enabled: false, type: [] });
      }
    }
    fetchStatus();
  }, []);

  return status;
} 