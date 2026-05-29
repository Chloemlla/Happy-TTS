import React, { useEffect } from 'react';
import {
  FaBook,
  FaCloud,
  FaExternalLinkAlt,
  FaFileAlt,
  FaNetworkWired,
  FaShieldAlt,
} from 'react-icons/fa';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from './InfoQueryScaffold';

const API_DOCS_URL = 'https://tts.chloemlla.com/api-docs/';

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, '');

const ApiDocs: React.FC = () => {
  useEffect(() => {
    const targetUrl = new URL(API_DOCS_URL);

    if (
      window.location.origin !== targetUrl.origin
      || normalizePath(window.location.pathname) !== normalizePath(targetUrl.pathname)
    ) {
      window.location.replace(API_DOCS_URL);
    }
  }, []);

  return (
    <InfoQueryShell maxWidthClassName="max-w-6xl">
      <div className="space-y-6">
        <InfoQueryHero
          eyebrow="API Reference"
          title="API 文档"
          description="Synapse 的接口文档入口会自动跳转到官方 Swagger 页面。若浏览器阻止跳转，可从这里直接打开文档端点。"
          icon={FaBook}
          tone="sky"
          meta={(
            <>
              <InfoBadge tone="sky">Swagger UI</InfoBadge>
              <InfoBadge tone="slate">官方端点</InfoBadge>
              <InfoBadge tone="emerald">自动跳转</InfoBadge>
            </>
          )}
          actions={(
            <a
              href={API_DOCS_URL}
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <FaExternalLinkAlt className="text-xs" />
              打开文档
            </a>
          )}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoMetricCard
            label="文档类型"
            value="OpenAPI"
            detail="接口、参数与响应结构"
            icon={FaFileAlt}
            tone="sky"
          />
          <InfoMetricCard
            label="访问方式"
            value="HTTPS"
            detail="跳转到官方 API 文档域名"
            icon={FaShieldAlt}
            tone="emerald"
          />
          <InfoMetricCard
            label="状态"
            value="Redirect"
            detail="页面加载后自动前往文档"
            icon={FaNetworkWired}
            tone="slate"
          />
        </div>

        <InfoPanel>
          <InfoSectionTitle
            title="文档端点"
            description="当前页面保留为应用内导航入口，实际内容由官方文档服务承载。"
            icon={FaCloud}
            tone="sky"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Endpoint</div>
            <a
              href={API_DOCS_URL}
              rel="noopener noreferrer"
              className="mt-2 block break-all font-mono text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
            >
              {API_DOCS_URL}
            </a>
          </div>
        </InfoPanel>
      </div>
    </InfoQueryShell>
  );
};

export default ApiDocs;
