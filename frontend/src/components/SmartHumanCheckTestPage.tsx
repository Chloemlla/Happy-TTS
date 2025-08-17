import React, { Suspense } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import getApiBaseUrl from '../api';

// 懒加载 SmartHumanCheck 组件
const SmartHumanCheck = React.lazy(() => import('./SmartHumanCheck'));

// SmartHumanCheck 测试页（简单包装，显示生成的 token 与错误信息）
const SmartHumanCheckTestPage: React.FC = () => {
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState('');
  const [nonce, setNonce] = React.useState('');
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
      if (data && data.success && typeof data.nonce === 'string') {
        setNonce(data.nonce);
      } else {
        throw new Error('invalid_response');
      }
    } catch (e) {
      console.error('获取 nonce 失败:', e);
      setError('获取 nonce 失败');
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
        body: JSON.stringify({ token: t })
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
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">SmartHumanCheck 测试页</h1>
        <p className="text-gray-600 mt-2">完成滑块与行为收集后点击“提交验证”，自动向后端校验。</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Challenge Nonce</label>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="用于与后端配合的随机挑战串"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
            />
            <button
              onClick={fetchNonce}
              disabled={nonceLoading}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-60 hover:bg-indigo-700"
            >
              {nonceLoading ? '获取中…' : '从后端获取'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">建议使用后端下发的 nonce 以完成完整校验流程。</p>
        </div>
      </div>

      <Suspense fallback={<LoadingSpinner />}>
        <SmartHumanCheck
          challengeNonce={nonce || undefined}
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
      </Suspense>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold">Token</h2>
          {token && (
            <button
              onClick={() => navigator.clipboard.writeText(token).catch(() => {})}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              复制
            </button>
          )}
        </div>
        <textarea
          className="w-full h-40 p-3 border rounded-lg font-mono text-xs"
          readOnly
          value={token}
          placeholder="验证通过后，这里会显示生成的 token（Base64）"
        />
        {error && <div className="mt-2 text-sm text-red-600">错误：{error}</div>}
        {verifyMsg && (
          <div className="mt-2 text-sm">
            <span className={verifyMsg.includes('成功') ? 'text-green-600' : 'text-yellow-700'}>{verifyMsg}</span>
            {verifying && <span className="ml-2 text-gray-500">(验证中…)</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartHumanCheckTestPage;
