import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FaDesktop, FaMobileAlt, FaQrcode, FaSyncAlt, FaTicketAlt } from 'react-icons/fa';
import {
  exchangeMobileClientToken,
  createMobileLoginChallenge,
  pollMobileLoginChallenge,
  type MobileLoginChallenge,
  type MobileLoginChallengeStatus,
} from '../api/mobileLogin';
import type { User } from '../types/auth';
import { cn } from '../utils/cn';
import {
  authElevatedPanelClassName,
  authInfoPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from './authStudioTheme';
import { useNotification } from './Notification';

interface MobileLoginPanelProps {
  disabled?: boolean;
  loginWithToken: (token: string, user: User) => Promise<void>;
  onSuccess: () => void;
}

const statusText: Record<MobileLoginChallengeStatus, string> = {
  pending: '等待安卓客户端扫码',
  scanned: '已扫码，等待客户端确认',
  approved: '确认完成，正在登录',
  consumed: '已完成',
  expired: '二维码已过期',
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export const MobileLoginPanel: React.FC<MobileLoginPanelProps> = ({ disabled, loginWithToken, onSuccess }) => {
  const { setNotification } = useNotification();
  const [challenge, setChallenge] = React.useState<MobileLoginChallenge | null>(null);
  const [challengeStatus, setChallengeStatus] = React.useState<MobileLoginChallengeStatus>('pending');
  const [challengeLoading, setChallengeLoading] = React.useState(false);
  const [clientLoginToken, setClientLoginToken] = React.useState('');
  const [clientDeviceId, setClientDeviceId] = React.useState('');
  const [tokenLoading, setTokenLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const startChallenge = React.useCallback(async () => {
    setChallengeLoading(true);
    setError(null);
    try {
      const nextChallenge = await createMobileLoginChallenge();
      setChallenge(nextChallenge);
      setChallengeStatus('pending');
    } catch (err) {
      const message = getErrorMessage(err, '创建扫码登录二维码失败');
      setError(message);
      setNotification({ message, type: 'error' });
    } finally {
      setChallengeLoading(false);
    }
  }, [setNotification]);

  React.useEffect(() => {
    if (!challenge || challengeStatus === 'approved' || challengeStatus === 'consumed' || challengeStatus === 'expired') {
      return;
    }

    let stopped = false;
    const intervalMs = Math.max(1500, challenge.pollIntervalMs || 2000);
    const poll = async () => {
      try {
        const result = await pollMobileLoginChallenge(challenge.sessionId, challenge.pollToken);
        if (stopped) return;
        setChallengeStatus(result.status);
        if (result.status === 'approved' && result.token && result.user) {
          await loginWithToken(result.token, result.user);
          setNotification({ message: '扫码登录成功', type: 'success' });
          onSuccess();
        }
      } catch (err) {
        if (stopped) return;
        const message = getErrorMessage(err, '扫码登录状态同步失败');
        setError(message);
      }
    };

    poll();
    const timer = window.setInterval(poll, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [challenge, challengeStatus, loginWithToken, onSuccess, setNotification]);

  const handleClientTokenLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = clientLoginToken.trim();
    if (!token) {
      setError('请输入客户端登录令牌');
      return;
    }

    setTokenLoading(true);
    setError(null);
    try {
      const result = await exchangeMobileClientToken(token, clientDeviceId.trim() || undefined);
      await loginWithToken(result.token, result.user);
      setNotification({ message: '客户端令牌登录成功', type: 'success' });
      onSuccess();
    } catch (err) {
      const message = getErrorMessage(err, '客户端令牌登录失败');
      setError(message);
      setNotification({ message, type: 'error' });
    } finally {
      setTokenLoading(false);
    }
  };

  return (
    <div className={cn(authElevatedPanelClassName, 'space-y-4')}>
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600">
          <FaMobileAlt className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">安卓客户端登录</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">扫码确认，或粘贴客户端令牌继续。</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {error}
        </div>
      )}

      <div className={cn(authInfoPanelClassName, 'flex flex-col items-center gap-3')}>
        {challenge ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <QRCodeSVG value={challenge.qrPayload} size={176} level="M" includeMargin />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-900">{statusText[challengeStatus]}</p>
              <p className="mt-1 text-[11px] text-slate-500">有效期至 {new Date(challenge.expiresAt).toLocaleTimeString('zh-CN')}</p>
            </div>
          </>
        ) : (
          <div className="flex h-44 w-44 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
            <FaQrcode className="h-12 w-12" />
          </div>
        )}
        <button
          type="button"
          disabled={disabled || challengeLoading}
          onClick={startChallenge}
          className={authSecondaryButtonClassName}
        >
          <FaSyncAlt className={cn('h-4 w-4', challengeLoading && 'animate-spin')} />
          {challenge ? '刷新二维码' : '生成扫码二维码'}
        </button>
      </div>

      <form onSubmit={handleClientTokenLogin} className="space-y-3">
        <label htmlFor="client-login-token" className="block text-sm font-medium text-slate-700">客户端登录令牌</label>
        <div className="relative">
          <FaTicketAlt className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="client-login-token"
            type="password"
            value={clientLoginToken}
            onChange={(event) => setClientLoginToken(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            placeholder="sml_..."
            autoComplete="off"
          />
        </div>
        <div className="relative">
          <FaDesktop className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="client-device-id"
            type="text"
            value={clientDeviceId}
            onChange={(event) => setClientDeviceId(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            placeholder="设备 ID（如已绑定）"
            autoComplete="off"
          />
        </div>
        <button type="submit" disabled={disabled || tokenLoading} className={authPrimaryButtonClassName}>
          {tokenLoading ? '登录中...' : '使用客户端令牌登录'}
        </button>
      </form>
    </div>
  );
};

export default MobileLoginPanel;
