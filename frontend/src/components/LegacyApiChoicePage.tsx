import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle, Monitor, Server } from 'lucide-react';

const CHOICE_QUERY_PARAM = '__legacy_api_choice';
const REMEMBER_QUERY_PARAM = '__legacy_api_remember';

function normalizeLocalPath(rawValue: string | null, fallback: string, requiredPrefix?: string): string {
  if (!rawValue) {
    return fallback;
  }

  try {
    const url = new URL(rawValue, window.location.origin);
    if (url.origin !== window.location.origin) {
      return fallback;
    }

    const path = `${url.pathname}${url.search}`;
    if (!path.startsWith('/') || path.startsWith('//')) {
      return fallback;
    }

    if (requiredPrefix && !url.pathname.startsWith(requiredPrefix)) {
      return fallback;
    }

    return path;
  } catch {
    return fallback;
  }
}

function buildChoiceUrl(frontendTarget: string, choice: 'frontend' | 'api', rememberChoice: boolean): string {
  const url = new URL(frontendTarget, window.location.origin);
  url.searchParams.set(CHOICE_QUERY_PARAM, choice);

  if (rememberChoice) {
    url.searchParams.set(REMEMBER_QUERY_PARAM, '1');
  } else {
    url.searchParams.delete(REMEMBER_QUERY_PARAM);
  }

  return `${url.pathname}${url.search}`;
}

const LegacyApiChoicePage: React.FC = () => {
  const location = useLocation();
  const [rememberChoice, setRememberChoice] = React.useState(false);

  const params = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const frontendTarget = React.useMemo(
    () => normalizeLocalPath(params.get('from'), '/'),
    [params]
  );
  const apiTarget = React.useMemo(
    () => normalizeLocalPath(params.get('api'), '/api', '/api'),
    [params]
  );

  const chooseDestination = React.useCallback(
    (choice: 'frontend' | 'api') => {
      window.location.assign(buildChoiceUrl(frontendTarget, choice, rememberChoice));
    },
    [frontendTarget, rememberChoice]
  );

  return (
    <section className="mx-auto flex min-h-[58vh] max-w-3xl items-center px-4 py-10">
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <CheckCircle className="h-4 w-4 text-teal-600" aria-hidden="true" />
              路径需要确认
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
              这个地址有两个可前往的位置
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              请选择打开前端页面，或继续访问已规范化的 API endpoint。
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            回到首页
          </Link>
        </div>

        <div className="mt-7 grid gap-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Monitor className="h-4 w-4 text-slate-500" aria-hidden="true" />
              前端页面
            </div>
            <code className="mt-3 block break-all rounded-md bg-white px-3 py-2 text-sm text-slate-700">
              {frontendTarget}
            </code>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Server className="h-4 w-4 text-teal-600" aria-hidden="true" />
              API endpoint
            </div>
            <code className="mt-3 block break-all rounded-md bg-white px-3 py-2 text-sm text-slate-700">
              {apiTarget}
            </code>
          </div>
        </div>

        <label className="mt-6 flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(event) => setRememberChoice(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          记住本次选择，后续同类地址自动处理
        </label>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => chooseDestination('frontend')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            <Monitor className="h-4 w-4" aria-hidden="true" />
            打开前端页面
          </button>
          <button
            type="button"
            onClick={() => chooseDestination('api')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            打开 API endpoint
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default LegacyApiChoicePage;
