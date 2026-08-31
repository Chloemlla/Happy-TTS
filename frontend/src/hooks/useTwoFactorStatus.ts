import { useEffect, useState } from 'react';
import { passkeyApi } from '../api/passkey';
import { api } from '../api/api';


export function useTwoFactorStatus() {
  const [status, setStatus] = useState<{ enabled: boolean, type: string[] }>({ enabled: false, type: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const [totpRes, passkeyRes] = await Promise.all([
          api.get('/api/totp/status'),
          passkeyApi.getCredentials()
        ]);
        const totpEnabled = totpRes.data?.enabled;
        const passkeyEnabled = Array.isArray(passkeyRes.data) && passkeyRes.data.length > 0;
        const type = [];
        if (totpEnabled) type.push('TOTP');
        if (passkeyEnabled) type.push('Passkey');
        if (!cancelled) {
          setStatus({ enabled: totpEnabled || passkeyEnabled, type });
          setError(null);
        }
      } catch (e) {
        // G9-18：失败不再静默吞——设置错误态，UI 可提示"2FA 状态未知"
        if (!cancelled) {
          setStatus({ enabled: false, type: [] });
          setError(e instanceof Error ? e.message : '获取2FA状态失败');
        }
      }
    }
    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  return status;
}