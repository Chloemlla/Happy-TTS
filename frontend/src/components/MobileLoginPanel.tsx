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
import { checkSynapseClientAvailable } from '../utils/synapseDetect';
import {
  authElevatedPanelClassName,
  authInfoPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from './authStudioTheme';
import { useNotification } from './Notification';
import { getBackendErrorMessage } from '../utils/backendError';

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
  return getBackendErrorMessage(error, fallback);
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
  const [synapseDetected, setSynapseDetected] = React.useState<boolean | null>(null);

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
    checkSynapseClientAvailable().then(setSynapseDetected);
  }, []);

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
          <a
            href="https://github.com/Chloemlla/Synapse-Client/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-emerald-600 hover:text-emerald-700 underline"
          >
            下载 Synapse-Client →
          </a>
        </div>
      </div>
      {synapseDetected !== null && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-3 py-2 text-xs leading-5',
            synapseDetected
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-amber-200 bg-amber-50 text-amber-700',
          )}
        >
          {synapseDetected ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              已检测到 Synapse-Client
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span>未检测到</span>
              <button
                type="button"
                onClick={triggerSynapseDetection}
                className="text-amber-700 hover:text-amber-800 underline font-medium"
              >
                检测
              </button>
              <span className="text-amber-500">·</span>
              <a
                href="https://github.com/Chloemlla/Synapse-Client/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 hover:text-amber-800 underline"
              >
                下载 →
              </a>
            </span>
          )}
        </div>
      )}

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
          <div className="flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
            <FaQrcode className="h-10 w-10 sm:h-12 sm:w-12" />
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


