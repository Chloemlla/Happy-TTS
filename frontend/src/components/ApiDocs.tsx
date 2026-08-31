import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaBook,
  FaDownload,
  FaLock,
  FaRedo,
  FaUserShield,
} from 'react-icons/fa';
import 'swagger-ui-react/swagger-ui.css';
import { api } from '../api/api';
import { getBackendErrorMessage } from '../utils/backendError';
import {
  InfoBadge,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

const SwaggerUI = lazy(() => import('swagger-ui-react'));

const SPEC_URL = '/api/openapi.json';

type SpecDocument = Record<string, unknown>;

type DocsState =
  | { status: 'loading' }
  | { status: 'ready'; spec: SpecDocument }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

const parseSpec = (data: unknown): SpecDocument => {
  if (typeof data === 'string') return JSON.parse(data) as SpecDocument;
  return (data || {}) as SpecDocument;
};

const responseStatusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | undefined)?.response?.status;

const ApiDocsBody: React.FC<{ state: DocsState; onRetry: () => void }> = ({ state, onRetry }) => {
  if (state.status === 'loading') {
    return (
      <InfoPanel>
        <InfoSectionTitle title="正在加载接口清单" description="从 /api/openapi.json 读取 OpenAPI 文档…" icon={FaBook} tone="sky" />
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
        </div>
      </InfoPanel>
    );
  }

  if (state.status === 'unauthorized') {
    return (
      <InfoPanel>
        <InfoSectionTitle
          title="需要登录"
          description="API 文档仅对已登录的管理员开放，登录后回到本页即可查看。"
          icon={FaLock}
          tone="amber"
        />
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          去登录
        </Link>
      </InfoPanel>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <InfoPanel>
        <InfoSectionTitle
          title="需要管理员权限"
          description="当前账号已登录，但接口清单只对 admin / superadmin 角色可见。"
          icon={FaUserShield}
          tone="rose"
        />
      </InfoPanel>
    );
  }

  if (state.status === 'error') {
    return (
      <InfoPanel>
        <InfoSectionTitle title="加载失败" description={state.message} icon={FaRedo} tone="rose" />
        <InfoPrimaryButton tone="slate" onClick={onRetry}>
          <FaRedo className="text-xs" />
          重试
        </InfoPrimaryButton>
      </InfoPanel>
    );
  }

  return (
    <InfoPanel>
      <Suspense fallback={<p className="text-sm text-slate-500">正在初始化 Swagger UI…</p>}>
        <SwaggerUI spec={state.spec} docExpansion="none" defaultModelsExpandDepth={-1} />
      </Suspense>
    </InfoPanel>
  );
};

const ApiDocs: React.FC = () => {
  const [state, setState] = useState<DocsState>({ status: 'loading' });

  const loadSpec = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await api.get(SPEC_URL);
      setState({ status: 'ready', spec: parseSpec(response.data) });
    } catch (error) {
      const status = responseStatusOf(error);
      if (status === 401) {
        setState({ status: 'unauthorized' });
        return;
      }
      if (status === 403) {
        setState({ status: 'forbidden' });
        return;
      }
      setState({ status: 'error', message: getBackendErrorMessage(error, '无法加载 API 文档') });
    }
  }, []);

  useEffect(() => {
    void loadSpec();
  }, [loadSpec]);

  const pathCount = state.status === 'ready'
    ? Object.keys((state.spec.paths as Record<string, unknown>) || {}).length
    : 0;

  // G12-15：裸外链二次请求无法携带 Authorization 头，生产必然 401。
  // 改为复用已带鉴权取回的 spec，直接触发下载。
  const downloadSpec = () => {
    if (state.status !== 'ready') return;
    try {
      const blob = new Blob([JSON.stringify(state.spec, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openapi.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载 openapi.json 失败:', error);
    }
  };

  return (
    <InfoQueryShell maxWidthClassName="max-w-7xl">
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="API Reference"
          title="API 文档"
          description="Synapse 的 OpenAPI 文档直接在站内渲染，鉴权与 /api/openapi.json 一致：需要管理员会话。"
          icon={FaBook}
          tone="sky"
          meta={(
            <>
              <InfoBadge tone="sky">Swagger UI</InfoBadge>
              <InfoBadge tone="slate">OpenAPI 3.0</InfoBadge>
              {state.status === 'ready' && (
                <InfoBadge tone="emerald">{pathCount} 个路径</InfoBadge>
              )}
            </>
          )}
          actions={(
            <button
              type="button"
              onClick={downloadSpec}
              disabled={state.status !== 'ready'}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaDownload className="text-xs" />
              下载 openapi.json
            </button>
          )}
        />

        <ApiDocsBody state={state} onRetry={loadSpec} />
      </div>
    </InfoQueryShell>
  );
};

export default ApiDocs;
