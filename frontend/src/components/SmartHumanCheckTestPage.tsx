import React, { Suspense } from 'react';
import { FaClipboard, FaKey, FaRobot, FaShieldAlt } from 'react-icons/fa';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl from '../api';
import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
  logShareInputClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from './LogShareStyleScaffold';

// 懒加载 SmartHumanCheck 组件
const ManualNonceSmartHumanCheck = React.lazy(() =>
  import('./SmartHumanCheck').then((module) => ({ default: module.ManualNonceSmartHumanCheck })),
);

// SmartHumanCheck 测试页（简单包装，显示生成的 token 与错误信息）
const SmartHumanCheckTestPage: React.FC = () => {
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState('');
  const [nonce, setNonce] = React.useState('');
  const [nonceKey, setNonceKey] = React.useState('');
  const [nonceAction, setNonceAction] = React.useState('');
  const [nonceDifficulty, setNonceDifficulty] = React.useState(0);
  const [noncePowSalt, setNoncePowSalt] = React.useState('');
  const [nonceLoading, setNonceLoading] = React.useState(false);
  const [verifyMsg, setVerifyMsg] = React.useState('');
  const [verifying, setVerifying] = React.useState(false);

  const fetchNonce = React.useCallback(async () => {
    setNonceLoading(true);
    setError('');
    setVerifyMsg('');
    try {
      const res = await fetch(getApiBaseUrl() + '/api/human-check/nonce', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success && typeof data.nonce === 'string' && typeof data.key === 'string') {
        setNonce(data.nonce);
        setNonceKey(data.key);
        setNonceAction(data.action || '');
        setNonceDifficulty(Number(data.difficulty || 0));
        setNoncePowSalt(data.powSalt || '');
      } else {
        throw new Error('invalid_response');
      }
    } catch (e) {
      console.error('获取 nonce 失败:', e);
      setError('获取 nonce 失败');
      setNonceKey('');
      setNonceAction('');
      setNonceDifficulty(0);
      setNoncePowSalt('');
    } finally {
      setNonceLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // 进入页面自动获取一次 nonce
    fetchNonce().catch(() => {});
  }, [fetchNonce]);

  const verifyToken = React.useCallback(async (t: string) => {
    setVerifying(true);
    setVerifyMsg('');
    try {
      const res = await fetch(getApiBaseUrl() + '/api/human-check/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ token: t, ...(nonceAction ? { action: nonceAction } : {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.success) {
        setVerifyMsg('后端验证成功 ✅');
      } else {
        const reason = (data && (data.error || data.reason)) || `HTTP ${res.status}`;
        setVerifyMsg(`后端验证失败 ❌：${String(reason)}`);
      }
    } catch (e) {
      console.error('验证请求异常:', e);
      setVerifyMsg('验证请求异常');
    } finally {
      setVerifying(false);
    }
  }, [nonceAction]);

  return (
    <InfoQueryShell maxWidthClassName="max-w-4xl" className="space-y-6">
      <InfoQueryHero
        eyebrow="Human Check"
        title="SmartHumanCheck 测试页"
        description="完成滑块与行为采集后提交验证，并自动向后端校验生成的 token。"
        icon={FaRobot}
        meta={
          <>
            <InfoBadge>Nonce Challenge</InfoBadge>
            <InfoBadge>PoW 难度 {nonceDifficulty || 0}</InfoBadge>
            <InfoBadge tone={nonceKey ? 'emerald' : 'slate'}>{nonceKey ? 'Key 已下发' : '等待 Key'}</InfoBadge>
          </>
        }
      />

      <InfoPanel>
        <InfoSectionTitle
          icon={FaKey}
          eyebrow="Challenge"
          title="挑战参数"
          description="建议使用后端下发的 nonce，保证前后端校验链路完整。"
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Challenge Nonce
            </span>
            <input
              className={`${logShareInputClass} font-mono`}
              placeholder="用于与后端配合的随机挑战串"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
            />
          </label>
          <button
            onClick={fetchNonce}
            disabled={nonceLoading}
            className={`${logShareSecondaryButtonClass} h-[46px]`}
          >
            {nonceLoading ? '获取中...' : '从后端获取'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <InfoBadge>Action: {nonceAction || 'default'}</InfoBadge>
          <InfoBadge>V2 Key: {nonceKey ? '已下发' : '未获取'}</InfoBadge>
          <InfoBadge>PoW: {nonceDifficulty || 0}</InfoBadge>
        </div>
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle
          icon={FaShieldAlt}
          eyebrow="Widget"
          title="验证组件"
          description="组件完成验证后会自动触发后端校验，并刷新挑战参数避免复用。"
        />
        <div className={`${logShareTileClass} p-4`}>
          <Suspense fallback={<div className="flex min-h-[180px] items-center justify-center"><LoadingSpinner /></div>}>
            {nonce && nonceKey ? (
              <ManualNonceSmartHumanCheck
                challengeNonce={nonce}
                challengeKey={nonceKey}
                challengeAction={nonceAction || undefined}
                challengeDifficulty={nonceDifficulty}
                challengePowSalt={noncePowSalt || undefined}
                onSuccess={async (t) => {
                  setToken(t);
                  setError('');
                  try {
                    await verifyToken(t);
                  } finally {
                    // 成功或失败后都获取新的 nonce，避免复用
                    await fetchNonce().catch(() => {});
                  }
                }}
                onFail={async (reason) => {
                  setError(reason || '验证失败');
                  setVerifyMsg('');
                  // 验证失败时也刷新 nonce，避免旧的 nonce 被继续使用
                  await fetchNonce().catch(() => {});
                }}
              />
            ) : (
              <div className="flex min-h-[180px] items-center justify-center">
                <LoadingSpinner />
              </div>
            )}
          </Suspense>
        </div>
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle
          icon={FaClipboard}
          eyebrow="Result"
          title="Token"
          description="验证通过后会在这里输出 Base64 token，便于复制和后续调试。"
          action={token && (
            <button
              onClick={() => navigator.clipboard.writeText(token).catch(() => {})}
              className={logSharePrimaryButtonClass}
            >
              复制
            </button>
          )}
        />
        <textarea
          className={`${logShareInputClass} h-40 font-mono text-xs`}
          readOnly
          value={token}
          placeholder="验证通过后，这里会显示生成的 token（Base64）"
        />
        {error && (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
            错误：{error}
          </div>
        )}
        {verifyMsg && (
          <div
            className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
              verifyMsg.includes('成功')
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
                : 'border-amber-200 bg-amber-50/80 text-amber-700'
            }`}
          >
            {verifyMsg}
            {verifying && <span className="ml-2 text-slate-500">(验证中...)</span>}
          </div>
        )}
      </InfoPanel>
    </InfoQueryShell>
  );
};

export default SmartHumanCheckTestPage;
