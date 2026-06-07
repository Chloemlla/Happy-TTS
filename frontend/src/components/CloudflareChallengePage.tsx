import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaCheckCircle, FaRedo, FaShieldAlt } from 'react-icons/fa';
import getApiBaseUrl from '../api';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { TurnstileWidget } from './TurnstileWidget';

type VerificationState = 'idle' | 'verifying' | 'verified' | 'failed';

const CloudflareChallengePage: React.FC = () => {
  const { config: turnstileConfig, loading: configLoading } = useTurnstileConfig({ usePublicConfig: true });
  const [verificationState, setVerificationState] = React.useState<VerificationState>('idle');
  const [turnstileKey, setTurnstileKey] = React.useState(0);

  const resetChallenge = React.useCallback(() => {
    setVerificationState('idle');
    setTurnstileKey((value) => value + 1);
  }, []);

  const verifyToken = React.useCallback(async (token: string) => {
    setVerificationState('verifying');

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/turnstile/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      });

      const data = await response.json().catch(() => ({}));
      setVerificationState(response.ok && data?.success ? 'verified' : 'failed');
    } catch (_error) {
      setVerificationState('failed');
    }
  }, []);

  const handleExpire = React.useCallback(() => {
    setVerificationState('idle');
  }, []);

  const handleError = React.useCallback(() => {
    setVerificationState('failed');
  }, []);

  const siteKey = turnstileConfig.enabled && turnstileConfig.siteKey ? turnstileConfig.siteKey : null;

  return (
    <section className="mx-auto flex min-h-[62vh] max-w-xl items-center px-4 py-10">
      <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <FaShieldAlt className="h-6 w-6 text-[#8ECAE6]" />
            <div>
              <h1 className="text-xl font-semibold">Cloudflare 人机验证</h1>
              <p className="mt-1 text-xs text-slate-300">Synapse 安全检查</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-7">
          {configLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              正在加载验证组件...
            </div>
          ) : siteKey ? (
            <div className="space-y-4">
              <div className="flex min-h-[78px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-4">
                {verificationState === 'verified' ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <FaCheckCircle className="h-5 w-5" />
                    验证通过
                  </div>
                ) : (
                  <TurnstileWidget
                    key={turnstileKey}
                    siteKey={siteKey}
                    onVerify={verifyToken}
                    onExpire={handleExpire}
                    onError={handleError}
                    theme="light"
                    size="normal"
                  />
                )}
              </div>

              {verificationState === 'verifying' && (
                <p className="text-center text-xs font-medium text-slate-500" role="status" aria-live="polite">
                  正在确认验证结果...
                </p>
              )}
              {verificationState === 'failed' && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  验证失败，请重新验证
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Cloudflare Turnstile 尚未启用
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <FaArrowLeft className="h-3.5 w-3.5" />
              返回首页
            </Link>
            {verificationState === 'failed' && (
              <button
                type="button"
                onClick={resetChallenge}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FFB703] px-3 py-2 text-sm font-semibold text-[#023047] transition hover:bg-[#FB8500]"
              >
                <FaRedo className="h-3.5 w-3.5" />
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CloudflareChallengePage;
