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
  GOOGLE_AUTH_API,
  GOOGLE_WEB_CLIENT_ID_PATTERN,
  HCAPTCHA_CONFIG_API,
  IPFS_CONFIG_API,
  LIBRECHAT_PROVIDERS_API,
  MODLIST_API,
  NEXAI_SETTING_API,
  OUTEMAIL_API,
  SHORTURL_AES_API,
  SYNAPSE_ANDROID_API,
  TTS_API,
  TURNSTILE_CONFIG_API,
  WEBHOOK_SECRET_API,
  getAuthHeaders
} from './env-manager/api';
import EnvRow from './env-manager/EnvRow';
import SynapseAndroidConfigSection from './env-manager/SynapseAndroidConfigSection';
import GoogleClientIdsSection from './env-manager/GoogleClientIdsSection';
import CodeSettingSection from './env-manager/CodeSettingSection';
import OutemailSettingsSection from './env-manager/OutemailSettingsSection';
import SecretKeySection from './env-manager/SecretKeySection';
import IpfsConfigSection from './env-manager/IpfsConfigSection';
import TurnstileConfigSection from './env-manager/TurnstileConfigSection';
import HcaptchaConfigSection from './env-manager/HcaptchaConfigSection';
import ClarityConfigSection from './env-manager/ClarityConfigSection';
import GithubBillingConfigSection from './env-manager/GithubBillingConfigSection';
import LibreChatProvidersSection from './env-manager/LibreChatProvidersSection';
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
import { getAuthToken } from '../utils/authSession';
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
  // Synapse Android / Digital Asset Links (runtime config)
  const [synapseAndroidLoading, setSynapseAndroidLoading] = useState(false);
  const [synapseAndroidSaving, setSynapseAndroidSaving] = useState(false);
  const [synapseAndroidDeleting, setSynapseAndroidDeleting] = useState(false);
  const [synapseAndroidPackageInput, setSynapseAndroidPackageInput] = useState('com.synapse.mobile');
  const [synapseAndroidFingerprintsInput, setSynapseAndroidFingerprintsInput] = useState('');
  const [synapseAndroidGoogleClientIdInput, setSynapseAndroidGoogleClientIdInput] = useState('');
  const [synapseAndroidDisabled, setSynapseAndroidDisabled] = useState(false);
  const [synapseAndroidCurrentPackage, setSynapseAndroidCurrentPackage] = useState('');
  const [synapseAndroidCurrentFingerprints, setSynapseAndroidCurrentFingerprints] = useState<string[]>([]);
  const [synapseAndroidCurrentGoogleClientId, setSynapseAndroidCurrentGoogleClientId] = useState('');
  const [synapseAndroidUpdatedAt, setSynapseAndroidUpdatedAt] = useState<string | undefined>(undefined);


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
            const token = getAuthToken();
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

  const fetchSynapseAndroidSetting = useCallback(async () => {
    setSynapseAndroidLoading(true);
    try {
      const res = await fetch(SYNAPSE_ANDROID_API, { headers: { ...getAuthHeaders() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '获取 Synapse Android / assetlinks 配置失败', type: 'error' });
        return;
      }
      const cfg = data?.setting?.config || {};
      const packageName = String(cfg.packageName || 'com.synapse.mobile').trim() || 'com.synapse.mobile';
      const fingerprints = Array.isArray(cfg.sha256CertFingerprints)
        ? cfg.sha256CertFingerprints.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [];
      const googleClientId = String(cfg.googleClientId || '').trim();
      const disabled = cfg.disabled === true;
      setSynapseAndroidPackageInput(packageName);
      setSynapseAndroidFingerprintsInput(fingerprints.join('\n'));
      setSynapseAndroidGoogleClientIdInput(googleClientId);
      setSynapseAndroidDisabled(disabled);
      setSynapseAndroidCurrentPackage(packageName);
      setSynapseAndroidCurrentFingerprints(fingerprints);
      setSynapseAndroidCurrentGoogleClientId(googleClientId);
      setSynapseAndroidUpdatedAt(data?.setting?.updatedAt);
    } catch (e) {
      setNotification({
        message: '获取 Synapse Android / assetlinks 配置失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setSynapseAndroidLoading(false);
    }
  }, [setNotification]);

  const handleSaveSynapseAndroidSetting = useCallback(async () => {
    if (synapseAndroidSaving) return;
    const packageName = synapseAndroidPackageInput.trim() || 'com.synapse.mobile';
    const fingerprints = synapseAndroidFingerprintsInput
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const googleClientId = synapseAndroidGoogleClientIdInput.trim();

    if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
      setNotification({ message: 'ANDROID_PACKAGE_NAME 格式无效', type: 'error' });
      return;
    }
    if (fingerprints.length === 0) {
      setNotification({ message: '至少填写一个 SHA-256 证书指纹', type: 'error' });
      return;
    }
    if (googleClientId && !GOOGLE_WEB_CLIENT_ID_PATTERN.test(googleClientId)) {
      setNotification({
        message: 'SYNAPSE_ANDROID_GOOGLE_CLIENT_ID 格式无效，需为 xxx.apps.googleusercontent.com',
        type: 'error',
      });
      return;
    }

    setSynapseAndroidSaving(true);
    try {
      const res = await fetch(SYNAPSE_ANDROID_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          packageName,
          sha256CertFingerprints: fingerprints,
          googleClientId,
          disabled: synapseAndroidDisabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '保存 Synapse Android / assetlinks 配置失败', type: 'error' });
        return;
      }
      setNotification({
        message: 'Synapse Android / assetlinks 配置已保存；/.well-known/assetlinks.json 立即生效',
        type: 'success',
      });
      await fetchSynapseAndroidSetting();
    } catch (e) {
      setNotification({
        message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setSynapseAndroidSaving(false);
    }
  }, [
    fetchSynapseAndroidSetting,
    setNotification,
    synapseAndroidDisabled,
    synapseAndroidFingerprintsInput,
    synapseAndroidGoogleClientIdInput,
    synapseAndroidPackageInput,
    synapseAndroidSaving,
  ]);

  const handleDeleteSynapseAndroidSetting = useCallback(async () => {
    if (synapseAndroidDeleting) return;
    setSynapseAndroidDeleting(true);
    try {
      const res = await fetch(SYNAPSE_ANDROID_API, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotification({ message: data.error || '重置 Synapse Android / assetlinks 配置失败', type: 'error' });
        return;
      }
      setNotification({ message: '已重置为默认 Synapse Android / assetlinks 配置', type: 'success' });
      await fetchSynapseAndroidSetting();
    } catch (e) {
      setNotification({
        message: '重置失败：' + (e instanceof Error ? e.message : '未知错误'),
        type: 'error',
      });
    } finally {
      setSynapseAndroidDeleting(false);
    }
  }, [fetchSynapseAndroidSetting, setNotification, synapseAndroidDeleting]);


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
      synapseAndroid: fetchSynapseAndroidSetting,
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
  }, [expandedSections, fetchEnvs, fetchOutemailSettings, fetchModlistSetting, fetchTtsSetting, fetchGoogleClientIds, fetchSynapseAndroidSetting, fetchShortAes, fetchWebhookSecret, fetchProviders, fetchIpfsConfig, fetchTurnstileConfig, fetchHcaptchaConfig, fetchClarityConfig, fetchGithubBillingConfig]);

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

        <OutemailSettingsSection
          isOpen={isSectionOpen('outemail')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={settingsLoading}
          saving={settingsSaving}
          deletingDomain={settingsDeletingDomain}
          domain={settingDomain}
          code={settingCode}
          apiKey={settingApiKey}
          settings={outemailSettings}
          onDomainChange={setSettingDomain}
          onCodeChange={setSettingCode}
          onApiKeyChange={setSettingApiKey}
          onRefresh={fetchOutemailSettings}
          onSave={handleSaveSetting}
          onDelete={handleDeleteSetting}
        />

        {/* MOD 列表修改码设置 */}
        <CodeSettingSection
          title="MOD 列表修改码设置"
          description="管理 MOD 列表修改码，用于保护列表编辑入口。"
          sectionKey="modlist"
          isOpen={isSectionOpen('modlist')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={modLoading}
          saving={modSaving}
          deleting={modDeleting}
          inputLabel="修改码"
          inputValue={modCodeInput}
          inputPlaceholder="请输入修改码（仅用于校验，不会回显明文）"
          currentValue={modSetting?.code}
          updatedAt={modSetting?.updatedAt}
          onInputChange={setModCodeInput}
          onRefresh={fetchModlistSetting}
          onSave={handleSaveModCode}
          onDelete={handleDeleteModCode}
        />

        {/* TTS 生成码设置 */}
        <CodeSettingSection
          title="TTS 生成码设置"
          description="管理 TTS 生成码，用于限制语音生成入口。"
          sectionKey="tts"
          isOpen={isSectionOpen('tts')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={ttsLoading}
          saving={ttsSaving}
          deleting={ttsDeleting}
          inputLabel="生成码"
          inputValue={ttsCodeInput}
          inputPlaceholder="请输入生成码（仅用于校验，不会回显明文）"
          currentValue={ttsSetting?.code}
          updatedAt={ttsSetting?.updatedAt}
          onInputChange={setTtsCodeInput}
          onRefresh={fetchTtsSetting}
          onSave={handleSaveTtsCode}
          onDelete={handleDeleteTtsCode}
        />

        <GoogleClientIdsSection
          isOpen={isSectionOpen('googleClientIds')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={googleClientIdsLoading}
          saving={googleClientIdsSaving}
          deleting={googleClientIdsDeleting}
          googleClientIdInput={googleClientIdInput}
          nexaiGoogleClientIdInput={nexaiGoogleClientIdInput}
          googleClientIdCurrent={googleClientIdCurrent}
          nexaiGoogleClientIdCurrent={nexaiGoogleClientIdCurrent}
          updatedAt={googleClientIdsUpdatedAt}
          onGoogleClientIdInputChange={setGoogleClientIdInput}
          onNexaiGoogleClientIdInputChange={setNexaiGoogleClientIdInput}
          onRefresh={fetchGoogleClientIds}
          onSave={handleSaveGoogleClientIds}
          onReset={handleDeleteGoogleClientIds}
        />

        <SynapseAndroidConfigSection
          isOpen={isSectionOpen('synapseAndroid')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={synapseAndroidLoading}
          saving={synapseAndroidSaving}
          deleting={synapseAndroidDeleting}
          packageInput={synapseAndroidPackageInput}
          fingerprintsInput={synapseAndroidFingerprintsInput}
          googleClientIdInput={synapseAndroidGoogleClientIdInput}
          disabled={synapseAndroidDisabled}
          currentPackage={synapseAndroidCurrentPackage}
          currentFingerprints={synapseAndroidCurrentFingerprints}
          currentGoogleClientId={synapseAndroidCurrentGoogleClientId}
          updatedAt={synapseAndroidUpdatedAt}
          onPackageInputChange={setSynapseAndroidPackageInput}
          onFingerprintsInputChange={setSynapseAndroidFingerprintsInput}
          onGoogleClientIdInputChange={setSynapseAndroidGoogleClientIdInput}
          onDisabledChange={setSynapseAndroidDisabled}
          onRefresh={fetchSynapseAndroidSetting}
          onSave={handleSaveSynapseAndroidSetting}
          onReset={handleDeleteSynapseAndroidSetting}
        />

        <RuntimeConfigSections />

        <SecretKeySection
          title="短链 AES_KEY 设置"
          description="管理短链 AES_KEY，用于短链数据加密解密。"
          sectionKey="shortaes"
          isOpen={isSectionOpen('shortaes')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={shortAesLoading}
          saving={shortAesSaving}
          deleting={shortAesDeleting}
          inputLabel="AES_KEY"
          inputValue={shortAesInput}
          inputPlaceholder="请输入 AES_KEY（仅用于加解密，不会回显明文）"
          currentValue={shortAesSetting?.aesKey ?? undefined}
          updatedAt={shortAesSetting?.updatedAt}
          onInputChange={setShortAesInput}
          onRefresh={fetchShortAes}
          onSave={handleSaveShortAes}
          onDelete={handleDeleteShortAes}
        />

        <SecretKeySection
          title="Webhook 密钥设置"
          description="管理 Webhook 路由密钥和签名密钥。"
          sectionKey="webhook"
          isOpen={isSectionOpen('webhook')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={webhookLoading}
          saving={webhookSaving}
          deleting={webhookDeleting}
          inputLabel="密钥 Secret"
          inputValue={webhookSecretInput}
          inputPlaceholder="请输入 Webhook 密钥（支持 Base64 或明文，不回显明文）"
          currentValue={webhookSetting ? `${webhookSetting.key || 'DEFAULT'} / ${webhookSetting.secret || '未设置'}` : undefined}
          updatedAt={webhookSetting?.updatedAt}
          onInputChange={setWebhookSecretInput}
          onRefresh={fetchWebhookSecret}
          onSave={handleSaveWebhookSecret}
          onDelete={handleDeleteWebhookSecret}
          extraField={{
            label: 'Route Key（可选，默认 DEFAULT）',
            value: webhookKeyInput,
            placeholder: '例如：ORDER、PAY 等，留空为 DEFAULT',
            onChange: setWebhookKeyInput,
          }}
        />

        <IpfsConfigSection
          isOpen={isSectionOpen('ipfs')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={ipfsConfigLoading}
          saving={ipfsConfigSaving}
          testing={ipfsConfigTesting}
          ipfsConfig={ipfsConfig}
          ipfsUploadUrlInput={ipfsUploadUrlInput}
          ipfsUserAgentInput={ipfsUserAgentInput}
          imageBedApiUrlInput={imageBedApiUrlInput}
          imageBedCdnDomainInput={imageBedCdnDomainInput}
          imageBedStorageDestinationInput={imageBedStorageDestinationInput}
          imageBedOutputFormatInput={imageBedOutputFormatInput}
          onIpfsUploadUrlChange={setIpfsUploadUrlInput}
          onIpfsUserAgentChange={setIpfsUserAgentInput}
          onImageBedApiUrlChange={setImageBedApiUrlInput}
          onImageBedCdnDomainChange={setImageBedCdnDomainInput}
          onImageBedStorageDestinationChange={setImageBedStorageDestinationInput}
          onImageBedOutputFormatChange={setImageBedOutputFormatInput}
          onRefresh={fetchIpfsConfig}
          onSave={handleSaveIpfsConfig}
          onTest={handleTestIpfsConfig}
        />

        <TurnstileConfigSection
          isOpen={isSectionOpen('turnstile')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={turnstileConfigLoading}
          saving={turnstileConfigSaving}
          deleting={turnstileConfigDeleting}
          config={turnstileConfig}
          siteKeyInput={turnstileSiteKeyInput}
          secretKeyInput={turnstileSecretKeyInput}
          onSiteKeyChange={setTurnstileSiteKeyInput}
          onSecretKeyChange={setTurnstileSecretKeyInput}
          onRefresh={fetchTurnstileConfig}
          onSave={handleSaveTurnstileConfig}
          onDelete={handleDeleteTurnstileConfig}
        />

        <HcaptchaConfigSection
          isOpen={isSectionOpen('hcaptcha')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={hcaptchaConfigLoading}
          saving={hcaptchaConfigSaving}
          deleting={hcaptchaConfigDeleting}
          config={hcaptchaConfig}
          siteKeyInput={hcaptchaSiteKeyInput}
          secretKeyInput={hcaptchaSecretKeyInput}
          onSiteKeyChange={setHcaptchaSiteKeyInput}
          onSecretKeyChange={setHcaptchaSecretKeyInput}
          onRefresh={fetchHcaptchaConfig}
          onSave={handleSaveHcaptchaConfig}
          onDelete={handleDeleteHcaptchaConfig}
        />

        <ClarityConfigSection
          isOpen={isSectionOpen('clarity')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={clarityConfigLoading}
          saving={clarityConfigSaving}
          deleting={clarityConfigDeleting}
          config={clarityConfig}
          projectIdInput={clarityProjectIdInput}
          onProjectIdChange={setClarityProjectIdInput}
          onRefresh={fetchClarityConfig}
          onSave={handleSaveClarityConfig}
          onDelete={handleDeleteClarityConfig}
        />

        <GithubBillingConfigSection
          isOpen={isSectionOpen('githubBilling')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          loading={githubBillingConfigLoading}
          saving={githubBillingConfigSaving}
          curlInput={githubBillingCurlInput}
          selectedConfigKey={selectedConfigKey}
          multiConfig={multiGithubBillingConfig}
          onCurlInputChange={setGithubBillingCurlInput}
          onSelectedConfigKeyChange={setSelectedConfigKey}
          onRefresh={fetchGithubBillingConfig}
          onSave={handleSaveGithubBillingConfig}
          onDelete={() => handleDeleteGithubBillingConfig(selectedConfigKey)}
        />

        <LibreChatProvidersSection
          isOpen={isSectionOpen('providers')}
          onToggle={toggleSection}
          prefersReducedMotion={prefersReducedMotion}
          isMobile={isMobile}
          loading={providersLoading}
          saving={providerSaving}
          deletingId={providerDeletingId}
          providers={providers}
          providerId={providerId}
          providerFilterGroup={providerFilterGroup}
          providerBaseUrl={providerBaseUrl}
          providerApiKey={providerApiKey}
          providerModel={providerModel}
          providerGroup={providerGroup}
          providerEnabled={providerEnabled}
          providerWeight={providerWeight}
          onFilterGroupChange={setProviderFilterGroup}
          onBaseUrlChange={setProviderBaseUrl}
          onApiKeyChange={setProviderApiKey}
          onModelChange={setProviderModel}
          onGroupChange={setProviderGroup}
          onEnabledChange={setProviderEnabled}
          onWeightChange={setProviderWeight}
          onRefresh={fetchProviders}
          onSave={handleSaveProvider}
          onReset={resetProviderForm}
          onEdit={handleEditProvider}
          onDelete={handleDeleteProvider}
        />

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
