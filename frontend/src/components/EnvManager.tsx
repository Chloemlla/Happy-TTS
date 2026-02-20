import React, {
  useEffect, useState, useMemo, useCallback, startTransition
} from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { signedFetch } from '../utils/requestSigner';
import CryptoJS from 'crypto-js';
import {
  FaCog,
  FaLock,
  FaList,
  FaSync,
  FaInfoCircle,
  FaTimes,
  FaChevronDown,
  FaTrash,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';

const API_URL = getApiBaseUrl() + '/api/admin/envs';
const OUTEMAIL_API = getApiBaseUrl() + '/api/admin/outemail/settings';
const MODLIST_API = getApiBaseUrl() + '/api/admin/modlist/setting';
const TTS_API = getApiBaseUrl() + '/api/admin/tts/setting';
const LIBRECHAT_PROVIDERS_API = getApiBaseUrl() + '/api/librechat/admin/providers';
const SHORTURL_AES_API = getApiBaseUrl() + '/api/shorturl/admin/aes-key';
const WEBHOOK_SECRET_API = getApiBaseUrl() + '/api/admin/webhook/secret';
const DEBUG_CONSOLE_API = getApiBaseUrl() + '/api/debug-console';
const IPFS_CONFIG_API = getApiBaseUrl() + '/api/ipfs/settings';
const TURNSTILE_CONFIG_API = getApiBaseUrl() + '/api/turnstile/config';
const HCAPTCHA_CONFIG_API = getApiBaseUrl() + '/api/turnstile/hcaptcha-config';
const CLARITY_CONFIG_API = getApiBaseUrl() + '/api/tts/clarity/config';
const GITHUB_BILLING_CONFIG_API = getApiBaseUrl() + '/api/github-billing/config';

// 统一的进入动画与过渡配置，结合 useReducedMotion 可降级
const ENTER_INITIAL = { opacity: 0, y: 20 } as const;
const ENTER_ANIMATE = { opacity: 1, y: 0 } as const;
const DURATION_06 = { duration: 0.6 } as const;
const DURATION_03 = { duration: 0.3 } as const;
const NO_DURATION = { duration: 0 } as const;

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

interface EnvItem {
  key: string;
  value: string;
  desc?: string;
  updatedAt?: string;
  source?: string; // 数据来源
}

interface OutemailSettingItem {
  domain: string;
  code: string; // 已脱敏显示
  updatedAt?: string;
}

interface ModlistSettingItem {
  code: string; // 已脱敏显示
  updatedAt?: string;
}
interface TtsSettingItem {
  code: string; // 已脱敏显示
  updatedAt?: string;
}
interface ChatProviderItem {
  id: string;
  baseUrl: string;
  apiKey: string; // 已脱敏显示
  model: string;
  group: string;
  enabled: boolean;
  weight: number;
  updatedAt?: string;
}
interface ShortAesSetting {
  aesKey: string | null;
  updatedAt?: string;
}
interface WebhookSecretSetting {
  key: string;
  secret: string | null;
  updatedAt?: string;
}

interface IPFSConfigSetting {
  ipfsUploadUrl: string;
  ipfsUa?: string;
  updatedAt?: string;
}

interface TurnstileConfigSetting {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
  updatedAt?: string;
}

interface HCaptchaConfigSetting {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
  updatedAt?: string;
}

interface ClarityConfigSetting {
  enabled: boolean;
  projectId: string | null;
  updatedAt?: string;
}

interface GitHubBillingConfigSetting {
  url?: string;
  method?: string;
  customerId?: string;
  headersCount?: number;
  hasCookies?: boolean;
  updatedAt?: string;
}

interface MultiGitHubBillingConfig {
  config1?: GitHubBillingConfigSetting;
  config2?: GitHubBillingConfigSetting;
  config3?: GitHubBillingConfigSetting;
  lastUpdated?: string;
}

interface DebugConsoleConfig {
  enabled: boolean;
  keySequence: string;
  verificationCode: string;
  maxAttempts: number;
  lockoutDuration: number;
  group: string;
  updatedAt?: string;
}

interface DebugConsoleAccessLog {
  _id?: string;
  userId?: string;
  ip: string;
  userAgent: string;
  keySequence: string;
  verificationCode: string;
  success: boolean;
  attempts: number;
  timestamp: string;
  lockoutUntil?: string;
}

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    throw new Error('解密失败');
  }
}

// 根据环境变量名判断数据来源
function getEnvSource(key: string): string | undefined {
  const keyLower = key.toLowerCase();

  // 数据库相关
  if (keyLower.includes('db_') || keyLower.includes('database_') || keyLower.includes('mongo')) {
    return '数据库配置';
  }

  // 邮件相关
  if (keyLower.includes('email_') || keyLower.includes('mail_') || keyLower.includes('smtp')) {
    return '邮件服务配置';
  }

  // API相关
  if (keyLower.includes('api_') || keyLower.includes('openai') || keyLower.includes('token')) {
    return 'API配置';
  }

  // 安全相关
  if (keyLower.includes('secret_') || keyLower.includes('key_') || keyLower.includes('password')) {
    return '安全配置';
  }

  // 服务器相关
  if (keyLower.includes('port') || keyLower.includes('host') || keyLower.includes('url')) {
    return '服务器配置';
  }

  // 管理员相关
  if (keyLower.includes('admin_')) {
    return '管理员配置';
  }

  // 环境相关
  if (keyLower.includes('env') || keyLower.includes('node_env')) {
    return '环境配置';
  }

  return undefined; // 没有明确来源
}

// 抽取表格行，memo 化以减少不必要渲染
interface EnvRowProps {
  item: EnvItem;
  idx: number;
  prefersReducedMotion: boolean;
  onSourceClick: (source: string) => void;
}
const EnvRow = React.memo(function EnvRow({ item, idx, prefersReducedMotion, onSourceClick }: EnvRowProps) {
  const rowTransition = useMemo(() => (
    prefersReducedMotion ? NO_DURATION : { duration: 0.3, delay: idx * 0.05 }
  ), [prefersReducedMotion, idx]);

  return (
    <m.tr
      className={`border-b border-gray-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
        }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={rowTransition}
      whileHover={{ backgroundColor: '#f8fafc' }}
    >
      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 align-top">
        <div className="break-words whitespace-normal leading-relaxed flex items-start gap-1">
          {item.source && (
            <button
              onClick={() => onSourceClick(item.source!)}
              className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 mt-0.5 flex-shrink-0 hover:text-blue-600 transition-colors cursor-pointer"
            >
              <FaInfoCircle />
            </button>
          )}
          <span>{item.key.split(':').pop() || item.key}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-gray-700 align-top">
        <div className="break-words whitespace-pre-wrap leading-relaxed">
          {item.value}
        </div>
      </td>
    </m.tr>
  );
});

// 公共方法：处理数据来源点击
export const handleSourceClick = (
  source: string,
  setSelectedSource: (source: string) => void,
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getStorageValue?: () => string;
    onBeforeOpen?: () => void;
    onAfterOpen?: () => void;
  }
) => {
  // 执行前置回调
  options?.onBeforeOpen?.();

  // 记录当前位置 - 支持自定义存储键和值
  const currentScrollY = window.scrollY;
  const storageKey = options?.storageKey || 'envManagerScrollPosition';
  const storageValue = options?.getStorageValue ? options.getStorageValue() : currentScrollY.toString();

  sessionStorage.setItem(storageKey, storageValue);

  setSelectedSource(source);
  setShowSourceModal(true);

  // 自动滚动到弹窗位置
  setTimeout(() => {
    const modal = document.querySelector('[data-source-modal]');
    if (modal) {
      modal.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }

    // 执行后置回调
    options?.onAfterOpen?.();
  }, 100);
};

// 公共方法：处理数据来源弹窗关闭
export const handleSourceModalClose = (
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getRestoreValue?: () => number;
    onBeforeClose?: () => void;
    onAfterClose?: () => void;
    closeDelay?: number;
  }
) => {
  // 执行前置回调
  options?.onBeforeClose?.();

  setShowSourceModal(false);

  // 恢复原位置 - 支持自定义存储键和恢复值
  setTimeout(() => {
    const storageKey = options?.storageKey || 'envManagerScrollPosition';
    const savedScrollY = sessionStorage.getItem(storageKey);

    if (savedScrollY) {
      const scrollY = options?.getRestoreValue ? options.getRestoreValue() : parseInt(savedScrollY, 10);
      window.scrollTo({
        top: scrollY,
        behavior: 'smooth'
      });
      sessionStorage.removeItem(storageKey);
    }

    // 执行后置回调
    options?.onAfterClose?.();
  }, options?.closeDelay || 300); // 等待弹窗关闭动画完成
};

// 可折叠区块头部 — 点击展开/收起，减少不必要的 DOM 渲染
interface CollapsibleSectionProps {
  title: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  prefersReducedMotion?: boolean | null;
}
const CollapsibleSection = React.memo(function CollapsibleSection({
  title, sectionKey, isOpen, onToggle, children, headerRight, prefersReducedMotion
}: CollapsibleSectionProps) {
  return (
    <m.div
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
      initial={ENTER_INITIAL}
      animate={ENTER_ANIMATE}
      transition={prefersReducedMotion ? NO_DURATION : DURATION_06}
    >
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-2">
          {headerRight}
          <FaChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {children}
        </div>
      )}
    </m.div>
  );
});

const EnvManager: React.FC = () => {
  const { user } = useAuth();
  const [envs, setEnvs] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EnvItem>>({});
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const { setNotification } = useNotification();
  const prefersReducedMotion = useReducedMotion();

  // 基于窗口宽度的移动端检测（随页面缩放实时更新，带防抖）
  const [isMobile, setIsMobile] = useState<boolean>(false);
  // 环境变量区折叠
  const [isEnvCollapsed, setIsEnvCollapsed] = useState<boolean>(false);
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

  // Debug Console Config
  const [debugConfigs, setDebugConfigs] = useState<DebugConsoleConfig[]>([]);
  const [debugConfigsLoading, setDebugConfigsLoading] = useState(false);
  const [debugConfigSaving, setDebugConfigSaving] = useState(false);
  const [debugConfigDeletingGroup, setDebugConfigDeletingGroup] = useState<string | null>(null);
  const [debugConfigFilterGroup, setDebugConfigFilterGroup] = useState('');
  // 表单
  const [debugConfigGroup, setDebugConfigGroup] = useState('');
  const [debugConfigEnabled, setDebugConfigEnabled] = useState(true);
  const [debugConfigKeySequence, setDebugConfigKeySequence] = useState('');
  const [debugConfigVerificationCode, setDebugConfigVerificationCode] = useState('');
  const [debugConfigMaxAttempts, setDebugConfigMaxAttempts] = useState<number>(5);
  const [debugConfigLockoutDuration, setDebugConfigLockoutDuration] = useState<number>(30);

  // IPFS Config Setting
  const [ipfsConfig, setIpfsConfig] = useState<IPFSConfigSetting | null>(null);
  const [ipfsConfigLoading, setIpfsConfigLoading] = useState(false);
  const [ipfsConfigSaving, setIpfsConfigSaving] = useState(false);
  const [ipfsConfigTesting, setIpfsConfigTesting] = useState(false);
  const [ipfsUploadUrlInput, setIpfsUploadUrlInput] = useState('');
  const [ipfsUserAgentInput, setIpfsUserAgentInput] = useState('');

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

  // Debug Console Access Logs
  const [debugLogs, setDebugLogs] = useState<DebugConsoleAccessLog[]>([]);
  const [debugLogsLoading, setDebugLogsLoading] = useState(false);
  const [debugLogsPage, setDebugLogsPage] = useState<number>(1);
  const [debugLogsLimit, setDebugLogsLimit] = useState<number>(20);
  const [debugLogsTotal, setDebugLogsTotal] = useState<number>(0);
  const [debugLogsTotalPages, setDebugLogsTotalPages] = useState<number>(0);
  // 过滤条件
  const [debugLogsFilterIp, setDebugLogsFilterIp] = useState<string>('');
  const [debugLogsFilterSuccess, setDebugLogsFilterSuccess] = useState<string>('');
  const [debugLogsFilterUserId, setDebugLogsFilterUserId] = useState<string>('');
  const [debugLogsFilterStartDate, setDebugLogsFilterStartDate] = useState<string>('');
  const [debugLogsFilterEndDate, setDebugLogsFilterEndDate] = useState<string>('');
  // 删除相关状态
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [deleteLogsLoading, setDeleteLogsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'single' | 'batch' | 'all' | 'filter'>('single');

  const trans06 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_06), [prefersReducedMotion]);
  const trans03 = useMemo(() => (prefersReducedMotion ? NO_DURATION : DURATION_03), [prefersReducedMotion]);
  const modalTrans = useMemo(() => (prefersReducedMotion ? NO_DURATION : { duration: 0.1 }), [prefersReducedMotion]);

  // ========== 性能优化：按需展开 & 懒加载数据 ==========
  // 追踪已展开的区块，只有展开时才渲染内容和拉取数据
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['envs']));
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

  const fetchEnvs = async () => {
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

        setEnvs(envArr);
      } else {
        setNotification({ message: data.error || '获取失败', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: '获取失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

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
    if (!code) {
      setNotification({ message: '请填写校验码', type: 'error' });
      return;
    }
    setSettingsSaving(true);
    try {
      const res = await fetch(OUTEMAIL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ domain, code })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setSettingCode('');
      await fetchOutemailSettings();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setSettingsSaving(false);
    }
  }, [settingsSaving, settingDomain, settingCode, fetchOutemailSettings, setNotification]);

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

  // Debug Console Config handlers
  const fetchDebugConfigs = useCallback(async () => {
    setDebugConfigsLoading(true);
    try {
      // 尝试获取加密配置
      const encryptedUrl = debugConfigFilterGroup ?
        `${DEBUG_CONSOLE_API}/configs/encrypted?group=${encodeURIComponent(debugConfigFilterGroup)}` :
        `${DEBUG_CONSOLE_API}/configs/encrypted`;

      const encryptedRes = await fetch(encryptedUrl, { headers: { ...getAuthHeaders() } });

      if (encryptedRes.ok) {
        const encryptedData = await encryptedRes.json();
        if (encryptedData.success && encryptedData.data && encryptedData.iv) {
          try {
            // 解密配置数据
            const token = localStorage.getItem('token');
            if (!token) {
              throw new Error('缺少认证token');
            }

            const decryptedJson = decryptAES256(encryptedData.data, encryptedData.iv, token);
            const decryptedData = JSON.parse(decryptedJson);

            if (Array.isArray(decryptedData)) {
              setDebugConfigs(decryptedData);
              return;
            }
          } catch (decryptError) {
            console.warn('解密配置失败，尝试获取未加密配置:', decryptError);
          }
        }
      }

      // 回退到未加密配置
      const url = debugConfigFilterGroup ?
        `${DEBUG_CONSOLE_API}/configs?group=${encodeURIComponent(debugConfigFilterGroup)}` :
        `${DEBUG_CONSOLE_API}/configs`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() } });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取调试控制台配置失败', type: 'error' });
        setDebugConfigsLoading(false);
        return;
      }

      setDebugConfigs(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      setNotification({ message: '获取调试控制台配置失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDebugConfigsLoading(false);
    }
  }, [debugConfigFilterGroup, setNotification]);

  const resetDebugConfigForm = useCallback(() => {
    setDebugConfigGroup('');
    setDebugConfigEnabled(true);
    setDebugConfigKeySequence('');
    setDebugConfigVerificationCode('');
    setDebugConfigMaxAttempts(5);
    setDebugConfigLockoutDuration(30);
  }, []);

  const handleSaveDebugConfig = useCallback(() => {
    if (debugConfigSaving) return;
    const group = debugConfigGroup.trim() || 'default';
    const enabled = !!debugConfigEnabled;
    const keySequence = debugConfigKeySequence.trim();
    const verificationCode = debugConfigVerificationCode.trim();
    const maxAttempts = Math.max(1, Math.min(20, Number(debugConfigMaxAttempts || 5)));
    const lockoutDuration = Math.max(1, Math.min(1440, Number(debugConfigLockoutDuration || 30))) * 60 * 1000; // 转换为毫秒

    if (!keySequence || !verificationCode) {
      setNotification({ message: '请填写按键序列和验证码', type: 'error' });
      return;
    }

    setDebugConfigSaving(true);
    (async () => {
      try {
        const body = {
          enabled,
          keySequence,
          verificationCode,
          maxAttempts,
          lockoutDuration
        };
        const res = await fetch(`${DEBUG_CONSOLE_API}/configs/${encodeURIComponent(group)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setNotification({ message: data.error || '保存失败', type: 'error' });
          return;
        }
        setNotification({ message: '保存成功', type: 'success' });
        resetDebugConfigForm();
        await fetchDebugConfigs();
      } catch (e) {
        setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
      } finally {
        setDebugConfigSaving(false);
      }
    })();
  }, [debugConfigSaving, debugConfigGroup, debugConfigEnabled, debugConfigKeySequence, debugConfigVerificationCode, debugConfigMaxAttempts, debugConfigLockoutDuration, fetchDebugConfigs, resetDebugConfigForm, setNotification]);

  const handleDeleteDebugConfig = useCallback(async (group: string) => {
    if (debugConfigDeletingGroup) return;
    setDebugConfigDeletingGroup(group);
    try {
      const res = await fetch(`${DEBUG_CONSOLE_API}/configs/${encodeURIComponent(group)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除失败', type: 'error' });
        return;
      }
      setNotification({ message: '删除成功', type: 'success' });
      await fetchDebugConfigs();
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDebugConfigDeletingGroup(null);
    }
  }, [debugConfigDeletingGroup, fetchDebugConfigs, setNotification]);

  const handleEditDebugConfig = useCallback((config: DebugConsoleConfig) => {
    setDebugConfigGroup(config.group);
    setDebugConfigEnabled(!!config.enabled);
    setDebugConfigKeySequence(config.keySequence);
    setDebugConfigVerificationCode(''); // 不回显明文
    setDebugConfigMaxAttempts(Number(config.maxAttempts || 5));
    setDebugConfigLockoutDuration(Math.floor(Number(config.lockoutDuration || 30 * 60 * 1000) / 1000 / 60)); // 转换为分钟
  }, []);

  const handleInitDefaultDebugConfig = useCallback(async () => {
    try {
      const res = await fetch(`${DEBUG_CONSOLE_API}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '初始化失败', type: 'error' });
        return;
      }
      setNotification({ message: '默认配置初始化成功', type: 'success' });
      await fetchDebugConfigs();
    } catch (e) {
      setNotification({ message: '初始化失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    }
  }, [fetchDebugConfigs, setNotification]);

  // Debug Console Access Logs handlers
  const fetchDebugLogs = useCallback(async (pageNum?: number) => {
    setDebugLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum || debugLogsPage));
      params.set('limit', String(debugLogsLimit));
      if (debugLogsFilterIp) params.set('ip', debugLogsFilterIp);
      if (debugLogsFilterSuccess) params.set('success', debugLogsFilterSuccess);
      if (debugLogsFilterUserId) params.set('userId', debugLogsFilterUserId);
      if (debugLogsFilterStartDate) params.set('startDate', debugLogsFilterStartDate);
      if (debugLogsFilterEndDate) params.set('endDate', debugLogsFilterEndDate);

      const res = await fetch(`${DEBUG_CONSOLE_API}/logs?${params.toString()}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '获取访问日志失败', type: 'error' });
        setDebugLogsLoading(false);
        return;
      }

      const result = data.data;
      setDebugLogs(result.logs || []);
      setDebugLogsTotal(result.total || 0);
      setDebugLogsTotalPages(Math.ceil((result.total || 0) / debugLogsLimit));
      if (pageNum) setDebugLogsPage(pageNum);
    } catch (e) {
      setNotification({ message: '获取访问日志失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDebugLogsLoading(false);
    }
  }, [debugLogsPage, debugLogsLimit, debugLogsFilterIp, debugLogsFilterSuccess, debugLogsFilterUserId, debugLogsFilterStartDate, debugLogsFilterEndDate, setNotification]);

  const resetDebugLogsFilters = useCallback(() => {
    setDebugLogsFilterIp('');
    setDebugLogsFilterSuccess('');
    setDebugLogsFilterUserId('');
    setDebugLogsFilterStartDate('');
    setDebugLogsFilterEndDate('');
    setDebugLogsPage(1);
  }, []);

  const handleDebugLogsPageChange = useCallback((newPage: number) => {
    setDebugLogsPage(newPage);
    fetchDebugLogs(newPage);
  }, [fetchDebugLogs]);

  // 删除日志相关处理函数
  const handleDeleteSingleLog = useCallback(async (logId: string) => {
    setDeleteLogsLoading(true);
    try {
      const res = await fetch(`${DEBUG_CONSOLE_API}/logs/${logId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除日志失败', type: 'error' });
        return;
      }

      setNotification({ message: '日志删除成功', type: 'success' });
      fetchDebugLogs(); // 重新获取日志列表
    } catch (e) {
      setNotification({ message: '删除日志失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDeleteLogsLoading(false);
    }
  }, [fetchDebugLogs, setNotification]);

  const handleDeleteBatchLogs = useCallback(async () => {
    if (selectedLogIds.length === 0) {
      setNotification({ message: '请选择要删除的日志', type: 'warning' });
      return;
    }

    setDeleteLogsLoading(true);
    try {
      const res = await fetch(`${DEBUG_CONSOLE_API}/logs`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logIds: selectedLogIds })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '批量删除日志失败', type: 'error' });
        return;
      }

      setNotification({ message: `成功删除 ${data.deletedCount} 条日志`, type: 'success' });
      setSelectedLogIds([]); // 清空选择
      fetchDebugLogs(); // 重新获取日志列表
    } catch (e) {
      setNotification({ message: '批量删除日志失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDeleteLogsLoading(false);
    }
  }, [selectedLogIds, fetchDebugLogs, setNotification]);

  const handleDeleteAllLogs = useCallback(async () => {
    setDeleteLogsLoading(true);
    try {
      const res = await fetch(`${DEBUG_CONSOLE_API}/logs/all`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除所有日志失败', type: 'error' });
        return;
      }

      setNotification({ message: `成功删除所有日志（共 ${data.deletedCount} 条）`, type: 'success' });
      setSelectedLogIds([]); // 清空选择
      fetchDebugLogs(); // 重新获取日志列表
    } catch (e) {
      setNotification({ message: '删除所有日志失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDeleteLogsLoading(false);
    }
  }, [fetchDebugLogs, setNotification]);

  const handleDeleteLogsByFilter = useCallback(async () => {
    setDeleteLogsLoading(true);
    try {
      // 检查是否有选中的日志
      if (selectedLogIds.length === 0) {
        setNotification({ message: '请先选择要删除的日志', type: 'warning' });
        return;
      }

      const res = await fetch(`${DEBUG_CONSOLE_API}/logs`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logIds: selectedLogIds })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '删除选中日志失败', type: 'error' });
        return;
      }

      setNotification({ message: `成功删除 ${data.deletedCount} 条选中日志`, type: 'success' });
      setSelectedLogIds([]); // 清空选择
      fetchDebugLogs(); // 重新获取日志列表
    } catch (e) {
      setNotification({ message: '删除选中日志失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setDeleteLogsLoading(false);
    }
  }, [selectedLogIds, fetchDebugLogs, setNotification]);

  const handleSelectLog = useCallback((logId: string, checked: boolean) => {
    if (checked) {
      setSelectedLogIds(prev => [...prev, logId]);
    } else {
      setSelectedLogIds(prev => prev.filter(id => id !== logId));
    }
  }, []);

  const handleSelectAllLogs = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedLogIds(debugLogs.map(log => log._id || `${log.timestamp}-${log.ip}`));
    } else {
      setSelectedLogIds([]);
    }
  }, [debugLogs]);

  const showDeleteConfirmDialog = useCallback((type: 'single' | 'batch' | 'all' | 'filter', logId?: string) => {
    setDeleteType(type);
    setShowDeleteConfirm(true);
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
      setIpfsConfig({ ipfsUploadUrl: data.data.ipfsUploadUrl, ipfsUa: data.data.ipfsUa });
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
    if (!url && !ua) {
      setNotification({ message: '请填写IPFS上传URL或User-Agent至少一项', type: 'error' });
      return;
    }
    setIpfsConfigSaving(true);
    try {
      const res = await fetch(IPFS_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ...(url ? { ipfsUploadUrl: url } : {}), ...(ua ? { ipfsUa: ua } : {}) })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({ message: data.error || '保存失败', type: 'error' });
        return;
      }
      setNotification({ message: '保存成功', type: 'success' });
      setIpfsUploadUrlInput('');
      setIpfsUserAgentInput('');
      await fetchIpfsConfig();
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setIpfsConfigSaving(false);
    }
  }, [ipfsConfigSaving, ipfsUploadUrlInput, ipfsUserAgentInput, fetchIpfsConfig, setNotification]);

  const handleTestIpfsConfig = useCallback(async () => {
    if (ipfsConfigTesting) return;
    setIpfsConfigTesting(true);
    try {
      const res = await fetch(`${IPFS_CONFIG_API}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
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
      const res = await fetch(getApiBaseUrl() + '/api/github-billing/multi-config', { headers: { ...getAuthHeaders() } });
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
      const res = await fetch(getApiBaseUrl() + `/api/github-billing/multi-config/${selectedConfigKey}`, {
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
      const res = await fetch(getApiBaseUrl() + `/api/github-billing/multi-config/${configKey}`, {
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

  const handleConfirmDelete = useCallback(() => {
    switch (deleteType) {
      case 'single':
        // 单个删除需要传入logId，这里暂时跳过
        break;
      case 'batch':
        handleDeleteBatchLogs();
        break;
      case 'all':
        handleDeleteAllLogs();
        break;
      case 'filter':
        handleDeleteLogsByFilter();
        break;
    }
    setShowDeleteConfirm(false);
  }, [deleteType, handleDeleteBatchLogs, handleDeleteAllLogs, handleDeleteLogsByFilter]);

  useEffect(() => { fetchEnvs(); }, []);

  // 懒加载：仅在区块首次展开时拉取数据，避免页面初始化时 14 个 API 并发请求
  useEffect(() => {
    const lazyMap: Record<string, () => Promise<void> | void> = {
      outemail: fetchOutemailSettings,
      modlist: fetchModlistSetting,
      tts: fetchTtsSetting,
      shortaes: fetchShortAes,
      webhook: fetchWebhookSecret,
      providers: fetchProviders,
      debugconfig: fetchDebugConfigs,
      debuglogs: fetchDebugLogs,
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
  }, [expandedSections, fetchOutemailSettings, fetchModlistSetting, fetchTtsSetting, fetchShortAes, fetchWebhookSecret, fetchProviders, fetchDebugConfigs, fetchDebugLogs, fetchIpfsConfig, fetchTurnstileConfig, fetchHcaptchaConfig, fetchClarityConfig, fetchGithubBillingConfig]);

  // 当过滤条件改变时重新获取日志
  useEffect(() => {
    if (debugLogsPage === 1) {
      fetchDebugLogs();
    } else {
      setDebugLogsPage(1);
    }
  }, [debugLogsFilterIp, debugLogsFilterSuccess, debugLogsFilterUserId, debugLogsFilterStartDate, debugLogsFilterEndDate, debugLogsLimit]);

  // 使用公共方法处理数据来源点击
  const handleSourceClickWrapper = useCallback((source: string) => {
    handleSourceClick(source, setSelectedSource, setShowSourceModal);
  }, []);

  // 使用公共方法处理弹窗关闭
  const handleSourceModalCloseWrapper = useCallback(() => {
    handleSourceModalClose(setShowSourceModal);
  }, []);

  // 管理员校验
  if (!user || user.role !== 'admin') {
    return (
      <LazyMotion features={domAnimation}>
        <m.div className="space-y-6">
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
      <div className="relative">
        {/* 标题和说明 */}
        <m.div
          className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <h2 className="text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-3 flex items-center gap-2">
            <FaCog className="text-xl sm:text-2xl text-blue-600" />
            环境变量管理
          </h2>
          <div className="text-gray-600 space-y-2">
            <p className="text-sm sm:text-base">查看系统环境变量配置，支持加密存储和传输。</p>
            <div className="flex items-start gap-2 text-sm">
              <div>
                <p className="font-semibold text-blue-700">功能说明：</p>
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
        <m.div
          className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaList className="text-lg text-blue-500" />
              环境变量列表
            </h3>
            <div className="flex items-center gap-2">
              <m.button
                onClick={() => setIsEnvCollapsed(prev => !prev)}
                className="px-2 sm:px-3 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm font-medium flex items-center gap-2"
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
              <m.button
                onClick={fetchEnvs}
                disabled={loading}
                className="px-2 sm:px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
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
              >
                {/* 数据来源图例 */}
                <div className="mb-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-blue-700">
                    <FaInfoCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <span className="font-medium leading-relaxed">带蓝色感叹号图标的变量表示有明确的数据来源信息</span>
                  </div>
                </div>

                {loading ? (
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
                {!loading && envs.length > 0 && (
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
        </m.div>

        {/* 对外邮件校验码设置 */}
        <CollapsibleSection title="对外邮件校验码设置" sectionKey="outemail" isOpen={isSectionOpen('outemail')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchOutemailSettings(); }} disabled={settingsLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
            <FaSync className={`w-4 h-4 ${settingsLoading ? 'animate-spin' : ''}`} /> 刷新
          </m.button>
        }>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">域名（可留空表示默认）</label>
              <input
                value={settingDomain}
                onChange={(e) => setSettingDomain(e.target.value)}
                placeholder="例如: hapxs.com 或 留空"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">校验码</label>
              <input
                value={settingCode}
                onChange={(e) => setSettingCode(e.target.value)}
                placeholder="请输入校验码（仅用于校验，不会回显明文）"
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
            <h4 className="text-sm font-semibold text-gray-700 mb-2">已配置域名</h4>
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
                          <div className="font-mono text-xs text-gray-700 break-all">{s.code}</div>
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
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">校验码（脱敏）</th>
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
                          <td className="px-4 py-3 font-mono text-sm text-gray-700">{s.code}</td>
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
        <CollapsibleSection title="MOD 列表修改码设置" sectionKey="modlist" isOpen={isSectionOpen('modlist')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchModlistSetting(); }} disabled={modLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="TTS 生成码设置" sectionKey="tts" isOpen={isSectionOpen('tts')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchTtsSetting(); }} disabled={ttsLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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

        {/* 短链 AES_KEY 设置 */}
        <CollapsibleSection title="短链 AES_KEY 设置" sectionKey="shortaes" isOpen={isSectionOpen('shortaes')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchShortAes(); }} disabled={shortAesLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="Webhook 密钥设置" sectionKey="webhook" isOpen={isSectionOpen('webhook')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchWebhookSecret(); }} disabled={webhookLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="IPFS 配置设置" sectionKey="ipfs" isOpen={isSectionOpen('ipfs')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchIpfsConfig(); }} disabled={ipfsConfigLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
                placeholder="例如：HappyTTS-IPFS-Uploader/1.0 (+https://example.com)"
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
              onClick={handleTestIpfsConfig}
              disabled={ipfsConfigTesting || !ipfsConfig?.ipfsUploadUrl}
              className="px-3 sm:px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {ipfsConfigTesting ? '测试中...' : '测试配置'}
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

          <div className="mt-4 text-xs text-gray-500">
            说明：IPFS上传URL与User-Agent用于文件上传到IPFS网络，支持动态配置（仅管理员可修改），保存后立即生效，无需重启服务。
          </div>
        </CollapsibleSection>

        {/* Turnstile 配置设置 */}
        <CollapsibleSection title="Turnstile 配置设置" sectionKey="turnstile" isOpen={isSectionOpen('turnstile')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchTurnstileConfig(); }} disabled={turnstileConfigLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="hCaptcha 配置设置" sectionKey="hcaptcha" isOpen={isSectionOpen('hcaptcha')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchHcaptchaConfig(); }} disabled={hcaptchaConfigLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="Microsoft Clarity 配置设置" sectionKey="clarity" isOpen={isSectionOpen('clarity')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchClarityConfig(); }} disabled={clarityConfigLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="GitHub Billing 配置设置" sectionKey="githubBilling" isOpen={isSectionOpen('githubBilling')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <m.button onClick={(e) => { e.stopPropagation(); fetchGithubBillingConfig(); }} disabled={githubBillingConfigLoading} className="px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2" whileTap={{ scale: 0.95 }}>
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
        <CollapsibleSection title="LibreChat 提供者配置" sectionKey="providers" isOpen={isSectionOpen('providers')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
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
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
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

        {/* 调试控制台配置 */}
        <CollapsibleSection title="调试控制台配置" sectionKey="debugconfig" isOpen={isSectionOpen('debugconfig')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              value={debugConfigFilterGroup}
              onChange={(e) => setDebugConfigFilterGroup(e.target.value)}
              placeholder="按 group 过滤"
              className="w-full sm:w-auto px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
            />
            <m.button
              onClick={handleInitDefaultDebugConfig}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium"
              whileTap={{ scale: 0.95 }}
            >
              初始化默认
            </m.button>
            <m.button
              onClick={fetchDebugConfigs}
              disabled={debugConfigsLoading}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${debugConfigsLoading ? 'animate-spin' : ''}`} /> 刷新
            </m.button>
          </div>
        }>
          {/* 表单 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">配置组名</label>
              <input
                value={debugConfigGroup}
                onChange={(e) => setDebugConfigGroup(e.target.value)}
                placeholder="例如：default、production、test"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">按键序列</label>
              <input
                value={debugConfigKeySequence}
                onChange={(e) => setDebugConfigKeySequence(e.target.value)}
                placeholder="例如：91781145"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
              <input
                value={debugConfigVerificationCode}
                onChange={(e) => setDebugConfigVerificationCode(e.target.value)}
                placeholder="例如：123456"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最大尝试次数</label>
              <input
                type="number"
                value={debugConfigMaxAttempts}
                onChange={(e) => setDebugConfigMaxAttempts(Math.max(1, Math.min(20, Number(e.target.value || 5))))}
                min={1}
                max={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">锁定时间（分钟）</label>
              <input
                type="number"
                value={debugConfigLockoutDuration}
                onChange={(e) => setDebugConfigLockoutDuration(Math.max(1, Math.min(1440, Number(e.target.value || 30))))}
                min={1}
                max={1440}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">启用</label>
              <input
                type="checkbox"
                checked={debugConfigEnabled}
                onChange={(e) => setDebugConfigEnabled(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mb-4">
            <m.button
              onClick={resetDebugConfigForm}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              重置
            </m.button>
            <m.button
              onClick={handleSaveDebugConfig}
              disabled={debugConfigSaving}
              className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.96 }}
            >
              {debugConfigSaving ? '保存中...' : '保存/更新'}
            </m.button>
          </div>

          {/* 列表 */}
          {debugConfigsLoading ? (
            <div className="text-gray-500 text-sm">加载中...</div>
          ) : debugConfigs.length === 0 ? (
            <div className="text-gray-500 text-sm">暂无配置</div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              {isMobile ? (
                <div className="space-y-3 p-2">
                  {debugConfigs.map((config, i) => (
                    <m.div
                      key={config.group}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                      className="border rounded-lg p-3 bg-white"
                    >
                      <div className="text-sm text-gray-800">
                        <div className="font-semibold">{config.group}</div>
                        <div className="mt-1 font-mono text-xs text-gray-700">KeySeq：{config.keySequence}</div>
                        <div className="mt-1">最大尝试：{config.maxAttempts}</div>
                        <div className="mt-1">锁定：{Math.floor(config.lockoutDuration / 1000 / 60)} 分钟</div>
                        <div className="mt-1">启用：{config.enabled ? '是' : '否'}</div>
                        <div className="mt-1 text-xs text-gray-500">{config.updatedAt ? new Date(config.updatedAt).toLocaleString() : '-'}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <m.button
                          onClick={() => handleEditDebugConfig(config)}
                          className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                          whileTap={{ scale: 0.95 }}
                        >
                          编辑
                        </m.button>
                        <m.button
                          onClick={() => handleDeleteDebugConfig(config.group)}
                          disabled={debugConfigDeletingGroup === config.group}
                          className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                          whileTap={{ scale: 0.95 }}
                        >
                          {debugConfigDeletingGroup === config.group ? '删除中...' : '删除'}
                        </m.button>
                      </div>
                    </m.div>
                  ))}
                </div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">配置组</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">按键序列</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">验证码（脱敏）</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">最大尝试</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">锁定时间</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">启用</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">更新时间</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugConfigs.map((config, i) => (
                      <m.tr
                        key={config.group}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.04 }}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-4 py-3 text-sm text-gray-800">{config.group}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{config.keySequence}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">******</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{config.maxAttempts}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{Math.floor(config.lockoutDuration / 1000 / 60)}分钟</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{config.enabled ? '是' : '否'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{config.updatedAt ? new Date(config.updatedAt).toLocaleString() : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <m.button
                              onClick={() => handleEditDebugConfig(config)}
                              className="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              编辑
                            </m.button>
                            <m.button
                              onClick={() => handleDeleteDebugConfig(config.group)}
                              disabled={debugConfigDeletingGroup === config.group}
                              className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              {debugConfigDeletingGroup === config.group ? '删除中...' : '删除'}
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

        {/* 调试控制台访问日志 */}
        <CollapsibleSection title="调试控制台访问日志" sectionKey="debuglogs" isOpen={isSectionOpen('debuglogs')} onToggle={toggleSection} prefersReducedMotion={prefersReducedMotion} headerRight={
          <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <m.button
              onClick={resetDebugLogsFilters}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm font-medium"
              whileTap={{ scale: 0.95 }}
            >
              重置过滤
            </m.button>
            <m.button
              onClick={() => fetchDebugLogs()}
              disabled={debugLogsLoading}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${debugLogsLoading ? 'animate-spin' : ''}`} /> 刷新
            </m.button>
            <m.button
              onClick={() => showDeleteConfirmDialog('all')}
              disabled={deleteLogsLoading || debugLogs.length === 0}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.95 }}
            >
              删除全部
            </m.button>
            <m.button
              onClick={() => showDeleteConfirmDialog('filter')}
              disabled={deleteLogsLoading || debugLogs.length === 0}
              className="w-full sm:w-auto px-2 sm:px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 text-sm font-medium"
              whileTap={{ scale: 0.95 }}
            >
              删除选中
            </m.button>
          </div>
        }>
          {/* 过滤条件 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP地址</label>
              <input
                value={debugLogsFilterIp}
                onChange={(e) => setDebugLogsFilterIp(e.target.value)}
                placeholder="过滤IP地址"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户ID</label>
              <input
                value={debugLogsFilterUserId}
                onChange={(e) => setDebugLogsFilterUserId(e.target.value)}
                placeholder="过滤用户ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">验证结果</label>
              <select
                value={debugLogsFilterSuccess}
                onChange={(e) => setDebugLogsFilterSuccess(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              >
                <option value="">全部</option>
                <option value="true">成功</option>
                <option value="false">失败</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="datetime-local"
                value={debugLogsFilterStartDate}
                onChange={(e) => setDebugLogsFilterStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="datetime-local"
                value={debugLogsFilterEndDate}
                onChange={(e) => setDebugLogsFilterEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每页数量</label>
              <select
                value={debugLogsLimit}
                onChange={(e) => {
                  setDebugLogsLimit(Number(e.target.value));
                  setDebugLogsPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
              >
                <option value={10}>10条</option>
                <option value={20}>20条</option>
                <option value={50}>50条</option>
                <option value={100}>100条</option>
              </select>
            </div>
          </div>

          {/* 日志列表 */}
          {debugLogsLoading ? (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-3 sm:mb-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm sm:text-base">加载中...</span>
            </div>
          ) : debugLogs.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <FaList className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400" />
              <span className="text-sm sm:text-base">暂无访问日志</span>
            </div>
          ) : (
            <>
              {/* 全选控制 */}
              <div className="mb-4 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLogIds.length === debugLogs.length && debugLogs.length > 0}
                    onChange={(e) => handleSelectAllLogs(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="font-medium">
                    {selectedLogIds.length === debugLogs.length && debugLogs.length > 0
                      ? '取消全选'
                      : `全选 (${debugLogs.length} 条记录)`
                    }
                  </span>
                </label>
              </div>

              {/* 移动端卡片展示 */}
              <div className="space-y-3 sm:space-y-4">
                {debugLogs.map((log, i) => {
                  const logId = log._id || `${log.timestamp}-${log.ip}-${i}`;
                  const isSelected = selectedLogIds.includes(logId);

                  return (
                    <m.div
                      key={logId}
                      className={`rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm hover:shadow transition ${log.success ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
                        }`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? NO_DURATION : { duration: 0.25, delay: i * 0.02 }}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* 选择框 */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectLog(logId, e.target.checked)}
                          className="w-4 h-4 mt-1 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          {/* 状态和时间 */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.success
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                                }`}>
                                {log.success ? '✓ 成功' : '✗ 失败'}
                              </span>
                              <span className="text-xs sm:text-sm text-gray-500">
                                尝试 {log.attempts} 次
                              </span>
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </div>

                          {/* 详细信息网格 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">IP地址</div>
                              <div className="text-sm sm:text-base font-mono text-gray-800 break-words">
                                {log.ip}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">用户ID</div>
                              <div className="text-sm sm:text-base text-gray-800 break-words">
                                {log.userId || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">按键序列</div>
                              <div className="text-sm sm:text-base font-mono text-gray-800">
                                {log.keySequence}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">验证码（脱敏）</div>
                              <div className="text-sm sm:text-base font-mono text-gray-800">
                                ******
                              </div>
                            </div>
                          </div>

                          {/* 锁定状态（如果有） */}
                          {log.lockoutUntil && (
                            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                              <div className="text-xs text-red-600 mb-1">锁定状态</div>
                              <div className="text-sm text-red-700 font-medium">
                                锁定至 {new Date(log.lockoutUntil).toLocaleString()}
                              </div>
                            </div>
                          )}

                          {/* 操作按钮 */}
                          <div className="flex justify-end">
                            <m.button
                              onClick={() => handleDeleteSingleLog(logId)}
                              disabled={deleteLogsLoading}
                              className="px-2 sm:px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-xs sm:text-sm"
                              whileTap={{ scale: 0.95 }}
                            >
                              删除
                            </m.button>
                          </div>
                        </div>
                      </div>
                    </m.div>
                  );
                })}
              </div>

              {/* 统计信息 */}
              <m.div
                className="mt-4 pt-4 border-t border-gray-200"
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={trans06}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 text-sm text-gray-600">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="font-medium text-gray-700">
                      总计 {debugLogsTotal} 条访问日志
                    </span>
                    {selectedLogIds.length > 0 && (
                      <span className="text-blue-600 font-medium">
                        <span className="hidden sm:inline">已选择 {selectedLogIds.length} 条记录</span>
                        <span className="sm:hidden">已选{selectedLogIds.length}条</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-xs sm:text-sm text-gray-500">
                      第 {debugLogsPage} / {debugLogsTotalPages} 页
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500">
                      最后更新: {new Date().toLocaleString()}
                    </span>
                  </div>
                </div>
              </m.div>

              {/* 操作和分页控制 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {selectedLogIds.length > 0 && (
                    <m.button
                      onClick={() => showDeleteConfirmDialog('batch')}
                      disabled={deleteLogsLoading}
                      className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                      whileTap={{ scale: 0.95 }}
                    >
                      <FaTrash className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">删除选中</span>
                      <span className="sm:hidden">删除</span>
                    </m.button>
                  )}
                </div>
                {debugLogsTotalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <m.button
                      onClick={() => handleDebugLogsPageChange(debugLogsPage - 1)}
                      disabled={debugLogsPage <= 1}
                      className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                      whileTap={{ scale: 0.95 }}
                    >
                      <FaChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">上一页</span>
                      <span className="sm:hidden">上一页</span>
                    </m.button>
                    <span className="px-3 py-2 text-sm text-gray-600 font-medium bg-gray-50 rounded-lg">
                      {debugLogsPage} / {debugLogsTotalPages}
                    </span>
                    <m.button
                      onClick={() => handleDebugLogsPageChange(debugLogsPage + 1)}
                      disabled={debugLogsPage >= debugLogsTotalPages}
                      className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="hidden sm:inline">下一页</span>
                      <span className="sm:hidden">下一页</span>
                      <FaChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                    </m.button>
                  </div>
                )}
              </div>
            </>
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

        {/* 删除确认弹窗 */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <m.div
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-[9999]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={modalTrans}
              onClick={() => setShowDeleteConfirm(false)}
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
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaTimes className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除</h3>
                  <p className="text-gray-600 mb-6">
                    {deleteType === 'single' && '确定要删除这条访问日志吗？'}
                    {deleteType === 'batch' && `确定要删除选中的 ${selectedLogIds.length} 条访问日志吗？`}
                    {deleteType === 'all' && '确定要删除所有访问日志吗？此操作不可恢复！'}
                    {deleteType === 'filter' && `确定要删除选中的 ${selectedLogIds.length} 条访问日志吗？此操作不可恢复！`}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      disabled={deleteLogsLoading}
                      className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
                    >
                      {deleteLogsLoading ? '删除中...' : '确认删除'}
                    </button>
                  </div>
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