import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle, Monitor, Server } from 'lucide-react';
import { cn } from '../utils/cn';
import { studioEyebrowPillClassName, studioModalCardClassName, studioPrimaryButtonClassName, studioSecondaryButtonClassName } from './studioTheme';

const CHOICE_QUERY_PARAM = '__legacy_api_choice';
const REMEMBER_QUERY_PARAM = '__legacy_api_remember';
const STATE_QUERY_PARAM = '__legacy_api_state';

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

function buildChoiceUrl(
  frontendTarget: string,
  choice: 'frontend' | 'api',
  rememberChoice: boolean,
  state: string
): string {
  const url = new URL(frontendTarget, window.location.origin);
  url.searchParams.set(CHOICE_QUERY_PARAM, choice);
  url.searchParams.set(STATE_QUERY_PARAM, state);

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
  const state = params.get('state') || '';
  const canChoose = state.length > 0;

  const chooseDestination = React.useCallback(
    (choice: 'frontend' | 'api') => {
      if (!state) {
        return;
      }

      window.location.assign(buildChoiceUrl(frontendTarget, choice, rememberChoice, state));
    },
    [frontendTarget, rememberChoice, state]
  );

  return (
    <section className="mx-auto flex min-h-[58vh] max-w-full px-4 py-10 sm:max-w-3xl">
      <div className={cn(studioModalCardClassName, "bg-white")}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className={cn(studioEyebrowPillClassName, "rounded-md text-xs text-slate-600")}>
              <CheckCircle className="h-4 w-4 text-teal-600" aria-hidden="true" />
              路径需要确认
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
              这个地址有两个可前往的位置
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              请选择打开前端页面，或继续访问已规范化的 API endpoint。选择请求会回到后端校验后执行。
            </p>
          </div>
          <Link
            to="/"
            className={cn(studioSecondaryButtonClassName, "h-10 border hover:text-slate-950")}
          >
            回到首页
          </Link>
        </div>

        <div className="mt-7 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Monitor className="h-4 w-4 text-slate-500" aria-hidden="true" />
              前端页面
            </div>
            <code className="mt-3 block break-all rounded-md bg-white px-3 py-2 text-sm text-slate-700">
              {frontendTarget}
            </code>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
            disabled={!canChoose}
            className={cn(studioSecondaryButtonClassName, "h-12 border bg-white text-slate-800 hover:bg-slate-50")}
          >
            <Monitor className="h-4 w-4" aria-hidden="true" />
            打开前端页面
          </button>
          <button
            type="button"
            onClick={() => chooseDestination('api')}
            disabled={!canChoose}
            className={cn(studioPrimaryButtonClassName, "h-12 bg-teal-700 px-4 hover:bg-teal-800 focus-visible:ring-teal-500")}
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
