import React, {
  useEffect, useState, useCallback, startTransition
} from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { isSuperAdmin, isAdminRole } from '../utils/rbac';
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
import SelfContainedCDictDonationConfigSection from './env-manager/SelfContainedCDictDonationConfigSection';
import SelfContainedNexaiSigningConfigSection from './env-manager/SelfContainedNexaiSigningConfigSection';
import SelfContainedLibreChatProvidersSection from './env-manager/SelfContainedLibreChatProvidersSection';
import SelfContainedCodeSettingSection from './env-manager/SelfContainedCodeSettingSection';
import SelfContainedSecretKeySection from './env-manager/SelfContainedSecretKeySection';
import SelfContainedEcoEnchantsTokenSection from './env-manager/SelfContainedEcoEnchantsTokenSection';
import SelfContainedEcoEnchantsWebhookSection from './env-manager/SelfContainedEcoEnchantsWebhookSection';
import SelfContainedSecuritySecretSection from './env-manager/SelfContainedSecuritySecretSection';
import SelfContainedProjectLumenConfigSection from './env-manager/SelfContainedProjectLumenConfigSection';
import TtsProviderConfigSection from './env-manager/TtsProviderConfigSection';
import RuntimeConfigSections from './RuntimeConfigSections';
import {
  handleSourceClick,
  handleSourceModalClose,
  getEnvSource,
  decryptAES256,
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
import {
  InfoPanel,
  InfoSectionTitle,
  InfoBadge,
  InfoQueryHero,
  logSharePanelClass,
  logShareInputClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

export { handleSourceClick, handleSourceModalClose };

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
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
        // 后端对管理员返回 AES-256-CBC 加密载荷 {data, iv}，密钥由登录用户 id 派生
        if (typeof data.data === 'string' && data.data && typeof data.iv === 'string' && data.iv) {
          if (!user?.id) {
            setNotification({ message: '缺少用户标识，无法解密数据', type: 'error' });
            return;
          }
          const decryptedJson = decryptAES256(data.data, data.iv, user.id);
          const decryptedData = JSON.parse(decryptedJson);
          if (Array.isArray(decryptedData)) {
            envArr = decryptedData;
          } else {
            setNotification({ message: '解密数据格式错误', type: 'error' });
            return;
          }
        } else if (Array.isArray(data.envs)) {
          envArr = data.envs;
        } else if (data.envs && typeof data.envs === 'object') {
          envArr = Object.entries(data.envs).map(([key, value]) => ({ key, value: String(value) }));
        }
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
  }, [setNotification, user?.id]);

  // Lazy fetch when env section is expanded
  useEffect(() => {
    if (envSectionExpanded && !envFetchedRef.current) {
      envFetchedRef.current = true;
      fetchEnvs();
    }
  }, [envSectionExpanded, fetchEnvs]);

  // Env CRUD handlers
  const handleStartEdit = useCallback((item: EnvItem) => {
    if (!canWrite) return;
    setEditingKey(item.key);
    setForm({ key: item.key, value: item.value, desc: item.desc });
  }, [canWrite]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setForm({});
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!canWrite) return;
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
  }, [canWrite, form, fetchEnvs, setNotification]);

  const handleDeleteEnvVar = useCallback(async (key: string) => {
    if (!canWrite) return;
    if (!window.confirm(`确定删除环境变量「${key}」？`)) return;
    try {
      const res = await authFetch(API_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ key }) });
      const data = await res.json();
      if (!res.ok) { setNotification({ message: data.error || '删除失败', type: 'error' }); return; }
      setNotification({ message: `${key} 已删除`, type: 'success' });
      await fetchEnvs();
    } catch (e) { setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' }); }
  }, [canWrite, fetchEnvs, setNotification]);

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

  // Admin check: admin 可只读查看，写操作由 canWrite（superadmin）门控
  if (!user || !isAdminRole(user.role)) {
    return (
      <LazyMotion features={domAnimation}>
        <div className="space-y-6">
          <InfoPanel>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-rose-200 bg-rose-50 text-rose-600">
                <FaLock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-slate-900">访问被拒绝</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
                <p className="mt-1 text-xs italic text-rose-600">环境变量管理仅限管理员使用</p>
              </div>
            </div>
          </InfoPanel>
        </div>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="space-y-6">
        {/* Header */}
        <InfoQueryHero
          eyebrow="Env Manager"
          title="环境变量管理"
          description="查看系统环境变量配置，支持加密存储和传输。所有变量按数据来源标记，仅管理员可访问。"
          icon={FaCog}
          meta={
            <div className="flex flex-wrap gap-2">
              <InfoBadge>实时查看系统环境变量</InfoBadge>
              <InfoBadge tone="emerald">支持 AES-256 加密传输</InfoBadge>
              <InfoBadge>自动解密显示数据</InfoBadge>
              <InfoBadge tone="rose">仅管理员可访问</InfoBadge>
            </div>
          }
        />

        {/* Configuration Workflow */}
        {configurationWorkflow && configurationProgressItems.length > 0 && (
          <m.section className="rounded-2xl border border-amber-200 bg-amber-50/80 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl" initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
            <div className="flex flex-col gap-3 border-b border-amber-200 px-4 py-3 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-amber-900">服务配置处理进度</h3>
                <p className="mt-1 text-sm text-amber-800">
                  {configurationNextIssue ? `当前处理：${configurationNextIssue.label}` : configurationStatusFetched ? '全部配置已完成' : '正在检查配置状态...'}
                </p>
              </div>
              <button type="button" onClick={() => { if (!configurationNextIssue) return; setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('configIssue', configurationNextIssue.id); return n; }, { replace: true }); }} disabled={!configurationNextIssue} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
                {configurationNextIssue ? '处理下一项' : '已完成'}
              </button>
            </div>
            <div className="grid gap-2 px-4 py-3 sm:px-5 sm:py-4 md:grid-cols-2">
              {configurationProgressItems.map((issue) => {
                const resolved = !configurationCurrentIds.has(issue.id);
                return (
                  <div key={issue.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm ${resolved ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700' : 'border-amber-200 bg-white/80 text-amber-900'}`}>
                    {resolved ? <FaCheckCircle className="shrink-0" /> : <FaInfoCircle className="shrink-0" />}
                    <span className="min-w-0 flex-1 break-words">{issue.label}</span>
                    {!resolved && <button type="button" onClick={() => ignoreConfigurationIssue(issue.id)} className="shrink-0 text-xs text-slate-500 underline hover:text-slate-900">忽略</button>}
                  </div>
                );
              })}
            </div>
          </m.section>
        )}

        {/* Env Vars Table */}
        <m.section data-env-section="envs" className={logSharePanelClass} initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans06}>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">环境变量列表</h3>
              <p className="mt-1 text-sm text-slate-500">查看系统环境变量配置，支持加密传输、自动解密和数据来源标记。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <m.button onClick={() => { envFetchedRef.current = true; fetchEnvs(); }} disabled={loading} className={logSharePrimaryButtonClass} whileTap={{ scale: 0.97 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
              </m.button>
              <m.button onClick={() => { startTransition(() => setEnvSectionExpanded((v) => !v)); }} className={logShareSecondaryButtonClass} whileTap={{ scale: 0.97 }}>
                <m.span animate={{ rotate: envSectionExpanded ? 0 : -90 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.2 }} className="inline-flex"><FaChevronDown className="w-4 h-4" /></m.span>
                {envSectionExpanded ? '收起' : '展开'}
              </m.button>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {envSectionExpanded && (
              <m.div key="env-list-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25 }} className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start gap-3 text-sm text-slate-700">
                    <FaInfoCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">带信息图标的变量表示有明确的数据来源信息</span>
                  </div>
                </div>
                {loading ? (
                  <div className="text-center py-8 text-slate-500">
                    <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-slate-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-sm sm:text-base">加载中...</span>
                  </div>
                ) : envs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FaList className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <span className="text-sm sm:text-base">暂无环境变量数据</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    {isMobile ? (
                      <div className="space-y-3 p-2">
                        {envs.map((item, idx) => (
                          <m.div key={item.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-xl hover:shadow transition" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: idx * 0.02 }}>
                            <div className="flex items-start gap-3">
                              {item.source && <button onClick={() => handleSourceClickWrapper(item.source!)} className="flex-shrink-0 focus:outline-none self-center" aria-label="数据来源"><span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><FaInfoCircle className="w-3 h-3" /></span></button>}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm sm:text-base font-semibold text-slate-900 tracking-wide break-words">{item.key.split(':').pop() || item.key}</div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleStartEdit(item)} disabled={!canWrite} className="p-1.5 text-slate-400 hover:text-slate-900 transition rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed" title="编辑"><FaEdit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteEnvVar(item.key)} disabled={!canWrite} className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed" title="删除"><FaTrash className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                                {editingKey === item.key ? (
                                  <div className="mt-2 space-y-2">
                                    <input value={form.value || ''} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} className={logShareInputClass} autoComplete="off" spellCheck={false} />
                                    <div className="flex items-center gap-2 justify-end">
                                      <button onClick={handleCancelEdit} className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"><FaTimes className="w-3 h-3" />取消</button>
                                      <button onClick={handleSaveEdit} className="inline-flex items-center gap-1 rounded-2xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"><FaCheck className="w-3 h-3" />保存</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs sm:text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{item.value}</div>
                                )}
                              </div>
                            </div>
                          </m.div>
                        ))}
                      </div>
                    ) : (
                      <table className="min-w-full">
                        <thead><tr className="bg-slate-50/80 border-b border-slate-200">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 min-w-[200px] w-1/3">变量名</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 min-w-[300px] w-1/2">值</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 w-[120px]">操作</th>
                        </tr></thead>
                        <tbody>
                          {envs.map((item, idx) => (
                            <tr key={item.key} className={`border-b border-slate-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white/60' : 'bg-slate-50/40'}`}>
                              <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900 align-top">
                                <div className="break-words whitespace-normal leading-relaxed flex items-start gap-1">
                                  {item.source && <button onClick={() => handleSourceClickWrapper(item.source!)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 mt-0.5 flex-shrink-0 hover:text-slate-700 transition-colors cursor-pointer"><FaInfoCircle /></button>}
                                  <span>{item.key.split(':').pop() || item.key}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-sm text-slate-700 align-top">
                                {editingKey === item.key ? (
                                  <div className="flex items-center gap-2">
                                    <input value={form.value || ''} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} className={`${logShareInputClass} flex-1`} autoComplete="off" spellCheck={false} />
                                    <button onClick={handleSaveEdit} className="p-2 text-slate-900 hover:text-slate-700 transition rounded hover:bg-slate-100" title="保存"><FaCheck className="w-4 h-4" /></button>
                                    <button onClick={handleCancelEdit} className="p-2 text-slate-400 hover:text-slate-600 transition rounded hover:bg-slate-100" title="取消"><FaTimes className="w-4 h-4" /></button>
                                  </div>
                                ) : <div className="break-words whitespace-pre-wrap leading-relaxed">{item.value}</div>}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleStartEdit(item)} disabled={!canWrite} className="p-1.5 text-slate-400 hover:text-slate-900 transition rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed" title="编辑"><FaEdit className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleDeleteEnvVar(item.key)} disabled={!canWrite} className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed" title="删除"><FaTrash className="w-3.5 h-3.5" /></button>
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
                  <m.div initial={ENTER_INITIAL} animate={ENTER_ANIMATE} transition={trans03} className="mt-6 pt-4 border-t border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-semibold text-slate-700">总计 {envs.length} 个环境变量</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                          <span className="text-xs sm:text-sm font-medium text-emerald-700">数据正常</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                        <span className="text-xs sm:text-sm text-slate-600">最后更新: {new Date().toLocaleString()}</span>
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
        <SelfContainedCDictDonationConfigSection prefersReducedMotion={prefersReducedMotion} />
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
        <SelfContainedProjectLumenConfigSection />
        <SelfContainedLibreChatProvidersSection prefersReducedMotion={prefersReducedMotion} />

        {/* Source Modal */}
        <AnimatePresence>
          {showSourceModal && (
            <m.div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={modalTrans} onClick={handleSourceModalCloseWrapper} data-source-modal>
              <m.div className="rounded-[26px] border border-white/70 bg-white/90 backdrop-blur-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-6 sm:p-8 w-full max-w-md mx-4 relative z-[10000] max-h-[90vh] overflow-y-auto overscroll-contain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={modalTrans} onClick={(e) => e.stopPropagation()}>
                <div className="text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaInfoCircle className="w-8 h-8 text-slate-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">数据来源</h3>
                  <p className="text-slate-600 mb-6">{selectedSource}</p>
                  <button onClick={handleSourceModalCloseWrapper} className={logSharePrimaryButtonClass}>确定</button>
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