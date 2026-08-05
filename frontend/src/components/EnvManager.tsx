import React, {
  useEffect, useState, useCallback, startTransition
} from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import {
  API_URL,
  MODLIST_API, TTS_API, SHORTURL_AES_API, WEBHOOK_SECRET_API,
  CONFIGURATION_NOTICE_API,
  getAuthHeaders,
  authFetch,
} from './env-manager/api';
import SelfContainedTurnstileConfigSection from './env-manager/SelfContainedTurnstileConfigSection';
import SelfContainedHcaptchaConfigSection from './env-manager/SelfContainedHcaptchaConfigSection';
import SelfContainedClarityConfigSection from './env-manager/SelfContainedClarityConfigSection';
import SelfContainedGithubBillingConfigSection from './env-manager/SelfContainedGithubBillingConfigSection';
import SelfContainedIpfsConfigSection from './env-manager/SelfContainedIpfsConfigSection';
import SelfContainedEmailSystemSettingsSection from './env-manager/SelfContainedEmailSystemSettingsSection';
import SelfContainedOutemailSettingsSection from './env-manager/SelfContainedOutemailSettingsSection';
import SelfContainedGoogleClientIdsSection from './env-manager/SelfContainedGoogleClientIdsSection';
import SelfContainedSynapseAndroidConfigSection from './env-manager/SelfContainedSynapseAndroidConfigSection';
import SelfContainedNexaiSigningConfigSection from './env-manager/SelfContainedNexaiSigningConfigSection';
import SelfContainedLibreChatProvidersSection from './env-manager/SelfContainedLibreChatProvidersSection';
import SelfContainedCodeSettingSection from './env-manager/SelfContainedCodeSettingSection';
import SelfContainedSecretKeySection from './env-manager/SelfContainedSecretKeySection';
import SelfContainedEcoEnchantsTokenSection from './env-manager/SelfContainedEcoEnchantsTokenSection';
import SelfContainedEcoEnchantsWebhookSection from './env-manager/SelfContainedEcoEnchantsWebhookSection';
import SelfContainedSecuritySecretSection from './env-manager/SelfContainedSecuritySecretSection';
import TtsProviderConfigSection from './env-manager/TtsProviderConfigSection';
import RuntimeConfigSections from './RuntimeConfigSections';
import {
  handleSourceClick,
  handleSourceModalClose,
  getEnvSource,
} from './env-manager/utils';
import {
  getConfigurationSectionKey,
  isConfigurationNoticeIssue,
  readConfigurationWorkflow,
  writeConfigurationWorkflow,
  type ConfigurationNoticeIssue,
  type ConfigurationNoticeWorkflow,
} from './env-manager/configurationNotice';
import type { EnvItem } from './env-manager/types';
import {
  FaCog, FaLock, FaList, FaSync, FaInfoCircle, FaCheckCircle, FaChevronDown, FaEdit, FaTrash, FaCheck, FaTimes,
} from 'react-icons/fa';
import { DURATION_06, DURATION_03, ENTER_ANIMATE, ENTER_INITIAL, NO_DURATION } from './env-manager/motion';

export { handleSourceClick, handleSourceModalClose };

const ENV_MANAGER_LIGHT_THEME_CSS = `
.env-manager-ui,
.env-manager-ui * { color-scheme: light; }
.env-manager-ui { background: transparent; color: #374151; }
.dark .env-manager-ui { color: #374151 !important; }
.env-manager-ui .bg-white { background-color: #ffffff !important; }
.env-manager-ui .bg-gray-50 { background-color: #f9fafb !important; }
.env-manager-ui .bg-gray-100 { background-color: #f3f4f6 !important; }
.env-manager-ui .bg-slate-50 { background-color: #f8fafc !important; }
.env-manager-ui .bg-slate-100 { background-color: #f1f5f9 !important; }
.env-manager-ui .bg-slate-200 { background-color: #e2e8f0 !important; }
.env-manager-ui .bg-blue-50 { background-color: #eff6ff !important; }
.env-manager-ui .bg-blue-100 { background-color: #dbeafe !important; }
.env-manager-ui .bg-indigo-50 { background-color: #eef2ff !important; }
.env-manager-ui .bg-green-50 { background-color: #f0fdf4 !important; }
.env-manager-ui .bg-emerald-50 { background-color: #ecfdf5 !important; }
.env-manager-ui .bg-red-50 { background-color: #fef2f2 !important; }
.env-manager-ui .bg-pink-50 { background-color: #fdf2f8 !important; }
.env-manager-ui .text-gray-900 { color: #111827 !important; }
.env-manager-ui .text-gray-800 { color: #1f2937 !important; }
.env-manager-ui .text-gray-700 { color: #374151 !important; }
.env-manager-ui .text-gray-600 { color: #4b5563 !important; }
.env-manager-ui .text-gray-500 { color: #6b7280 !important; }
.env-manager-ui .text-gray-400 { color: #9ca3af !important; }
.env-manager-ui .text-slate-800 { color: #1e293b !important; }
.env-manager-ui .text-slate-500 { color: #64748b !important; }
.env-manager-ui .text-slate-400 { color: #94a3b8 !important; }
.env-manager-ui .text-blue-700 { color: #1d4ed8 !important; }
.env-manager-ui .text-blue-600 { color: #2563eb !important; }
.env-manager-ui .text-red-700 { color: #b91c1c !important; }
.env-manager-ui .text-red-600 { color: #dc2626 !important; }
.env-manager-ui .text-red-500 { color: #ef4444 !important; }
.env-manager-ui .env-manager-title-panel { background: linear-gradient(90deg, #eff6ff 0%, #eef2ff 100%) !important; border-color: #dbeafe !important; color: #4b5563 !important; }
.env-manager-ui .env-manager-title { background: transparent !important; color: #1d4ed8 !important; }
.env-manager-ui .env-manager-title-icon { color: #2563eb !important; }
.env-manager-ui .env-manager-title-panel p, .env-manager-ui .env-manager-title-panel li { color: #4b5563 !important; }
.env-manager-ui .env-manager-title-panel .env-manager-title-label { color: #1d4ed8 !important; }
.env-manager-ui input:not([type="checkbox"]):not([type="radio"]),
.env-manager-ui textarea,
.env-manager-ui select { background-color: #ffffff; color: #111827; color-scheme: light; }
.env-manager-ui input:not([type="checkbox"]):not([type="radio"])::placeholder,
.env-manager-ui textarea::placeholder { color: #9ca3af; opacity: 1; }
.env-manager-ui select option { background-color: #ffffff; color: #111827; }
`;

const ENV_MANAGER_REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';
const ENV_MANAGER_TOGGLE_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200';

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();

  const trans06 = React.useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_06), [prefersReducedMotion]);
  const trans03 = React.useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_03), [prefersReducedMotion]);
  const modalTrans = React.useMemo(() => (prefersReducedMotion ? NO_DURATION : { duration: 0.1 }), [prefersReducedMotion]);

  // Env vars state
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('');

  // Configuration workflow state
  const [configurationWorkflow, setConfigurationWorkflow] = useState<ConfigurationNoticeWorkflow | null>(
    () => readConfigurationWorkflow(),
  );
  const [configurationIssues, setConfigurationIssues] = useState<ConfigurationNoticeIssue[]>([]);
  const [configurationStatusLoading, setConfigurationStatusLoading] = useState(false);
  const [configurationStatusFetched, setConfigurationStatusFetched] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkIsMobile = () => { try { setIsMobile(window.innerWidth <= 768); } catch { setIsMobile(false); } };
    checkIsMobile();
    let timer: ReturnType<typeof setTimeout>;
    const debouncedCheck = () => { clearTimeout(timer); timer = setTimeout(checkIsMobile, 150); };
    window.addEventListener('resize', debouncedCheck);
    return () => { clearTimeout(timer); window.removeEventListener('resize', debouncedCheck); };
  }, []);

  // Env table collapsed state (kept for lazy-loading the envs data)
  const [envSectionExpanded, setEnvSectionExpanded] = useState(false);
  const envFetchedRef = React.useRef(false);

  // Env fetch
  const fetchEnvs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(API_URL, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || '获取失败';
        if (msg.includes('Token') || msg.includes('令牌')) setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
        else if (msg.includes('权限') || msg.includes('管理员')) setNotification({ message: '需要管理员权限', type: 'error' });
        else setNotification({ message: msg, type: 'error' });
        return;
      }
      if (data.success) {
        let envArr: EnvItem[] = [];
        if (Array.isArray(data.envs)) envArr = data.envs;
        else if (data.envs && typeof data.envs === 'object') envArr = Object.entries(data.envs).map(([key, value]) => ({ key, value: String(value) }));
        envArr = envArr.map(item => ({ ...item, source: getEnvSource(item.key) }));
        setEnvs(envArr.map(item => {
          const rawKey = item.key.includes(':') ? item.key.split(':').pop() : item.key;
          return rawKey === 'USER_STORAGE_MODE' ? { ...item, value: 'mongo' } : item;
        }));
      } else {
        setNotification({ message: data.error || '获取失败', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: '获取失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally { setLoading(false); }
  }, [setNotification]);

  // Lazy fetch when env section is expanded
  useEffect(() => {
    if (envSectionExpanded && !envFetchedRef.current) {
      envFetchedRef.current = true;
      fetchEnvs();
    }
  }, [envSectionExpanded, fetchEnvs]);

  // Env CRUD handlers
  const handleStartEdit = useCallback((item: EnvItem) => {
    setEditingKey(item.key);
    setForm({ key: item.key, value: item.value, desc: item.desc });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setForm({});
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!form.key) return;
    const key = form.key;
    const value = (form.value || '').trim();
    if (!value) { setNotification({ message: 'value 不能为空', type: 'error' }); return; }
    try {
      const res = await authFetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key, value, desc: form.desc || '' }) });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '保存失败', type: 'error' }); return; }
      setNotification({ message: `${key} 已保存`, type: 'success' });
      setEditingKey(null); setForm({});
      await fetchEnvs();
    } catch (e) { setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
  }, [form, fetchEnvs, setNotification]);

  const handleDeleteEnvVar = useCallback(async (key: string) => {
    if (!window.confirm(`确定删除环境变量「${key}」？`)) return;
    try {
      const res = await authFetch(API_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key }) });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: `${key} 已删除`, type: 'success' });
      await fetchEnvs();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
  }, [fetchEnvs, setNotification]);

  // Configuration workflow
  const fetchConfigurationIssues = useCallback(async () => {
    setConfigurationStatusLoading(true);
    try {
      const res = await authFetch(CONFIGURATION_NOTICE_API, { credentials: 'include', headers: { ...getAuthHeaders() } });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      const rawIssues = (payload as Record<string, unknown>).issues;
      setConfigurationIssues(Array.isArray(rawIssues) ? rawIssues.filter(isConfigurationNoticeIssue) : []);
      setConfigurationStatusFetched(true);
    } catch { /* auxiliary fetch */ }
    finally { setConfigurationStatusLoading(false); }
  }, []);

  const configurationTargetIssueId = searchParams.get('configIssue');

  useEffect(() => {
    if (!configurationWorkflow && !configurationTargetIssueId) return;
    void fetchConfigurationIssues();
    const timer = window.setInterval(() => { void fetchConfigurationIssues(); }, 3000);
    return () => window.clearInterval(timer);
  }, [configurationTargetIssueId, configurationWorkflow, fetchConfigurationIssues]);

  useEffect(() => {
    if (!configurationTargetIssueId) return;
    const scrollTimer = window.setTimeout(() => {
      document.querySelector(`[data-env-section="${getConfigurationSectionKey(configurationTargetIssueId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => window.clearTimeout(scrollTimer);
  }, [configurationTargetIssueId]);

  useEffect(() => {
    if (!configurationWorkflow || configurationStatusLoading || !configurationStatusFetched) return;
    const ignoredIds = new Set(configurationWorkflow.ignoredIds);
    const pendingIssues = configurationWorkflow.issues.filter(
      (issue) => !ignoredIds.has(issue.id) && configurationIssues.some((current) => current.id === issue.id),
    );
    const currentTargetStillPending = configurationTargetIssueId
      ? pendingIssues.some((issue) => issue.id === configurationTargetIssueId) : false;
    if (pendingIssues.length === 0) {
      if (configurationTargetIssueId) setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('configIssue'); return n; }, { replace: true });
      return;
    }
    if (!currentTargetStillPending) {
      const nextIssue = pendingIssues[0];
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('configIssue', nextIssue.id); return n; }, { replace: true });
    }
  }, [configurationIssues, configurationStatusFetched, configurationStatusLoading, configurationTargetIssueId, configurationWorkflow, setSearchParams]);

  const ignoreConfigurationIssue = useCallback((issueId: string) => {
    if (!configurationWorkflow) return;
    const ignoredIds = Array.from(new Set([...configurationWorkflow.ignoredIds, issueId]));
    const nextWorkflow = { ...configurationWorkflow, ignoredIds };
    writeConfigurationWorkflow(nextWorkflow);
    setConfigurationWorkflow(nextWorkflow);
  }, [configurationWorkflow]);

  // Source modal handlers
  const handleSourceClickWrapper = useCallback((source: string) => {
    handleSourceClick(source, setSelectedSource, setShowSourceModal);
  }, []);
  const handleSourceModalCloseWrapper = useCallback(() => {
    handleSourceModalClose(setShowSourceModal);
  }, []);

  const configurationCurrentIds = new Set(configurationIssues.map((issue) => issue.id));
  const configurationProgressItems = configurationWorkflow?.issues.filter(
    (issue) => !configurationWorkflow.ignoredIds.includes(issue.id),
  ) || [];
  const configurationNextIssue = configurationProgressItems.find((issue) => configurationCurrentIds.has(issue.id));

  // Admin check
  if (!user || user.role !== 'admin') {
    return (
      <LazyMotion features={domAnimation}>
        <m.div className="env-manager-ui space-y-6">
          <style>{ENV_MANAGER_LIGHT_THEME_CSS}</style>
          <m.div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100" initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
            <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2"><FaLock className="text-2xl text-red-600" />访问被拒绝</h2>
            <div className="text-gray-600 space-y-2">
              <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
              <div className="text-sm text-red-500 italic">环境变量管理仅限管理员使用</div>
            </div>
          </m.div>
        </m.div>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative env-manager-ui space-y-6">
        <style>{ENV_MANAGER_LIGHT_THEME_CSS}</style>

        {/* Header */}
        <m.div className="env-manager-title-panel bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100" initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
          <h2 className="env-manager-title text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-3 flex items-center gap-2">
            <FaCog className="env-manager-title-icon text-xl sm:text-2xl text-blue-600" />环境变量管理
          </h2>
          <div className="text-gray-600 space-y-2">
            <p className="text-sm sm:text-base">查看系统环境变量配置，支持加密存储和传输。</p>
            <div className="flex items-start gap-2 text-sm">
              <div>
                <p className="env-manager-title-label font-semibold text-blue-700">功能说明：</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li className="leading-relaxed">实时查看系统环境变量</li>
                  <li className="leading-relaxed">支持AES-256加密传输</li>
                  <li className="leading-relaxed">自动解密显示数据</li>
                  <li className="leading-relaxed">仅管理员可访问</li>
                </ul>
              </div>
            </div>
          </div>
        </m.div>

        {/* Configuration Workflow */}
        {configurationWorkflow && configurationProgressItems.length > 0 && (
          <m.section className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm" initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
            <div className="flex flex-col gap-3 border-b border-amber-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-amber-900">服务配置处理进度</h3>
                <p className="mt-1 text-sm text-amber-800">
                  {configurationNextIssue ? `当前处理：${configurationNextIssue.label}` : configurationStatusFetched ? '全部配置已完成' : '正在检查配置状态...'}
                </p>
              </div>
              <button type="button" onClick={() => { if (!configurationNextIssue) return; setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('configIssue', configurationNextIssue.id); return n; }, { replace: true }); }} disabled={!configurationNextIssue} className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
                {configurationNextIssue ? '处理下一项' : '已完成'}
              </button>
            </div>
            <div className="grid gap-2 px-5 py-4 md:grid-cols-2">
              {configurationProgressItems.map((issue) => {
                const resolved = !configurationCurrentIds.has(issue.id);
                return (
                  <div key={issue.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${resolved ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-white text-amber-900'}`}>
                    {resolved ? <FaCheckCircle className="shrink-0" /> : <FaInfoCircle className="shrink-0" />}
                    <span className="min-w-0 flex-1 break-words">{issue.label}</span>
                    {!resolved && <button type="button" onClick={() => ignoreConfigurationIssue(issue.id)} className="shrink-0 text-xs text-gray-500 underline hover:text-gray-800">忽略</button>}
                  </div>
                );
              })}
            </div>
          </m.section>
        )}

        {/* Env Vars Table */}
        <m.section data-env-section="envs" className="rounded-2xl border border-slate-200 bg-white shadow-sm" initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">环境变量列表</h3>
              <p className="mt-1 text-sm text-slate-500">查看系统环境变量配置，支持加密传输、自动解密和数据来源标记。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <m.button onClick={() => { envFetchedRef.current = true; fetchEnvs(); }} disabled={loading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
              </m.button>
              <m.button onClick={() => { startTransition(() => setEnvSectionExpanded((v) => !v)); }} className={ENV_MANAGER_TOGGLE_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <m.span animate={{ rotate: envSectionExpanded ? 0 : -90 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.2 }} className="inline-flex"><FaChevronDown className="w-4 h-4" /></m.span>
                {envSectionExpanded ? '收起' : '展开'}
              </m.button>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {envSectionExpanded && (
              <m.div key="env-list-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25 }} className="space-y-4 px-5 py-5">
                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-blue-700">
                    <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <span className="font-medium leading-relaxed">带蓝色感叹号图标的变量表示有明确的数据来源信息</span>
                  </div>
                </div>
                {loading ? (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-3 sm:mb-4 text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-sm sm:text-base">加载中...</span>
                  </div>
                ) : envs.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <FaList className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400" />
                    <span className="text-sm sm:text-base">暂无环境变量数据</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    {isMobile ? (
                      <div className="space-y-3 p-2">
                        {envs.map((item, idx) => (
                          <m.div key={item.key} className={`rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm hover:shadow transition ${idx % 2 === 0 ? '' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: idx * 0.02 }}>
                            <div className="flex items-start gap-2 sm:gap-3">
                              {item.source && <button onClick={() => handleSourceClickWrapper(item.source!)} className="flex-shrink-0 focus:outline-none self-center" aria-label="数据来源"><span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><FaInfoCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /></span></button>}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm sm:text-base font-semibold text-gray-900 tracking-wide break-words">{item.key.split(':').pop() || item.key}</div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleStartEdit(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded hover:bg-indigo-50" title="编辑"><FaEdit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteEnvVar(item.key)} className="p-1.5 text-gray-400 hover:text-red-600 transition rounded hover:bg-red-50" title="删除"><FaTrash className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                                {editingKey === item.key ? (
                                  <div className="mt-2 space-y-2">
                                    <input value={form.value || ''} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} className="w-full px-3 py-2 border border-indigo-300 rounded-lg font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" autoComplete="off" spellCheck={false} />
                                    <div className="flex items-center gap-2 justify-end">
                                      <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"><FaTimes className="w-3 h-3 inline mr-1" />取消</button>
                                      <button onClick={handleSaveEdit} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"><FaCheck className="w-3 h-3 inline mr-1" />保存</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 px-2 sm:px-3 py-2 bg-gray-50 rounded-lg font-mono text-xs sm:text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{item.value}</div>
                                )}
                              </div>
                            </div>
                          </m.div>
                        ))}
                      </div>
                    ) : (
                      <table className="min-w-full">
                        <thead><tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[200px] w-1/3">变量名</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[300px] w-1/2">值</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-[120px]">操作</th>
                        </tr></thead>
                        <tbody>
                          {envs.map((item, idx) => (
                            <tr key={item.key} className={`border-b border-gray-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                              <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 align-top">
                                <div className="break-words whitespace-normal leading-relaxed flex items-start gap-1">
                                  {item.source && <button onClick={() => handleSourceClickWrapper(item.source!)} className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 mt-0.5 flex-shrink-0 hover:text-blue-600 transition-colors cursor-pointer"><FaInfoCircle /></button>}
                                  <span>{item.key.split(':').pop() || item.key}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-sm text-gray-700 align-top">
                                {editingKey === item.key ? (
                                  <div className="flex items-center gap-2">
                                    <input value={form.value || ''} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" autoComplete="off" spellCheck={false} />
                                    <button onClick={handleSaveEdit} className="p-2 text-indigo-600 hover:text-indigo-800 transition rounded hover:bg-indigo-50" title="保存"><FaCheck className="w-4 h-4" /></button>
                                    <button onClick={handleCancelEdit} className="p-2 text-gray-400 hover:text-gray-600 transition rounded hover:bg-gray-100" title="取消"><FaTimes className="w-4 h-4" /></button>
                                  </div>
                                ) : <div className="break-words whitespace-pre-wrap leading-relaxed">{item.value}</div>}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleStartEdit(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition rounded hover:bg-indigo-50" title="编辑"><FaEdit className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteEnvVar(item.key)} className="p-1.5 text-gray-400 hover:text-red-600 transition rounded hover:bg-red-50" title="删除"><FaTrash className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {!loading && envs.length > 0 && (
                  <m.div initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans03} className="mt-6 pt-4 border-t border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-semibold text-blue-700">总计 {envs.length} 个环境变量</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs sm:text-sm font-medium text-green-700">数据正常</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-lg">
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <span className="text-xs sm:text-sm text-gray-600">最后更新: {new Date().toLocaleString()}</span>
                      </div>
                    </div>
                  </m.div>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </m.section>

        {/* Self-contained sections */}
        <SelfContainedEmailSystemSettingsSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedOutemailSettingsSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedCodeSettingSection title="MOD 列表修改码设置" description="管理 MOD 列表修改码，用于保护列表编辑入口。" sectionKey="modlist" apiUrl={MODLIST_API} inputLabel="修改码" inputPlaceholder="请输入修改码（仅用于校验，不会回显明文）" prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedCodeSettingSection title="TTS 生成码设置" description="管理 TTS 生成码，用于限制语音生成入口。" sectionKey="tts" apiUrl={TTS_API} inputLabel="生成码" inputPlaceholder="请输入生成码（仅用于校验，不会回显明文）" prefersReducedMotion={prefersReducedMotion} />
        <TtsProviderConfigSection />
        <SelfContainedGoogleClientIdsSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedSynapseAndroidConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedNexaiSigningConfigSection prefersReducedMotion={prefersReducedMotion} />
        <RuntimeConfigSections />
        <SelfContainedSecretKeySection title="短链 AES_KEY 设置" description="管理短链 AES_KEY。用于短链接 ID 加密解密，防止短链 ID 被枚举遍历。" sectionKey="shortaes" apiUrl={SHORTURL_AES_API} inputLabel="AES_KEY" inputPlaceholder="请输入 AES_KEY（仅用于加解密，不会回显明文）" useSignedRequest prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedSecretKeySection title="Webhook 密钥设置" description="管理 Webhook 路由密钥和签名密钥。用于接收外部服务 webhook 请求，验证请求来源合法性。" sectionKey="webhook" apiUrl={WEBHOOK_SECRET_API} inputLabel="密钥 Secret" inputPlaceholder="请输入 Webhook 密钥（支持 Base64 或明文，不回显明文）" extraField={{ label: 'Route Key（可选，默认 DEFAULT）', placeholder: '例如：ORDER、PAY 等，留空为 DEFAULT' }} prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedIpfsConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedTurnstileConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedHcaptchaConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedClarityConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedGithubBillingConfigSection prefersReducedMotion={prefersReducedMotion} />
        <SelfContainedEcoEnchantsTokenSection />
        <SelfContainedEcoEnchantsWebhookSection />
        <SelfContainedSecuritySecretSection />
        <SelfContainedLibreChatProvidersSection prefersReducedMotion={prefersReducedMotion} />

        {/* Source Modal */}
        <AnimatePresence>
          {showSourceModal && (
            <m.div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={modalTrans} onClick={handleSourceModalCloseWrapper} data-source-modal>
              <m.div className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[10000] border border-gray-100" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={modalTrans} onClick={(e) => e.stopPropagation()}>
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaInfoCircle className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">数据来源</h3>
                  <p className="text-gray-600 mb-6">{selectedSource}</p>
                  <button onClick={handleSourceModalCloseWrapper} className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">确定</button>
                </div>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
};

export default EnvManager;