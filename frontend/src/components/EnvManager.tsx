import React, {
  useEffect, useState, useMemo, useCallback, startTransition
} from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { signedFetch } from '../utils/requestSigner';
import RuntimeConfigSections from './RuntimeConfigSections';
import {
  API_URL,
  CLARITY_CONFIG_API,
  GITHUB_BILLING_MULTI_CONFIG_API,
  HCAPTCHA_CONFIG_API,
  IPFS_CONFIG_API,
  LIBRECHAT_PROVIDERS_API,
  MODLIST_API,
  OUTEMAIL_API,
  SHORTURL_AES_API,
  TTS_API,
  TURNSTILE_CONFIG_API,
  WEBHOOK_SECRET_API,
  getAuthHeaders
} from './env-manager/api';
import getApiBaseUrl from '../api';

const GOOGLE_AUTH_API = `${getApiBaseUrl()}/api/admin/google-auth/setting`;
const NEXAI_SETTING_API = `${getApiBaseUrl()}/api/admin/nexai/setting`;
const GOOGLE_WEB_CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/i;
import CollapsibleSection from './env-manager/CollapsibleSection';
import EnvRow from './env-manager/EnvRow';
import { DURATION_03, DURATION_06, ENTER_ANIMATE, ENTER_INITIAL, NO_DURATION } from './env-manager/motion';
import {
  decryptAES256,
  getEnvSource,
  handleSourceClick,
  handleSourceModalClose
} from './env-manager/utils';
import type {
  ChatProviderItem,
  ClarityConfigSetting,
  EnvItem,
  HCaptchaConfigSetting,
  IPFSConfigSetting,
  ModlistSettingItem,
  MultiGitHubBillingConfig,
  OutemailSettingItem,
  ShortAesSetting,
  TtsSettingItem,
  TurnstileConfigSetting,
  WebhookSecretSetting
} from './env-manager/types';
import {
  FaCog,
  FaLock,
  FaList,
  FaSync,
  FaInfoCircle,
  FaChevronDown,
} from 'react-icons/fa';

export { handleSourceClick, handleSourceModalClose };

const ENV_MANAGER_LIGHT_THEME_CSS = `
.env-manager-ui,
.env-manager-ui * {
  color-scheme: light;
}

.env-manager-ui {
  background: transparent;
  color: #374151;
}

.dark .env-manager-ui {
  color: #374151 !important;
}

.env-manager-ui .bg-white {
  background-color: #ffffff !important;
}

.env-manager-ui .bg-gray-50 {
  background-color: #f9fafb !important;
}

.env-manager-ui .bg-gray-100 {
  background-color: #f3f4f6 !important;
}

.env-manager-ui .bg-slate-50 {
  background-color: #f8fafc !important;
}

.env-manager-ui .bg-slate-100 {
  background-color: #f1f5f9 !important;
}

.env-manager-ui .bg-slate-200 {
  background-color: #e2e8f0 !important;
}

.env-manager-ui .bg-blue-50 {
  background-color: #eff6ff !important;
}

.env-manager-ui .bg-blue-100 {
  background-color: #dbeafe !important;
}

.env-manager-ui .bg-indigo-50 {
  background-color: #eef2ff !important;
}

.env-manager-ui .bg-green-50 {
  background-color: #f0fdf4 !important;
}

.env-manager-ui .bg-emerald-50 {
  background-color: #ecfdf5 !important;
}

.env-manager-ui .bg-red-50 {
  background-color: #fef2f2 !important;
}

.env-manager-ui .bg-pink-50 {
  background-color: #fdf2f8 !important;
}

.env-manager-ui .text-gray-900 {
  color: #111827 !important;
}

.env-manager-ui .text-gray-800 {
  color: #1f2937 !important;
}

.env-manager-ui .text-gray-700 {
  color: #374151 !important;
}

.env-manager-ui .text-gray-600 {
  color: #4b5563 !important;
}

.env-manager-ui .text-gray-500 {
  color: #6b7280 !important;
}

.env-manager-ui .text-gray-400 {
  color: #9ca3af !important;
}

.env-manager-ui .text-slate-800 {
  color: #1e293b !important;
}

.env-manager-ui .text-slate-500 {
  color: #64748b !important;
}

.env-manager-ui .text-slate-400 {
  color: #94a3b8 !important;
}

.env-manager-ui .text-blue-700 {
  color: #1d4ed8 !important;
}

.env-manager-ui .text-blue-600 {
  color: #2563eb !important;
}

.env-manager-ui .text-red-700 {
  color: #b91c1c !important;
}

.env-manager-ui .text-red-600 {
  color: #dc2626 !important;
}

.env-manager-ui .text-red-500 {
  color: #ef4444 !important;
}

.env-manager-ui .env-manager-title-panel {
  background: linear-gradient(90deg, #eff6ff 0%, #eef2ff 100%) !important;
  border-color: #dbeafe !important;
  color: #4b5563 !important;
}

.env-manager-ui .env-manager-title {
  background: transparent !important;
  color: #1d4ed8 !important;
}

.env-manager-ui .env-manager-title-icon {
  color: #2563eb !important;
}

.env-manager-ui .env-manager-title-panel p,
.env-manager-ui .env-manager-title-panel li {
  color: #4b5563 !important;
}

.env-manager-ui .env-manager-title-panel .env-manager-title-label {
  color: #1d4ed8 !important;
}

.env-manager-ui input:not([type="checkbox"]):not([type="radio"]),
.env-manager-ui textarea,
.env-manager-ui select {
  background-color: #ffffff;
  color: #111827;
  color-scheme: light;
}

.env-manager-ui input:not([type="checkbox"]):not([type="radio"])::placeholder,
.env-manager-ui textarea::placeholder {
  color: #9ca3af;
  opacity: 1;
}

.env-manager-ui select option {
  background-color: #ffffff;
  color: #111827;
}
`;

const ENV_MANAGER_REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

const ENV_MANAGER_TOGGLE_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200';

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();

  // 基于窗口宽度的移动端检测（随页面缩放实时更新，带防抖）
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkIsMobile = () => {
      try {
        setIsMobile(window.innerWidth <= 768);
      } catch (_) {
        setIsMobile(false);
      }
    };
    checkIsMobile();
    let timer: ReturnType<typeof setTimeout>;
    const debouncedCheck = () => {
      clearTimeout(timer);
      timer = setTimeout(checkIsMobile, 150);
    };
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, []);

  // OutEmail Settings
  const [outemailSettings, setOutemailSettings] = useState<OutemailSettingItem[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingDomain, setSettingDomain] = useState('');
  const [settingCode, setSettingCode] = useState('');
  const [settingApiKey, setSettingApiKey] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDeletingDomain, setSettingsDeletingDomain] = useState<string | null>(null);

  // Modlist MODIFY_CODE Setting
  const [modSetting, setModSetting] = useState<ModlistSettingItem | null>(null);
  const [modLoading, setModLoading] = useState(false);
  const [modCodeInput, setModCodeInput] = useState('');
  const [modSaving, setModSaving] = useState(false);
  const [modDeleting, setModDeleting] = useState(false);

  // TTS GENERATION_CODE Setting
  const [ttsSetting, setTtsSetting] = useState<TtsSettingItem | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsCodeInput, setTtsCodeInput] = useState('');
  const [ttsSaving, setTtsSaving] = useState(false);
  const [ttsDeleting, setTtsDeleting] = useState(false);

  // Google / NexAI Client ID (runtime config backed, env-var named)
  const [googleClientIdsLoading, setGoogleClientIdsLoading] = useState(false);
  const [googleClientIdsSaving, setGoogleClientIdsSaving] = useState(false);
  const [googleClientIdsDeleting, setGoogleClientIdsDeleting] = useState(false);
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [nexaiGoogleClientIdInput, setNexaiGoogleClientIdInput] = useState('');
  const [googleClientIdCurrent, setGoogleClientIdCurrent] = useState('');
  const [nexaiGoogleClientIdCurrent, setNexaiGoogleClientIdCurrent] = useState('');
  const [googleClientIdsUpdatedAt, setGoogleClientIdsUpdatedAt] = useState<string | undefined>(undefined);

  // ShortURL AES_KEY Setting
  const [shortAesSetting, setShortAesSetting] = useState<ShortAesSetting | null>(null);
  const [shortAesLoading, setShortAesLoading] = useState(false);
  const [shortAesInput, setShortAesInput] = useState('');
  const [shortAesSaving, setShortAesSaving] = useState(false);
  const [shortAesDeleting, setShortAesDeleting] = useState(false);

  // Webhook Secret Setting
  const [webhookKeyInput, setWebhookKeyInput] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [webhookSetting, setWebhookSetting] = useState<WebhookSecretSetting | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookDeleting, setWebhookDeleting] = useState(false);

  // LibreChat Providers
  const [providers, setProviders] = useState<ChatProviderItem[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerDeletingId, setProviderDeletingId] = useState<string | null>(null);
  const [providerFilterGroup, setProviderFilterGroup] = useState('');
  // 表单
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerModel, setProviderModel] = useState('');
  const [providerGroup, setProviderGroup] = useState('');
  const [providerEnabled, setProviderEnabled] = useState(true);
  const [providerWeight, setProviderWeight] = useState<number>(1);

  // IPFS Config Setting
  const [ipfsConfig, setIpfsConfig] = useState<IPFSConfigSetting | null>(null);
  const [ipfsConfigLoading, setIpfsConfigLoading] = useState(false);
  const [ipfsConfigSaving, setIpfsConfigSaving] = useState(false);
  const [ipfsConfigTesting, setIpfsConfigTesting] = useState(false);
  const [ipfsUploadUrlInput, setIpfsUploadUrlInput] = useState('');
  const [ipfsUserAgentInput, setIpfsUserAgentInput] = useState('');
  const [imageBedApiUrlInput, setImageBedApiUrlInput] = useState('');
  const [imageBedCdnDomainInput, setImageBedCdnDomainInput] = useState('');
  const [imageBedStorageDestinationInput, setImageBedStorageDestinationInput] = useState('');
  const [imageBedOutputFormatInput, setImageBedOutputFormatInput] = useState('');

  // Turnstile Config Setting
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileConfigSetting | null>(null);
  const [turnstileConfigLoading, setTurnstileConfigLoading] = useState(false);
  const [turnstileConfigSaving, setTurnstileConfigSaving] = useState(false);
  const [turnstileConfigDeleting, setTurnstileConfigDeleting] = useState(false);
  const [turnstileSiteKeyInput, setTurnstileSiteKeyInput] = useState('');
  const [turnstileSecretKeyInput, setTurnstileSecretKeyInput] = useState('');

  // hCaptcha Config Setting
  const [hcaptchaConfig, setHcaptchaConfig] = useState<HCaptchaConfigSetting | null>(null);
  const [hcaptchaConfigLoading, setHcaptchaConfigLoading] = useState(false);
  const [hcaptchaConfigSaving, setHcaptchaConfigSaving] = useState(false);
  const [hcaptchaConfigDeleting, setHcaptchaConfigDeleting] = useState(false);
  const [hcaptchaSiteKeyInput, setHcaptchaSiteKeyInput] = useState('');
  const [hcaptchaSecretKeyInput, setHcaptchaSecretKeyInput] = useState('');

  // Clarity Config Setting
  const [clarityConfig, setClarityConfig] = useState<ClarityConfigSetting | null>(null);
  const [clarityConfigLoading, setClarityConfigLoading] = useState(false);
  const [clarityConfigSaving, setClarityConfigSaving] = useState(false);
  const [clarityConfigDeleting, setClarityConfigDeleting] = useState(false);
  const [clarityProjectIdInput, setClarityProjectIdInput] = useState('');

  // GitHub Billing Config Setting (Multi-Config)
  const [multiGithubBillingConfig, setMultiGithubBillingConfig] = useState<MultiGitHubBillingConfig | null>(null);
  const [githubBillingConfigLoading, setGithubBillingConfigLoading] = useState(false);
  const [githubBillingConfigSaving, setGithubBillingConfigSaving] = useState(false);
  const [githubBillingCurlInput, setGithubBillingCurlInput] = useState('');
  const [selectedConfigKey, setSelectedConfigKey] = useState<'config1' | 'config2' | 'config3'>('config1');
  const [showConfigSelector, setShowConfigSelector] = useState(false);

  const trans06 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_06), [prefersReducedMotion]);
  const trans03 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_03), [prefersReducedMotion]);
  const modalTrans = useMemo(() => (prefersReducedMotion ? NO_DURATION : { duration: 0.1 }), [prefersReducedMotion]);

  // ========== 性能优化：按需展开 & 懒加载数据 ==========
  // 追踪已展开的区块，只有展开时才渲染内容和拉取数据
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  // 追踪已经拉取过数据的区块，避免重复请求
  const fetchedSectionsRef = React.useRef<Set<string>>(new Set());

  const toggleSection = useCallback((key: string) => {
    startTransition(() => {
      setExpandedSections(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    });
  }, []);

  const isSectionOpen = useCallback((key: string) => expandedSections.has(key), [expandedSections]);

  const fetchEnvs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setNotification({ message: '请先登录后再操作', type: 'error' });
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
            break;
          case '用户不存在':
            setNotification({ message: '用户不存在，请重新登录', type: 'error' });
            break;
          case '需要管理员权限':
          case '无权限':
            setNotification({ message: '需要管理员权限', type: 'error' });
            break;
          default:
            setNotification({ message: data.error || '获取失败', type: 'error' });
        }
        setLoading(false);
        return;
      }

      if (data.success) {
        let envArr: EnvItem[] = [];

        // 检查是否为加密数据（通过检测data和iv字段来判断）
        if (data.data && data.iv && typeof data.data === 'string' && typeof data.iv === 'string') {
          try {
            const token = localStorage.getItem('token');
            if (!token) {
              setNotification({ message: 'Token不存在，无法解密数据', type: 'error' });
              setLoading(false);
              return;
            }

            // 解密数据
            const decryptedJson = decryptAES256(data.data, data.iv, token);
            const decryptedData = JSON.parse(decryptedJson);

            if (Array.isArray(decryptedData)) {
              envArr = decryptedData;
            } else {
              setNotification({ message: '解密数据格式错误', type: 'error' });
              setLoading(false);
              return;
            }

            // 为环境变量添加数据来源信息
            envArr = envArr.map(item => {
              const source = getEnvSource(item.key);
              return { ...item, source };
            });
          } catch (decryptError) {
            setNotification({ message: '数据解密失败，请检查登录状态', type: 'error' });
            setLoading(false);
            return;
          }
        } else {
          // 兼容旧的未加密格式
          if (Array.isArray(data.envs)) {
            envArr = data.envs;
          } else if (data.envs && typeof data.envs === 'object') {
            envArr = Object.entries(data.envs).map(([key, value]) => ({ key, value: String(value) }));
          }
        }

        setEnvs(envArr.map(item => {
          const rawKey = item.key.includes(':') ? item.key.split(':').pop() : item.key;
          return rawKey === 'USER_STORAGE_MODE' ? { ...item, value: 'mongo' } : item;
        }));
      } else {
        setNotification({ message: data.error || '获取失败', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: '获取失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  const fetchOutemailSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(OUTEMAIL_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '获取对外邮件设置失败', type: 'error' });
        setSettingsLoading(false);
        return;
      }
      if (data && data.success && Array.isArray(data.settings)) {
        setOutemailSettings(data.settings as OutemailSettingItem[]);
      } else {
        setOutemailSettings([]);
      }
    } catch (e) {
      setNotification({ message: '获取对外邮件设置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setSettingsLoading(false);
    }
  }, [setNotification]);

  const handleSaveSetting = useCallback(async () => {
    if (settingsSaving) return;
    const domain = settingDomain.trim();
    const code = settingCode.trim();
    const apiKey = settingApiKey.trim();
    if (!code && !apiKey) {
      setNotification({ message: '请填写校验码或外部 API Key', type: 'error' });
      return;
    }
    setSettingsSaving(true);
    try {
      const res = await fetch(OUTEMAIL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ domain, code, apiKey })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setSettingCode('');
      setSettingApiKey('');
      await fetchOutemailSettings();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsSaving, settingDomain, settingCode, settingApiKey, fetchOutemailSettings, setNotification]);

  const handleDeleteSetting = useCallback(async (domain: string) => {
    if (settingsDeletingDomain) return;
    setSettingsDeletingDomain(domain);
    try {
      const res = await fetch(OUTEMAIL_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ domain })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchOutemailSettings();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setSettingsDeletingDomain(null);
    }
  }, [settingsDeletingDomain, setNotification, fetchOutemailSettings]);

  const fetchModlistSetting = useCallback(async () => {
    setModLoading(true);
    try {
      const res = await fetch(MODLIST_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '获取修改码失败', type: 'error' });
        setModLoading(false);
        return;
      }
      if (data && data.success) {
        setModSetting(data.setting || null);
      } else {
        setModSetting(null);
      }
    } catch (e) {
      setNotification({ message: '获取修改码失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setModLoading(false);
    }
  }, [setNotification]);

  const handleSaveModCode = useCallback(async () => {
    if (modSaving) return;
    const code = modCodeInput.trim();
    if (!code) {
      setNotification({ message: '请填写修改码', type: 'error' });
      return;
    }
    setModSaving(true);
    try {
      const res = await fetch(MODLIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setModCodeInput('');
      await fetchModlistSetting();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setModSaving(false);
    }
  }, [modSaving, modCodeInput, fetchModlistSetting, setNotification]);

  const handleDeleteModCode = useCallback(async () => {
    if (modDeleting) return;
    setModDeleting(true);
    try {
      const res = await fetch(MODLIST_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchModlistSetting();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setModDeleting(false);
    }
  }, [modDeleting, fetchModlistSetting, setNotification]);

  const fetchTtsSetting = useCallback(async () => {
    setTtsLoading(true);
    try {
      const res = await fetch(TTS_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '获取生成码失败', type: 'error' });
        setTtsLoading(false);
        return;
      }
      if (data && data.success) {
        setTtsSetting(data.setting || null);
      } else {
        setTtsSetting(null);
      }
    } catch (e) {
      setNotification({ message: '获取生成码失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTtsLoading(false);
    }
  }, [setNotification]);

  const handleSaveTtsCode = useCallback(async () => {
    if (ttsSaving) return;
    const code = ttsCodeInput.trim();
    if (!code) {
      setNotification({ message: '请填写生成码', type: 'error' });
      return;
    }
    setTtsSaving(true);
    try {
      const res = await fetch(TTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setTtsCodeInput('');
      await fetchTtsSetting();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTtsSaving(false);
    }
  }, [ttsSaving, ttsCodeInput, fetchTtsSetting, setNotification]);

  const handleDeleteTtsCode = useCallback(async () => {
    if (ttsDeleting) return;
    setTtsDeleting(true);
    try {
      const res = await fetch(TTS_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchTtsSetting();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTtsDeleting(false);
    }
  }, [ttsDeleting, fetchTtsSetting, setNotification]);

  const fetchGoogleClientIds = useCallback(async () => {
    setGoogleClientIdsLoading(true);
    try {
      const [googleRes, nexaiRes] = await Promise.all([
        fetch(GOOGLE_AUTH_API, { headers: { ...getAuthHeaders() } }),
        fetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } }),
      ]);

      let googleClientId = '';
      let nexaiGoogleClientId = '';
      let updatedAt: string | undefined;

      if (googleRes.ok) {
        const googleData = await googleRes.json();
        googleClientId = String(googleData?.setting?.config?.clientId || '').trim();
        updatedAt = googleData?.setting?.updatedAt || updatedAt;
      } else {
        const googleData = await googleRes.json().catch(() => ({}));
        setNotification({ message: googleData.error || '获取 GOOGLE_CLIENT_ID 失败', type: 'error' });
      }

      if (nexaiRes.ok) {
        const nexaiData = await nexaiRes.json();
        nexaiGoogleClientId = String(nexaiData?.setting?.config?.google?.clientId || '').trim();
        updatedAt = nexaiData?.setting?.updatedAt || updatedAt;
      } else {
        const nexaiData = await nexaiRes.json().catch(() => ({}));
        setNotification({ message: nexaiData.error || '获取 NEXAI_GOOGLE_CLIENT_ID 失败', type: 'error' });
      }

      setGoogleClientIdCurrent(googleClientId);
      setNexaiGoogleClientIdCurrent(nexaiGoogleClientId);
      setGoogleClientIdInput(googleClientId);
      setNexaiGoogleClientIdInput(nexaiGoogleClientId);
      setGoogleClientIdsUpdatedAt(updatedAt);
    } catch (e) {
      setNotification({
        message: '获取 Google Client ID 失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setGoogleClientIdsLoading(false);
    }
  }, [setNotification]);

  const handleSaveGoogleClientIds = useCallback(async () => {
    if (googleClientIdsSaving) return;

    const googleClientId = googleClientIdInput.trim();
    const nexaiGoogleClientId = nexaiGoogleClientIdInput.trim();

    if (googleClientId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(googleClientId)) {
      setNotification({
        message: 'GOOGLE_CLIENT_ID 格式无效，需为 xxx.apps.googleusercontent.com',
        type: 'error',
      });
      return;
    }
    if (nexaiGoogleClientId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(nexaiGoogleClientId)) {
      setNotification({
        message: 'NEXAI_GOOGLE_CLIENT_ID 格式无效，需为 xxx.apps.googleusercontent.com',
        type: 'error',
      });
      return;
    }

    setGoogleClientIdsSaving(true);
    try {
      // Form is source of truth: empty input clears the corresponding runtime value.
      const googleTask = googleClientId
        ? fetch(GOOGLE_AUTH_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ clientId: googleClientId }),
          })
        : fetch(GOOGLE_AUTH_API, {
            method: 'DELETE',
            headers: { ...getAuthHeaders() },
          });

      // Preserve other NexAI fields when updating/clearing only google.clientId.
      const nexaiGetRes = await fetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } });
      let nexaiPayload: Record<string, unknown> = {
        google: { clientId: nexaiGoogleClientId },
      };
      if (nexaiGetRes.ok) {
        const nexaiData = await nexaiGetRes.json();
        const cfg = nexaiData?.setting?.config || {};
        nexaiPayload = {
          jwtExpiresIn: cfg.jwtExpiresIn,
          refreshExpiresIn: cfg.refreshExpiresIn,
          frontendUrl: cfg.frontendUrl,
          google: { clientId: nexaiGoogleClientId },
          github: {
            clientId: cfg.github?.clientId || '',
          },
        };
      }

      const nexaiTask = fetch(NEXAI_SETTING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(nexaiPayload),
      });

      const results = await Promise.all([googleTask, nexaiTask]);
      for (const res of results) {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setNotification({ message: data.error || '保存 Google Client ID 失败', type: 'error' });
          return;
        }
      }

      setNotification({ message: 'Google Client ID 已保存并立即生效', type: 'success' });
      await fetchGoogleClientIds();
    } catch (e) {
      setNotification({
        message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setGoogleClientIdsSaving(false);
    }
  }, [
    fetchGoogleClientIds,
    googleClientIdInput,
    googleClientIdsSaving,
    nexaiGoogleClientIdInput,
    setNotification,
  ]);

  const handleDeleteGoogleClientIds = useCallback(async () => {
    if (googleClientIdsDeleting) return;
    setGoogleClientIdsDeleting(true);
    try {
      // Reset main-site Google Auth; clear only NexAI google.clientId while preserving other NexAI fields.
      const nexaiRes = await fetch(NEXAI_SETTING_API, { headers: { ...getAuthHeaders() } });
      let nexaiPayload: Record<string, unknown> = {
        google: { clientId: '' },
      };
      if (nexaiRes.ok) {
        const nexaiData = await nexaiRes.json();
        const cfg = nexaiData?.setting?.config || {};
        nexaiPayload = {
          jwtExpiresIn: cfg.jwtExpiresIn,
          refreshExpiresIn: cfg.refreshExpiresIn,
          frontendUrl: cfg.frontendUrl,
          google: { clientId: '' },
          github: {
            clientId: cfg.github?.clientId || '',
          },
        };
      }

      const [googleDelRes, nexaiSaveRes] = await Promise.all([
        fetch(GOOGLE_AUTH_API, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        }),
        fetch(NEXAI_SETTING_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(nexaiPayload),
        }),
      ]);

      if (!googleDelRes.ok) {
        const data = await googleDelRes.json().catch(() => ({}));
        setNotification({ message: data.error || '重置 GOOGLE_CLIENT_ID 失败', type: 'error' });
        return;
      }
      if (!nexaiSaveRes.ok) {
        const data = await nexaiSaveRes.json().catch(() => ({}));
        setNotification({ message: data.error || '重置 NEXAI_GOOGLE_CLIENT_ID 失败', type: 'error' });
        return;
      }

      setNotification({ message: 'Google Client ID 已重置', type: 'success' });
      setGoogleClientIdInput('');
      setNexaiGoogleClientIdInput('');
      await fetchGoogleClientIds();
    } catch (e) {
      setNotification({
        message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setGoogleClientIdsDeleting(false);
    }
  }, [fetchGoogleClientIds, googleClientIdsDeleting, setNotification]);

  // ShortURL AES_KEY handlers
  const fetchShortAes = useCallback(async () => {
    setShortAesLoading(true);
    try {
      const res = await fetch(SHORTURL_AES_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取 AES_KEY 失败', type: 'error' });
        setShortAesLoading(false);
        return;
      }
      setShortAesSetting({ aesKey: data.aesKey ?? null, updatedAt: data.updatedAt });
    } catch (e) {
      setNotification({ message: '获取 AES_KEY 失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setShortAesLoading(false);
    }
  }, [setNotification]);

  const handleSaveShortAes = useCallback(async () => {
    if (shortAesSaving) return;
    const value = shortAesInput.trim();
    if (!value) {
      setNotification({ message: '请填写 AES_KEY', type: 'error' });
      return;
    }
    setShortAesSaving(true);
    try {
      const res = await signedFetch(SHORTURL_AES_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ value })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setShortAesInput('');
      await fetchShortAes();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setShortAesSaving(false);
    }
  }, [shortAesSaving, shortAesInput, fetchShortAes, setNotification]);

  const handleDeleteShortAes = useCallback(async () => {
    if (shortAesDeleting) return;
    setShortAesDeleting(true);
    try {
      const res = await signedFetch(SHORTURL_AES_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchShortAes();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setShortAesDeleting(false);
    }
  }, [shortAesDeleting, fetchShortAes, setNotification]);

  // Webhook Secret handlers
  const fetchWebhookSecret = useCallback(async () => {
    setWebhookLoading(true);
    try {
      const key = webhookKeyInput.trim().toUpperCase() || 'DEFAULT';
      const res = await fetch(`${WEBHOOK_SECRET_API}?key=${encodeURIComponent(key)}`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取 Webhook 密钥失败', type: 'error' });
        setWebhookLoading(false);
        return;
      }
      setWebhookSetting({ key: data.key || key, secret: data.secret ?? null, updatedAt: data.updatedAt });
    } catch (e) {
      setNotification({ message: '获取 Webhook 密钥失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setWebhookLoading(false);
    }
  }, [webhookKeyInput, setNotification]);

  const handleSaveWebhookSecret = useCallback(async () => {
    if (webhookSaving) return;
    const key = webhookKeyInput.trim().toUpperCase() || 'DEFAULT';
    const secret = webhookSecretInput.trim();
    if (!secret) {
      setNotification({ message: '请填写 Webhook 密钥', type: 'error' });
      return;
    }
    setWebhookSaving(true);
    try {
      const res = await fetch(WEBHOOK_SECRET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key, secret })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setWebhookSecretInput('');
      await fetchWebhookSecret();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setWebhookSaving(false);
    }
  }, [webhookSaving, webhookKeyInput, webhookSecretInput, fetchWebhookSecret, setNotification]);

  const handleDeleteWebhookSecret = useCallback(async () => {
    if (webhookDeleting) return;
    const key = webhookKeyInput.trim().toUpperCase() || 'DEFAULT';
    setWebhookDeleting(true);
    try {
      const res = await fetch(WEBHOOK_SECRET_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchWebhookSecret();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setWebhookDeleting(false);
    }
  }, [webhookDeleting, webhookKeyInput, fetchWebhookSecret, setNotification]);

  // Providers handlers
  const fetchProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const url = providerFilterGroup ? `${LIBRECHAT_PROVIDERS_API}?group=${encodeURIComponent(providerFilterGroup)}` : LIBRECHAT_PROVIDERS_API;
      const res = await fetch(url, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取提供者失败', type: 'error' });
        setProvidersLoading(false);
        return;
      }
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (e) {
      setNotification({ message: '获取提供者失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setProvidersLoading(false);
    }
  }, [providerFilterGroup, setNotification]);

  const resetProviderForm = useCallback(() => {
    setProviderId(null);
    setProviderBaseUrl('');
    setProviderApiKey('');
    setProviderModel('');
    setProviderGroup('');
    setProviderEnabled(true);
    setProviderWeight(1);
  }, []);

  const handleSaveProvider = useCallback(() => {
    if (providerSaving) return;
    const baseUrl = providerBaseUrl.trim();
    const apiKey = providerApiKey.trim();
    const model = providerModel.trim();
    const group = providerGroup.trim();
    const enabled = !!providerEnabled;
    const weight = Math.max(1, Math.min(10, Number(providerWeight || 1)));
    if (!baseUrl || !apiKey || !model) {
      setNotification({ message: '请填写 baseUrl / apiKey / model', type: 'error' });
      return;
    }
    setProviderSaving(true);
    (async () => {
      try {
        const body: any = { baseUrl, apiKey, model, group, enabled, weight };
        if (providerId) body.id = providerId;
        const res = await fetch(LIBRECHAT_PROVIDERS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setNotification({ message: data.error || '保存失败', type: 'error' });
          return;
        }
        setNotification({ message: '保存成功', type: 'success' });
        resetProviderForm();
        await fetchProviders();
      } catch (e) {
        setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
      } finally {
        setProviderSaving(false);
      }
    })();
  }, [providerSaving, providerId, providerBaseUrl, providerApiKey, providerModel, providerGroup, providerEnabled, providerWeight, fetchProviders, resetProviderForm, setNotification]);

  const handleDeleteProvider = useCallback(async (id: string) => {
    if (providerDeletingId) return;
    setProviderDeletingId(id);
    try {
      const res = await fetch(`${LIBRECHAT_PROVIDERS_API}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchProviders();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setProviderDeletingId(null);
    }
  }, [providerDeletingId, fetchProviders, setNotification]);

  const handleEditProvider = useCallback((p: ChatProviderItem) => {
    setProviderId(p.id);
    setProviderBaseUrl(p.baseUrl);
    setProviderApiKey(''); // 不回显明文
    setProviderModel(p.model);
    setProviderGroup(p.group || '');
    setProviderEnabled(!!p.enabled);
    setProviderWeight(Number(p.weight || 1));
  }, []);

  // IPFS Config handlers
  const fetchIpfsConfig = useCallback(async () => {
    setIpfsConfigLoading(true);
    try {
      const res = await fetch(IPFS_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取IPFS配置失败', type: 'error' });
        setIpfsConfigLoading(false);
        return;
      }
      setIpfsConfig({
        ipfsUploadUrl: data.data.ipfsUploadUrl,
        ipfsUa: data.data.ipfsUa,
        imageBedApiUrl: data.data.imageBedApiUrl,
        imageBedCdnDomain: data.data.imageBedCdnDomain,
        imageBedStorageDestination: data.data.imageBedStorageDestination,
        imageBedOutputFormat: data.data.imageBedOutputFormat,
      });
    } catch (e) {
      setNotification({ message: '获取IPFS配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setIpfsConfigLoading(false);
    }
  }, [setNotification]);

  const handleSaveIpfsConfig = useCallback(async () => {
    if (ipfsConfigSaving) return;
    const url = ipfsUploadUrlInput.trim();
    const ua = ipfsUserAgentInput.trim();
    const ibApi = imageBedApiUrlInput.trim();
    const ibCdn = imageBedCdnDomainInput.trim();
    const ibStorage = imageBedStorageDestinationInput.trim();
    const ibFormat = imageBedOutputFormatInput.trim();
    if (!url && !ua && !ibApi && !ibCdn && !ibStorage && !ibFormat) {
      setNotification({ message: '请至少填写一个 IPFS / ImageBed 配置项', type: 'error' });
      return;
    }
    setIpfsConfigSaving(true);
    try {
      const res = await fetch(IPFS_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...(url ? { ipfsUploadUrl: url } : {}),
          ...(ua ? { ipfsUa: ua } : {}),
          ...(ibApi ? { imageBedApiUrl: ibApi } : {}),
          ...(ibCdn ? { imageBedCdnDomain: ibCdn } : {}),
          ...(ibStorage ? { imageBedStorageDestination: ibStorage } : {}),
          ...(ibFormat ? { imageBedOutputFormat: ibFormat } : {}),
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setIpfsUploadUrlInput('');
      setIpfsUserAgentInput('');
      setImageBedApiUrlInput('');
      setImageBedCdnDomainInput('');
      setImageBedStorageDestinationInput('');
      setImageBedOutputFormatInput('');
      await fetchIpfsConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setIpfsConfigSaving(false);
    }
  }, [ipfsConfigSaving, ipfsUploadUrlInput, ipfsUserAgentInput, imageBedApiUrlInput, imageBedCdnDomainInput, imageBedStorageDestinationInput, imageBedOutputFormatInput, fetchIpfsConfig, setNotification]);

  const handleTestIpfsConfig = useCallback(async (target: 'imagebed' | 'ipfs' = 'imagebed') => {
    if (ipfsConfigTesting) return;
    setIpfsConfigTesting(true);
    try {
      const res = await fetch(`${IPFS_CONFIG_API}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '测试失败', type: 'error' });
        return;
      }
      setNotification({ message: data.message || '测试成功', type: 'success' });
    } catch (e) {
      setNotification({ message: '测试失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setIpfsConfigTesting(false);
    }
  }, [ipfsConfigTesting, setNotification]);

  // Turnstile Config handlers
  const fetchTurnstileConfig = useCallback(async () => {
    setTurnstileConfigLoading(true);
    try {
      const res = await fetch(TURNSTILE_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        // 处理认证错误
        if (res.status === 401) {
          setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
        } else {
          setNotification({ message: data.error || '获取Turnstile配置失败', type: 'error' });
        }
        setTurnstileConfigLoading(false);
        return;
      }
      // Turnstile配置API直接返回配置数据，不包含success字段
      setTurnstileConfig({
        enabled: data.enabled || false,
        siteKey: data.siteKey || null,
        secretKey: data.secretKey || null,
        updatedAt: data.updatedAt
      });
    } catch (e) {
      setNotification({ message: '获取Turnstile配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTurnstileConfigLoading(false);
    }
  }, [setNotification]);

  const handleSaveTurnstileConfig = useCallback(async (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => {
    if (turnstileConfigSaving) return;
    const value = key === 'TURNSTILE_SECRET_KEY' ? turnstileSecretKeyInput.trim() : turnstileSiteKeyInput.trim();
    if (!value) {
      setNotification({ message: `请填写${key === 'TURNSTILE_SECRET_KEY' ? 'Secret Key' : 'Site Key'}`, type: 'error' });
      return;
    }
    setTurnstileConfigSaving(true);
    try {
      const res = await fetch(TURNSTILE_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key, value })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      if (key === 'TURNSTILE_SECRET_KEY') {
        setTurnstileSecretKeyInput('');
      } else {
        setTurnstileSiteKeyInput('');
      }
      await fetchTurnstileConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTurnstileConfigSaving(false);
    }
  }, [turnstileConfigSaving, turnstileSecretKeyInput, turnstileSiteKeyInput, fetchTurnstileConfig, setNotification]);

  const handleDeleteTurnstileConfig = useCallback(async (key: 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY') => {
    if (turnstileConfigDeleting) return;
    setTurnstileConfigDeleting(true);
    try {
      const res = await fetch(`${TURNSTILE_CONFIG_API}/${key}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchTurnstileConfig();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setTurnstileConfigDeleting(false);
    }
  }, [turnstileConfigDeleting, fetchTurnstileConfig, setNotification]);

  // hCaptcha Config handlers
  const fetchHcaptchaConfig = useCallback(async () => {
    setHcaptchaConfigLoading(true);
    try {
      const res = await fetch(HCAPTCHA_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        // 处理认证错误
        if (res.status === 401) {
          setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
        } else {
          setNotification({ message: data.error || '获取hCaptcha配置失败', type: 'error' });
        }
        setHcaptchaConfigLoading(false);
        return;
      }
      // hCaptcha配置API直接返回配置数据，不包含success字段
      setHcaptchaConfig({
        enabled: data.enabled || false,
        siteKey: data.siteKey || null,
        secretKey: data.secretKey || null,
        updatedAt: data.updatedAt
      });
    } catch (e) {
      setNotification({ message: '获取hCaptcha配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setHcaptchaConfigLoading(false);
    }
  }, [setNotification]);

  const handleSaveHcaptchaConfig = useCallback(async (key: 'HCAPTCHA_SECRET_KEY' | 'HCAPTCHA_SITE_KEY') => {
    if (hcaptchaConfigSaving) return;
    const value = key === 'HCAPTCHA_SECRET_KEY' ? hcaptchaSecretKeyInput.trim() : hcaptchaSiteKeyInput.trim();
    if (!value) {
      setNotification({ message: `请填写${key === 'HCAPTCHA_SECRET_KEY' ? 'Secret Key' : 'Site Key'}`, type: 'error' });
      return;
    }
    setHcaptchaConfigSaving(true);
    try {
      const res = await fetch(HCAPTCHA_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key, value })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      if (key === 'HCAPTCHA_SECRET_KEY') {
        setHcaptchaSecretKeyInput('');
      } else {
        setHcaptchaSiteKeyInput('');
      }
      await fetchHcaptchaConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setHcaptchaConfigSaving(false);
    }
  }, [hcaptchaConfigSaving, hcaptchaSecretKeyInput, hcaptchaSiteKeyInput, fetchHcaptchaConfig, setNotification]);

  const handleDeleteHcaptchaConfig = useCallback(async (key: 'HCAPTCHA_SECRET_KEY' | 'HCAPTCHA_SITE_KEY') => {
    if (hcaptchaConfigDeleting) return;
    setHcaptchaConfigDeleting(true);
    try {
      const res = await fetch(`${HCAPTCHA_CONFIG_API}/${key}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchHcaptchaConfig();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setHcaptchaConfigDeleting(false);
    }
  }, [hcaptchaConfigDeleting, fetchHcaptchaConfig, setNotification]);

  // Clarity Config handlers
  const fetchClarityConfig = useCallback(async () => {
    setClarityConfigLoading(true);
    try {
      const res = await fetch(CLARITY_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        if (res.status !== 404) {
          setNotification({ message: data.error || '获取Clarity配置失败', type: 'error' });
        }
        setClarityConfigLoading(false);
        return;
      }
      // Clarity配置API直接返回配置数据
      setClarityConfig({
        enabled: data.enabled || false,
        projectId: data.projectId || null,
        updatedAt: data.updatedAt
      });
    } catch (e) {
      setNotification({ message: '获取Clarity配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setClarityConfigLoading(false);
    }
  }, [setNotification]);

  const handleSaveClarityConfig = useCallback(async () => {
    if (clarityConfigSaving) return;
    const value = clarityProjectIdInput.trim().toLowerCase();

    // 前端格式验证
    if (!value) {
      setNotification({ message: '请填写 Clarity Project ID', type: 'error' });
      return;
    }

    // 验证格式：10位小写字母数字组合
    const clarityIdPattern = /^[a-z0-9]{10}$/;
    if (!clarityIdPattern.test(value)) {
      setNotification({
        message: 'Project ID 格式无效，应为10位小写字母数字组合（例如：t1dkcavsyz）',
        type: 'error'
      });
      return;
    }

    setClarityConfigSaving(true);
    try {
      const res = await fetch(CLARITY_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ projectId: value })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        // 显示详细的错误信息
        const errorMsg = data.error || data.message || '保存失败';
        const errorCode = data.code;
        const fullMessage = errorCode ? `${errorMsg} (${errorCode})` : errorMsg;
        setNotification({ message: fullMessage, type: 'error' });
        return;
      }

      setNotification({ message: '保存成功', type: 'success' });
      setClarityProjectIdInput('');
      await fetchClarityConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setClarityConfigSaving(false);
    }
  }, [clarityConfigSaving, clarityProjectIdInput, fetchClarityConfig, setNotification]);

  const handleDeleteClarityConfig = useCallback(async () => {
    if (clarityConfigDeleting) return;
    setClarityConfigDeleting(true);
    try {
      const res = await fetch(CLARITY_CONFIG_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        // 显示详细的错误信息
        const errorMsg = data.error || data.message || '删除失败';
        const errorCode = data.code;
        const fullMessage = errorCode ? `${errorMsg} (${errorCode})` : errorMsg;
        setNotification({ message: fullMessage, type: 'error' });
        return;
      }

      setNotification({ message: '删除成功', type: 'success' });
      await fetchClarityConfig();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setClarityConfigDeleting(false);
    }
  }, [clarityConfigDeleting, fetchClarityConfig, setNotification]);

  // GitHub Billing Multi-Config handlers
  const fetchGithubBillingConfig = useCallback(async () => {
    setGithubBillingConfigLoading(true);
    try {
      const res = await fetch(GITHUB_BILLING_MULTI_CONFIG_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          // 没有配置时设置为空
          setMultiGithubBillingConfig(null);
        } else {
          setNotification({ message: data.error || '获取 GitHub Billing 配置失败', type: 'error' });
        }
        setGithubBillingConfigLoading(false);
        return;
      }
      if (data && data.success) {
        setMultiGithubBillingConfig(data.data || null);
      } else {
        setMultiGithubBillingConfig(null);
      }
    } catch (e) {
      setNotification({ message: '获取 GitHub Billing 配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setGithubBillingConfigLoading(false);
    }
  }, [setNotification]);

  const handleSaveGithubBillingConfig = useCallback(async () => {
    if (githubBillingConfigSaving) return;
    const curlCommand = githubBillingCurlInput.trim();
    if (!curlCommand) {
      setNotification({ message: '请填写 curl 命令', type: 'error' });
      return;
    }

    // 安全的 GitHub URL 验证
    try {
      // 从 curl 命令中提取 URL（匹配引号内的 URL 或空格后的第一个 URL）
      const urlMatch = curlCommand.match(/(?:['"])(https?:\/\/[^\s'"]+)(?:['"])|(?:\s)(https?:\/\/[^\s'"]+)/);
      if (!urlMatch) {
        setNotification({ message: '无法从 curl 命令中提取有效的 URL', type: 'error' });
        return;
      }

      const url = new URL(urlMatch[1] || urlMatch[2]);

      // 严格验证主机名：必须是 github.com 或其子域名
      const hostname = url.hostname.toLowerCase();
      const isValidGithubDomain = hostname === 'github.com' || hostname.endsWith('.github.com');

      // 验证协议必须是 https
      const isSecureProtocol = url.protocol === 'https:';

      if (!isValidGithubDomain || !isSecureProtocol) {
        setNotification({
          message: '请提供有效的 GitHub API curl 命令（必须使用 https://github.com 或其子域名）',
          type: 'error'
        });
        return;
      }
    } catch (e) {
      setNotification({
        message: '无效的 curl 命令格式，请确保包含有效的 GitHub API URL',
        type: 'error'
      });
      return;
    }

    setGithubBillingConfigSaving(true);
    try {
      const res = await fetch(`${GITHUB_BILLING_MULTI_CONFIG_API}/${selectedConfigKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ curlCommand })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: `配置 ${selectedConfigKey} 保存成功`, type: 'success' });
      setGithubBillingCurlInput('');
      await fetchGithubBillingConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setGithubBillingConfigSaving(false);
    }
  }, [githubBillingConfigSaving, githubBillingCurlInput, selectedConfigKey, fetchGithubBillingConfig, setNotification]);

  const handleDeleteGithubBillingConfig = useCallback(async (configKey: 'config1' | 'config2' | 'config3') => {
    if (githubBillingConfigSaving) return;
    setGithubBillingConfigSaving(true);
    try {
      const res = await fetch(`${GITHUB_BILLING_MULTI_CONFIG_API}/${configKey}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: `配置 ${configKey} 删除成功`, type: 'success' });
      await fetchGithubBillingConfig();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setGithubBillingConfigSaving(false);
    }
  }, [githubBillingConfigSaving, fetchGithubBillingConfig, setNotification]);

  // 懒加载：仅在区块首次展开时拉取数据，避免页面初始化时多个 API 并发请求
  useEffect(() => {
    const lazyMap: Record<string, () => Promise<void> | void> = {
      envs: fetchEnvs,
      outemail: fetchOutemailSettings,
      modlist: fetchModlistSetting,
      tts: fetchTtsSetting,
      googleClientIds: fetchGoogleClientIds,
      shortaes: fetchShortAes,
      webhook: fetchWebhookSecret,
      providers: fetchProviders,
      ipfs: fetchIpfsConfig,
      turnstile: fetchTurnstileConfig,
      hcaptcha: fetchHcaptchaConfig,
      clarity: fetchClarityConfig,
      githubBilling: fetchGithubBillingConfig,
    };
    for (const key of expandedSections) {
      if (lazyMap[key] && !fetchedSectionsRef.current.has(key)) {
        fetchedSectionsRef.current.add(key);
        lazyMap[key]();
      }
    }
  }, [expandedSections, fetchEnvs, fetchOutemailSettings, fetchModlistSetting, fetchTtsSetting, fetchGoogleClientIds, fetchShortAes, fetchWebhookSecret, fetchProviders, fetchIpfsConfig, fetchTurnstileConfig, fetchHcaptchaConfig, fetchClarityConfig, fetchGithubBillingConfig]);

  // 使用公共方法处理数据来源点击
  const handleSourceClickWrapper = useCallback((source: string) => {
    handleSourceClick(source, setSelectedSource, setShowSourceModal);
  }, []);

  // 使用公共方法处理弹窗关闭
  const handleSourceModalCloseWrapper = useCallback(() => {
    handleSourceModalClose(setShowSourceModal);
  }, []);

  const isEnvSectionOpen = isSectionOpen('envs');
  const isEnvCollapsed = !isEnvSectionOpen;
  const isEnvLoading = loading || (isEnvSectionOpen && !fetchedSectionsRef.current.has('envs'));

  // 管理员校验
  if (!user || user.role !== 'admin') {
    return (
      <LazyMotion features={domAnimation}>
        <m.div className="env-manager-ui space-y-6">
          <style>{ENV_MANAGER_LIGHT_THEME_CSS}</style>
          <m.div
            className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100"
            initial={ENTER_INITIAL}
            animate={ENTER_ANIMATE}
            transition={trans06}
          >
            <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2">
              <FaLock className="text-2xl text-red-600" />
              访问被拒绝
            </h2>
            <div className="text-gray-600 space-y-2">
              <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
              <div className="text-sm text-red-500 italic">
                环境变量管理仅限管理员使用
              </div>
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
        {/* 标题和说明 */}
        <m.div
          className="env-manager-title-panel bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <h2 className="env-manager-title text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-3 flex items-center gap-2">
            <FaCog className="env-manager-title-icon text-xl sm:text-2xl text-blue-600" />
            环境变量管理
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

        {/* 环境变量表格 */}
        <m.section
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">环境变量列表</h3>
              <p className="mt-1 text-sm text-slate-500">查看系统环境变量配置，支持加密传输、自动解密和数据来源标记。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <m.button
                onClick={() => {
                  fetchedSectionsRef.current.add('envs');
                  fetchEnvs();
                }}
                disabled={isEnvLoading}
                className={ENV_MANAGER_REFRESH_BUTTON_CLASS}
                whileTap={{ scale: 0.95 }}
              >
                <FaSync className={`w-4 h-4 ${isEnvLoading ? 'animate-spin' : ''}`} />
                刷新
              </m.button>
              <m.button
                onClick={() => toggleSection('envs')}
                className={ENV_MANAGER_TOGGLE_BUTTON_CLASS}
                whileTap={{ scale: 0.95 }}
              >
                <m.span
                  animate={{ rotate: isEnvCollapsed ? -90 : 0 }}
                  transition={prefersReducedMotion ? NO_DURATION : { duration: 0.2 }}
                  className="inline-flex"
                >
                  <FaChevronDown className="w-4 h-4" />
                </m.span>
                {isEnvCollapsed ? '展开' : '收起'}
              </m.button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!isEnvCollapsed && (
              <m.div
                key="env-list-wrap"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25 }}
                className="space-y-4 px-5 py-5"
              >
                {/* 数据来源图例 */}
                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-blue-700">
                    <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <span className="font-medium leading-relaxed">带蓝色感叹号图标的变量表示有明确的数据来源信息</span>
                  </div>
                </div>

                {isEnvLoading ? (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-3 sm:mb-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
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
                          <m.div
                            key={item.key}
                            className={`rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm hover:shadow transition ${idx % 2 === 0 ? '' : ''}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: idx * 0.02 }}
                          >
                            <div className="flex items-start gap-2 sm:gap-3">
                              {item.source && (
                                <button
                                  onClick={() => handleSourceClickWrapper(item.source!)}
                                  className="flex-shrink-0 focus:outline-none self-center"
                                  aria-label="数据来源"
                                >
                                  <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                    <FaInfoCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  </span>
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm sm:text-base font-semibold text-gray-900 tracking-wide break-words">
                                  {item.key.split(':').pop() || item.key}
                                </div>
                                <div className="mt-2 px-2 sm:px-3 py-2 bg-gray-50 rounded-lg font-mono text-xs sm:text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                                  {item.value}
                                </div>
                              </div>
                            </div>
                          </m.div>
                        ))}
                      </div>
                    ) : (
                      <table className="min-w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[200px] w-1/3">变量名</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[300px] w-2/3">值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {envs.map((item, idx) => (
                            <EnvRow
                              key={item.key}
                              item={item}
                              idx={idx}
                              prefersReducedMotion={!!prefersReducedMotion}
                              onSourceClick={handleSourceClickWrapper}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* 统计信息 */}
                {!isEnvLoading && envs.length > 0 && (
                  <m.div
                    initial={ENTER_INITIAL}
                    animate={ENTER_ANIMATE}
                    transition={trans03}
                    className="mt-6 pt-4 border-t border-gray-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-semibold text-blue-700">
                            总计 {envs.length} 个环境变量
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs sm:text-sm font-medium text-green-700">
                            数据正常
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-lg">
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <span className="text-xs sm:text-sm text-gray-600">
                          最后更新: {new Date().toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </m.div>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </m.section>

        {/* 对外邮件 API 鉴权设置 */}
        <CollapsibleSection title="对外邮件 API 鉴权设置" description="管理外部应用调用对外邮件 API 的鉴权信息，支持默认域名和指定域名。" sectionKey="outemail" isOpen={isSectionOpen('outemail')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchOutemailSettings(); }} disabled={settingsLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${settingsLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">域名（可留空表示默认）</label>
              <input
                value={settingDomain}
                onChange={(e) => setSettingDomain(e.target.value)}
                placeholder="例如: chloemlla.com 或 留空"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">外部 API Key</label>
              <input
                value={settingApiKey}
                onChange={(e) => setSettingApiKey(e.target.value)}
                placeholder="推荐使用随机长令牌，请求头使用 Authorization: Bearer <API Key>"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">兼容校验码</label>
              <input
                value={settingCode}
                onChange={(e) => setSettingCode(e.target.value)}
                placeholder="旧调用方可继续在请求体传 code；新调用推荐使用外部 API Key"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <m.button
              onClick={handleSaveSetting}
              disabled={settingsSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {settingsSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">已配置鉴权</h4>
            {settingsLoading ? (
              <div className="text-gray-500 text-sm">加载中...</div>
            ) : outemailSettings.length === 0 ? (
              <div className="text-gray-500 text-sm">暂无配置</div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                {isMobile ? (
                  <div className="space-y-3 p-2">
                    {outemailSettings.map((s, i) => (
                      <m.div
                        key={(s.domain || '') + i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                        className="border rounded-lg p-3 bg-white"
                      >
                        <div className="text-sm text-gray-800">
                          <div className="font-semibold mb-1">{s.domain || <span className="text-gray-400">默认</span>}</div>
                          <div className="text-xs text-gray-500 mt-2">外部 API Key</div>
                          <div className="font-mono text-xs text-gray-700 break-all">{s.apiKey || '未配置'}</div>
                          <div className="text-xs text-gray-500 mt-2">兼容校验码</div>
                          <div className="font-mono text-xs text-gray-700 break-all">{s.code || '未配置'}</div>
                          <div className="text-xs text-gray-500 mt-1">{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}</div>
                        </div>
                        <div className="mt-2 text-right">
                          <m.button
                            onClick={() => handleDeleteSetting(s.domain || '')}
                            disabled={settingsDeletingDomain === (s.domain || '')}
                            className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                            whileTap={{ scale: 0.95 }}
                          >
                            {settingsDeletingDomain === (s.domain || '') ? '删除中...' : '删除'}
                          </m.button>
                        </div>
                      </m.div>
                    ))}
                  </div>
                ) : (
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">域名</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">外部 API Key（脱敏）</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">兼容校验码（脱敏）</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">更新时间</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outemailSettings.map((s, i) => (
                        <m.tr
                          key={(s.domain || '') + i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-4 py-3 text-sm text-gray-800">{s.domain || <span className="text-gray-400">默认</span>}</td>
                          <td className="px-4 py-3 font-mono text-sm text-gray-700">{s.apiKey || '未配置'}</td>
                          <td className="px-4 py-3 font-mono text-sm text-gray-700">{s.code || '未配置'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <m.button
                              onClick={() => handleDeleteSetting(s.domain || '')}
                              disabled={settingsDeletingDomain === (s.domain || '')}
                              className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              {settingsDeletingDomain === (s.domain || '') ? '删除中...' : '删除'}
                            </m.button>
                          </td>
                        </m.tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* MOD 列表修改码设置 */}
        <CollapsibleSection title="MOD 列表修改码设置" description="管理 MOD 列表修改码，用于保护列表编辑入口。" sectionKey="modlist" isOpen={isSectionOpen('modlist')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchModlistSetting(); }} disabled={modLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${modLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">修改码</label>
              <input
                value={modCodeInput}
                onChange={(e) => setModCodeInput(e.target.value)}
                placeholder="请输入修改码（仅用于校验，不会回显明文）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                {modLoading ? '加载中...' : (modSetting?.code || '未设置')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={handleDeleteModCode}
              disabled={modDeleting}
              className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {modDeleting ? '删除中...' : '删除'}
            </m.button>
            <m.button
              onClick={handleSaveModCode}
              disabled={modSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {modSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            最后更新时间：{modSetting?.updatedAt ? new Date(modSetting.updatedAt).toLocaleString() : '-'}
          </div>
        </CollapsibleSection>

        {/* TTS 生成码设置 */}
        <CollapsibleSection title="TTS 生成码设置" description="管理 TTS 生成码，用于限制语音生成入口。" sectionKey="tts" isOpen={isSectionOpen('tts')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchTtsSetting(); }} disabled={ttsLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${ttsLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">生成码</label>
              <input
                value={ttsCodeInput}
                onChange={(e) => setTtsCodeInput(e.target.value)}
                placeholder="请输入生成码（仅用于校验，不会回显明文）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                {ttsLoading ? '加载中...' : (ttsSetting?.code || '未设置')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={handleDeleteTtsCode}
              disabled={ttsDeleting}
              className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ttsDeleting ? '删除中...' : '删除'}
            </m.button>
            <m.button
              onClick={handleSaveTtsCode}
              disabled={ttsSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ttsSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            最后更新时间：{ttsSetting?.updatedAt ? new Date(ttsSetting.updatedAt).toLocaleString() : '-'}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Google / NexAI Client ID 环境变量"
          description="直接配置 GOOGLE_CLIENT_ID 与 NEXAI_GOOGLE_CLIENT_ID。保存后写入运行时配置并立即生效；进程环境 / .env 同名变量仅作启动默认值。"
          sectionKey="googleClientIds"
          isOpen={isSectionOpen('googleClientIds')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          headerRight={
            <m.button
              onClick={(e) => {
                e.stopPropagation();
                fetchGoogleClientIds();
              }}
              disabled={googleClientIdsLoading}
              className={ENV_MANAGER_REFRESH_BUTTON_CLASS}
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${googleClientIdsLoading ? 'animate-spin' : ''}`} /> 刷新
            </m.button>
          }
        >
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-900">
            <p>
              <code className="rounded bg-white/80 px-1">GOOGLE_CLIENT_ID</code>
              ：主站 Google Identity Services（GSI）Web Client ID。
            </p>
            <p className="mt-1">
              <code className="rounded bg-white/80 px-1">NEXAI_GOOGLE_CLIENT_ID</code>
              ：NexAI Google 登录 Client ID；未配置时可回退主站 ID。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">GOOGLE_CLIENT_ID</label>
              <input
                value={googleClientIdInput}
                onChange={(e) => setGoogleClientIdInput(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:text-base"
              />
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                当前生效：
                {googleClientIdsLoading
                  ? '加载中...'
                  : googleClientIdCurrent || '未设置'}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">NEXAI_GOOGLE_CLIENT_ID</label>
              <input
                value={nexaiGoogleClientIdInput}
                onChange={(e) => setNexaiGoogleClientIdInput(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:text-base"
              />
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                当前生效：
                {googleClientIdsLoading
                  ? '加载中...'
                  : nexaiGoogleClientIdCurrent || '未设置（可回退 GOOGLE_CLIENT_ID）'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={handleDeleteGoogleClientIds}
              disabled={googleClientIdsDeleting || googleClientIdsSaving}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50 sm:px-4"
              whileTap={{ scale: 0.96 }}
            >
              {googleClientIdsDeleting ? '重置中...' : '重置'}
            </m.button>
            <m.button
              onClick={handleSaveGoogleClientIds}
              disabled={googleClientIdsSaving || googleClientIdsDeleting}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:px-4"
              whileTap={{ scale: 0.96 }}
            >
              {googleClientIdsSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-1 text-xs text-gray-500">
            最后更新时间：
            {googleClientIdsUpdatedAt ? new Date(googleClientIdsUpdatedAt).toLocaleString() : '-'}
          </div>
        </CollapsibleSection>

        <RuntimeConfigSections />

        {/* 短链 AES_KEY 设置 */}
        <CollapsibleSection title="短链 AES_KEY 设置" description="管理短链 AES_KEY，用于短链数据加密解密。" sectionKey="shortaes" isOpen={isSectionOpen('shortaes')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchShortAes(); }} disabled={shortAesLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${shortAesLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">AES_KEY</label>
              <input
                value={shortAesInput}
                onChange={(e) => setShortAesInput(e.target.value)}
                placeholder="请输入 AES_KEY（仅用于加解密，不会回显明文）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                {shortAesLoading ? '加载中...' : (shortAesSetting?.aesKey ?? '未设置')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={handleDeleteShortAes}
              disabled={shortAesDeleting}
              className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {shortAesDeleting ? '删除中...' : '删除'}
            </m.button>
            <m.button
              onClick={handleSaveShortAes}
              disabled={shortAesSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {shortAesSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            最后更新时间：{shortAesSetting?.updatedAt ? new Date(shortAesSetting.updatedAt).toLocaleString() : '-'}
          </div>
        </CollapsibleSection>

        {/* Webhook 密钥设置（支持自定义 key，默认 DEFAULT） */}
        <CollapsibleSection title="Webhook 密钥设置" description="管理 Webhook 路由密钥和签名密钥。" sectionKey="webhook" isOpen={isSectionOpen('webhook')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchWebhookSecret(); }} disabled={webhookLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${webhookLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route Key（可选，默认 DEFAULT）</label>
              <input
                value={webhookKeyInput}
                onChange={(e) => setWebhookKeyInput(e.target.value)}
                placeholder="例如：ORDER、PAY 等，留空为 DEFAULT"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">密钥 Secret</label>
              <input
                value={webhookSecretInput}
                onChange={(e) => setWebhookSecretInput(e.target.value)}
                placeholder="请输入 Webhook 密钥（支持 Base64 或明文，不回显明文）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">当前 Key</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                {webhookLoading ? '加载中...' : (webhookSetting?.key || 'DEFAULT')}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">当前密钥（脱敏）</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                {webhookLoading ? '加载中...' : (webhookSetting?.secret ?? '未设置')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={handleDeleteWebhookSecret}
              disabled={webhookDeleting}
              className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {webhookDeleting ? '删除中...' : '删除'}
            </m.button>
            <m.button
              onClick={handleSaveWebhookSecret}
              disabled={webhookSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {webhookSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            最后更新时间：{webhookSetting?.updatedAt ? new Date(webhookSetting.updatedAt).toLocaleString() : '-'}
          </div>
        </CollapsibleSection>

        {/* IPFS 配置设置 */}
        <CollapsibleSection title="IPFS 配置设置" description="管理 IPFS 上传、User-Agent 和图片床默认参数。" sectionKey="ipfs" isOpen={isSectionOpen('ipfs')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchIpfsConfig(); }} disabled={ipfsConfigLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${ipfsConfigLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">IPFS上传URL</label>
              <input
                value={ipfsUploadUrlInput}
                onChange={(e) => setIpfsUploadUrlInput(e.target.value)}
                placeholder="例如：https://ipfs.openai.com/api/v0/add"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                {ipfsConfigLoading ? '加载中...' : (ipfsConfig?.ipfsUploadUrl || '未设置')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">IPFS User-Agent</label>
              <input
                value={ipfsUserAgentInput}
                onChange={(e) => setIpfsUserAgentInput(e.target.value)}
                placeholder="例如：Synapse-IPFS-Uploader/1.0 (+https://example.com)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前User-Agent</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                {ipfsConfigLoading ? '加载中...' : (ipfsConfig?.ipfsUa || '未设置')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <m.button
              onClick={() => handleTestIpfsConfig('imagebed')}
              disabled={ipfsConfigTesting}
              className="px-3 sm:px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ipfsConfigTesting ? '测试中...' : '测试 ImageBed'}
            </m.button>
            <m.button
              onClick={() => handleTestIpfsConfig('ipfs')}
              disabled={ipfsConfigTesting || !ipfsConfig?.ipfsUploadUrl}
              className="px-3 sm:px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ipfsConfigTesting ? '测试中...' : '测试 IPFS'}
            </m.button>
            <m.button
              onClick={handleSaveIpfsConfig}
              disabled={ipfsConfigSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ipfsConfigSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          {/* ImageBed (scdn.io v1.php) 配置 */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h4 className="text-md font-semibold text-gray-700 mb-3">ImageBed (scdn.io v1.php) 默认配置</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ImageBed API URL</label>
                <input
                  value={imageBedApiUrlInput}
                  onChange={(e) => setImageBedApiUrlInput(e.target.value)}
                  placeholder="默认：https://img.scdn.io/api/v1.php"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前 API</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                  {ipfsConfigLoading ? '加载中...' : (ipfsConfig?.imageBedApiUrl || '未设置')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认 CDN 域名</label>
                <input
                  value={imageBedCdnDomainInput}
                  onChange={(e) => setImageBedCdnDomainInput(e.target.value)}
                  placeholder="例如：img.scdn.io"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
                <div className="mt-1 text-xs text-gray-500 break-all">当前：{ipfsConfig?.imageBedCdnDomain || '未设置'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认存储位置</label>
                <select
                  value={imageBedStorageDestinationInput}
                  onChange={(e) => setImageBedStorageDestinationInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base bg-white"
                >
                  <option value="">不变更</option>
                  <option value="local">local（默认）</option>
                  <option value="telegram">telegram</option>
                  <option value="r2">r2（Cloudflare R2）</option>
                </select>
                <div className="mt-1 text-xs text-gray-500">当前：{ipfsConfig?.imageBedStorageDestination || '未设置'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">默认输出格式</label>
                <select
                  value={imageBedOutputFormatInput}
                  onChange={(e) => setImageBedOutputFormatInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base bg-white"
                >
                  <option value="">不变更</option>
                  <option value="auto">auto（自动）</option>
                  <option value="webp">webp</option>
                  <option value="webp_animated">webp_animated</option>
                  <option value="jpg">jpg</option>
                  <option value="jpeg">jpeg</option>
                  <option value="png">png</option>
                  <option value="gif">gif</option>
                </select>
                <div className="mt-1 text-xs text-gray-500">当前：{ipfsConfig?.imageBedOutputFormat || '未设置'}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            说明：图片类上传（jpg/png/webp/gif/bmp/tiff）走 ImageBed (scdn.io v1.php) API；SVG 与归档等非图片文件仍走旧 IPFS。可在此设置 ImageBed 默认 API、CDN、存储位置与输出格式。
          </div>
        </CollapsibleSection>

        {/* Turnstile 配置设置 */}
        <CollapsibleSection title="Turnstile 配置设置" description="管理 Cloudflare Turnstile Site Key 和 Secret Key。" sectionKey="turnstile" isOpen={isSectionOpen('turnstile')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchTurnstileConfig(); }} disabled={turnstileConfigLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${turnstileConfigLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          {/* Site Key 配置 */}
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Site Key 配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Key</label>
                <input
                  value={turnstileSiteKeyInput}
                  onChange={(e) => setTurnstileSiteKeyInput(e.target.value)}
                  placeholder="请输入 Turnstile Site Key（例如：0x4AAAAAAABkMYinukE5NHzg）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                  {turnstileConfigLoading ? '加载中...' : (turnstileConfig?.siteKey || '未设置')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={() => handleDeleteTurnstileConfig('TURNSTILE_SITE_KEY')}
                disabled={turnstileConfigDeleting}
                className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {turnstileConfigDeleting ? '删除中...' : '删除'}
              </m.button>
              <m.button
                onClick={() => handleSaveTurnstileConfig('TURNSTILE_SITE_KEY')}
                disabled={turnstileConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {turnstileConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* Secret Key 配置 */}
          <div className="mb-4">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Secret Key 配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                <input
                  value={turnstileSecretKeyInput}
                  onChange={(e) => setTurnstileSecretKeyInput(e.target.value)}
                  placeholder="请输入 Turnstile Secret Key（仅用于后端验证，不回显明文）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                  {turnstileConfigLoading ? '加载中...' : (turnstileConfig?.secretKey || '未设置')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={() => handleDeleteTurnstileConfig('TURNSTILE_SECRET_KEY')}
                disabled={turnstileConfigDeleting}
                className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {turnstileConfigDeleting ? '删除中...' : '删除'}
              </m.button>
              <m.button
                onClick={() => handleSaveTurnstileConfig('TURNSTILE_SECRET_KEY')}
                disabled={turnstileConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {turnstileConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* 状态信息 */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <div className={`w-2 h-2 rounded-full ${turnstileConfig?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                Turnstile 状态：{turnstileConfig?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              说明：Turnstile 用于人机验证，支持动态配置。Site Key 用于前端显示，Secret Key 用于后端验证。
            </div>
          </div>
        </CollapsibleSection>

        {/* hCaptcha 配置设置 */}
        <CollapsibleSection title="hCaptcha 配置设置" description="管理 hCaptcha Site Key 和 Secret Key。" sectionKey="hcaptcha" isOpen={isSectionOpen('hcaptcha')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchHcaptchaConfig(); }} disabled={hcaptchaConfigLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${hcaptchaConfigLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          {/* Site Key 配置 */}
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Site Key 配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Key</label>
                <input
                  value={hcaptchaSiteKeyInput}
                  onChange={(e) => setHcaptchaSiteKeyInput(e.target.value)}
                  placeholder="请输入 hCaptcha Site Key（例如：10000000-ffff-ffff-ffff-000000000001）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                  {hcaptchaConfigLoading ? '加载中...' : (hcaptchaConfig?.siteKey || '未设置')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={() => handleDeleteHcaptchaConfig('HCAPTCHA_SITE_KEY')}
                disabled={hcaptchaConfigDeleting}
                className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {hcaptchaConfigDeleting ? '删除中...' : '删除'}
              </m.button>
              <m.button
                onClick={() => handleSaveHcaptchaConfig('HCAPTCHA_SITE_KEY')}
                disabled={hcaptchaConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {hcaptchaConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* Secret Key 配置 */}
          <div className="mb-4">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Secret Key 配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                <input
                  value={hcaptchaSecretKeyInput}
                  onChange={(e) => setHcaptchaSecretKeyInput(e.target.value)}
                  placeholder="请输入 hCaptcha Secret Key（仅用于后端验证，不回显明文）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前配置（脱敏）</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
                  {hcaptchaConfigLoading ? '加载中...' : (hcaptchaConfig?.secretKey || '未设置')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={() => handleDeleteHcaptchaConfig('HCAPTCHA_SECRET_KEY')}
                disabled={hcaptchaConfigDeleting}
                className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {hcaptchaConfigDeleting ? '删除中...' : '删除'}
              </m.button>
              <m.button
                onClick={() => handleSaveHcaptchaConfig('HCAPTCHA_SECRET_KEY')}
                disabled={hcaptchaConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {hcaptchaConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* 状态信息 */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <div className={`w-2 h-2 rounded-full ${hcaptchaConfig?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                hCaptcha 状态：{hcaptchaConfig?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="mt-2 text-xs text-green-600">
              说明：hCaptcha 用于人机验证，支持动态配置。Site Key 用于前端显示，Secret Key 用于后端验证。
            </div>
          </div>
        </CollapsibleSection>

        {/* Clarity 配置设置 */}
        <CollapsibleSection title="Microsoft Clarity 配置设置" description="管理 Microsoft Clarity Project ID 和启用状态。" sectionKey="clarity" isOpen={isSectionOpen('clarity')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchClarityConfig(); }} disabled={clarityConfigLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${clarityConfigLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          {/* Project ID 配置 */}
          <div className="mb-4">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Project ID 配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project ID
                  <span className="ml-2 text-xs text-gray-500">(10位小写字母数字组合)</span>
                </label>
                <input
                  value={clarityProjectIdInput}
                  onChange={(e) => setClarityProjectIdInput(e.target.value.toLowerCase())}
                  placeholder="例如：t1dkcavsyz（10位小写字母数字）"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base font-mono"
                />
                <div className="mt-1 text-xs text-gray-500">
                  提示：自动转换为小写，仅支持字母和数字，长度必须为10位
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center font-mono">
                  {clarityConfigLoading ? '加载中...' : (clarityConfig?.projectId || '未设置')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={handleDeleteClarityConfig}
                disabled={clarityConfigDeleting}
                className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {clarityConfigDeleting ? '删除中...' : '删除'}
              </m.button>
              <m.button
                onClick={handleSaveClarityConfig}
                disabled={clarityConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {clarityConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* 状态信息 */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <div className={`w-2 h-2 rounded-full ${clarityConfig?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                Microsoft Clarity 状态：{clarityConfig?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="mt-2 text-xs text-blue-600 space-y-1">
              <div>
                <strong>说明：</strong>Microsoft Clarity 用于用户行为分析和网站性能监控。
              </div>
              <div>
                <strong>Project ID 格式：</strong>必须为10位小写字母数字组合（如：t1dkcavsyz）
              </div>
              <div>
                <strong>获取方式：</strong>登录 <a href="https://clarity.microsoft.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-800">clarity.microsoft.com</a> 创建项目后获取
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* GitHub Billing 配置设置 */}
        <CollapsibleSection title="GitHub Billing 配置设置" description="管理 GitHub Billing curl 配置和账单数据读取参数。" sectionKey="githubBilling" isOpen={isSectionOpen('githubBilling')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchGithubBillingConfig(); }} disabled={githubBillingConfigLoading} className={ENV_MANAGER_REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${githubBillingConfigLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          {/* Curl 命令配置 */}
          <div className="mb-4">
            <h4 className="text-md font-semibold text-gray-700 mb-3">Curl 命令配置</h4>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GitHub Billing Curl 命令</label>
                <textarea
                  value={githubBillingCurlInput}
                  onChange={(e) => setGithubBillingCurlInput(e.target.value)}
                  placeholder="请粘贴从浏览器开发者工具复制的 GitHub Billing curl 命令..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base min-h-[120px] font-mono"
                  rows={6}
                />
                <div className="mt-1 text-xs text-gray-500">
                  提示：从浏览器开发者工具的网络标签页中复制 GitHub Billing 相关的 curl 命令
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <m.button
                onClick={handleSaveGithubBillingConfig}
                disabled={githubBillingConfigSaving}
                className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                whileTap={{ scale: 0.96 }}
              >
                {githubBillingConfigSaving ? '保存中...' : '保存/更新'}
              </m.button>
            </div>
          </div>

          {/* 当前配置状态 */}
          {multiGithubBillingConfig && multiGithubBillingConfig[selectedConfigKey] && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">当前配置信息 ({selectedConfigKey})</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium text-gray-600">URL:</span>
                  <span className="ml-2 text-gray-800 break-all">{multiGithubBillingConfig[selectedConfigKey]?.url || '未设置'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">方法:</span>
                  <span className="ml-2 text-gray-800">{multiGithubBillingConfig[selectedConfigKey]?.method || '未设置'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Customer ID:</span>
                  <span className="ml-2 text-gray-800">{multiGithubBillingConfig[selectedConfigKey]?.customerId || '未设置'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Headers:</span>
                  <span className="ml-2 text-gray-800">{multiGithubBillingConfig[selectedConfigKey]?.headersCount || 0} 个</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Cookies:</span>
                  <span className="ml-2 text-gray-800">{multiGithubBillingConfig[selectedConfigKey]?.hasCookies ? '已配置' : '未配置'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">更新时间:</span>
                  <span className="ml-2 text-gray-800">
                    {multiGithubBillingConfig[selectedConfigKey]?.updatedAt ? new Date(multiGithubBillingConfig[selectedConfigKey]!.updatedAt!).toLocaleString() : '未知'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 状态信息 */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <div className={`w-2 h-2 rounded-full ${multiGithubBillingConfig && multiGithubBillingConfig[selectedConfigKey] ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                GitHub Billing 状态：{multiGithubBillingConfig && multiGithubBillingConfig[selectedConfigKey] ? '已配置' : '未配置'}
              </span>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              说明：GitHub Billing 配置用于获取 GitHub 账单使用情况数据。需要从浏览器开发者工具复制有效的 curl 命令。
            </div>
          </div>
        </CollapsibleSection>

        {/* LibreChat 提供者配置（多组BASE_URL/API_KEY/MODEL） */}
        <CollapsibleSection title="LibreChat 提供者配置" description="管理 LibreChat 多提供者 Base URL、API Key、模型和权重。" sectionKey="providers" isOpen={isSectionOpen('providers')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              value={providerFilterGroup}
              onChange={(e) => setProviderFilterGroup(e.target.value)}
              placeholder="按 group 过滤"
              className="w-full sm:w-auto px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
            />
            <m.button
              onClick={fetchProviders}
              disabled={providersLoading}
              className={`${ENV_MANAGER_REFRESH_BUTTON_CLASS} w-full justify-center sm:w-auto`}
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${providersLoading ? 'animate-spin' : ''}`} /> 刷新
            </m.button>
          </div>
        }>
          {/* 表单 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
              <input
                value={providerBaseUrl}
                onChange={(e) => setProviderBaseUrl(e.target.value)}
                placeholder="https://your-openai-compatible.example"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                value={providerApiKey}
                onChange={(e) => setProviderApiKey(e.target.value)}
                placeholder="re_xxx 或 sk-xxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <input
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
                placeholder="gpt-4o-mini / gpt-oss-120b 等"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group（可选）</label>
              <input
                value={providerGroup}
                onChange={(e) => setProviderGroup(e.target.value)}
                placeholder="自定义分组名，用于归类"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">启用</label>
              <input
                type="checkbox"
                checked={providerEnabled}
                onChange={(e) => setProviderEnabled(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">权重（1-10）</label>
              <input
                type="number"
                value={providerWeight}
                onChange={(e) => setProviderWeight(Math.max(1, Math.min(10, Number(e.target.value || 1))))}
                min={1}
                max={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mb-4">
            <m.button
              onClick={resetProviderForm}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              重置
            </m.button>
            <m.button
              onClick={handleSaveProvider}
              disabled={providerSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {providerSaving ? '保存中...' : (providerId ? '更新' : '新增')}
            </m.button>
          </div>

          {/* 列表 */}
          {providersLoading ? (
            <div className="text-gray-500 text-sm">加载中...</div>
          ) : providers.length === 0 ? (
            <div className="text-gray-500 text-sm">暂无提供者</div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              {isMobile ? (
                <div className="space-y-3 p-2">
                  {providers.map((p, i) => (
                    <m.div
                      key={p.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                      className="border rounded-lg p-3 bg-white"
                    >
                      <div className="text-sm text-gray-800 break-all">
                        <div className="font-semibold">{p.baseUrl}</div>
                        <div className="mt-1">Model：{p.model}</div>
                        <div className="mt-1">Group：{p.group || '-'}</div>
                        <div className="mt-1">Enabled：{p.enabled ? '是' : '否'}｜Weight：{p.weight}</div>
                        <div className="mt-1 font-mono text-xs text-gray-700">{p.apiKey}</div>
                        <div className="mt-1 text-xs text-gray-500">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '-'}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <m.button
                          onClick={() => handleEditProvider(p)}
                          className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                          whileTap={{ scale: 0.95 }}
                        >
                          编辑
                        </m.button>
                        <m.button
                          onClick={() => handleDeleteProvider(p.id)}
                          disabled={providerDeletingId === p.id}
                          className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                          whileTap={{ scale: 0.95 }}
                        >
                          {providerDeletingId === p.id ? '删除中...' : '删除'}
                        </m.button>
                      </div>
                    </m.div>
                  ))}
                </div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Base URL</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Model</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Group</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Enabled</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Weight</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">API Key（脱敏）</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Updated</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p, i) => (
                      <m.tr
                        key={p.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-4 py-3 text-sm text-gray-800 break-all">{p.baseUrl}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{p.model}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{p.group || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{p.enabled ? '是' : '否'}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{p.weight}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{p.apiKey}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <m.button
                              onClick={() => handleEditProvider(p)}
                              className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              编辑
                            </m.button>
                            <m.button
                              onClick={() => handleDeleteProvider(p.id)}
                              disabled={providerDeletingId === p.id}
                              className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              {providerDeletingId === p.id ? '删除中...' : '删除'}
                            </m.button>
                          </div>
                        </td>
                      </m.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* 数据来源弹窗（相对于当前屏幕居中） */}
        <AnimatePresence>
          {showSourceModal && (
            <m.div
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[9999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={modalTrans}
              onClick={handleSourceModalCloseWrapper}
              data-source-modal
            >
              <m.div
                className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 w-full max-w-md mx-4 relative z-[10000] border border-gray-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={modalTrans}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaInfoCircle className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">数据来源</h3>
                  <p className="text-gray-600 mb-6">{selectedSource}</p>
                  <button
                    onClick={handleSourceModalCloseWrapper}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    确定
                  </button>
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
