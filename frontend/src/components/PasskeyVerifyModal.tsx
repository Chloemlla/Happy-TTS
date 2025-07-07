import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePasskey } from '../hooks/usePasskey';

interface PasskeyVerifyModalProps {
  open: boolean;
  username: string;
  onSuccess: () => void;
  onClose: () => void;
}

const PasskeyVerifyModal: React.FC<PasskeyVerifyModalProps> = ({ open, username, onSuccess, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { authenticateWithPasskey } = usePasskey();

  if (!open) return null;

  const handlePasskeyAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await authenticateWithPasskey(username);
      if (result === true) {
        onSuccess();
      } else {
        setError('认证失败，请重试');
      }
    } catch (e: any) {
      setError(e?.message || '认证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 320, textAlign: 'center' }}>
        <h2>Passkey 二次校验</h2>
        {loading ? (
          <div style={{ margin: '24px 0' }}>正在进行 Passkey 认证，请在弹出的系统窗口中操作...</div>
        ) : error ? (
          <>
            <div style={{ color: 'red', margin: '16px 0' }}>{error}</div>
            <button onClick={handlePasskeyAuth} style={{ marginTop: 12 }}>重试</button>
          </>
        ) : (
          <button onClick={handlePasskeyAuth} style={{ margin: '24px 0', padding: '8px 24px', fontSize: 16 }}>开始 Passkey 认证</button>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={loading}>取消</button>
        </div>
      </div>
    </div>
  );
};

export default PasskeyVerifyModal; 