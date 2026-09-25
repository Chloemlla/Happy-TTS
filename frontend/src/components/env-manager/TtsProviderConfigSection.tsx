import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import {
  EDGE_DEFAULT_TTS_BASE_URL,
  EDGE_DEFAULT_TTS_MODEL,
  EDGE_DEFAULT_TTS_VOICE,
  FISH_DEFAULT_TTS_BASE_URL,
  FISH_DEFAULT_TTS_MODEL,
  OPENAI_TTS_MODELS,
  defaultModelForProvider,
  isForeignTtsModelId,
} from '../../utils/ttsProviderConfig';
import type { TtsProviderId } from '../../types/tts';
import CollapsibleSection from './CollapsibleSection';
import { TTS_EDGE_VOICES_REFRESH_API, TTS_PROVIDER_ADMIN_API, getAuthHeaders } from './api';
import type {
  TtsProviderAdminConfig,
  TtsProviderAdminUpdate,
} from './types';
import { studioFieldClassName, studioPrimaryButtonClassName } from '../studioTheme';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

const EDGE_VOICE_ID_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})+-[A-Za-z0-9]{1,32}Neural$/;

/** 勾选框的固定展示顺序，不随状态里的数组顺序变化跳动。 */
const TTS_PROVIDER_IDS: readonly TtsProviderId[] = ['openai', 'fish', 'edge'];

const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  openai: 'OpenAI',
  fish: 'Fish Audio',
  edge: '微软语音',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTtsProviderId(value: unknown): value is TtsProviderId {
  return value === 'openai' || value === 'fish' || value === 'edge';
}

/**
 * 与服务端同一套规则：只留合法 id、去重、必含默认提供商且默认提供商排第一；
 * 缺失或非法时回退为 [provider]。前端只做一次归一化，避免回显与保存结果不一致。
 */
function normalizeEnabledProviders(value: unknown, provider: TtsProviderId): TtsProviderId[] {
  const rest: TtsProviderId[] = [];
  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (isTtsProviderId(candidate) && candidate !== provider && !rest.includes(candidate)) {
        rest.push(candidate);
      }
    }
  }
  return [provider, ...rest];
}

function unwrapConfig(payload: unknown, depth = 0): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  if (isTtsProviderId(payload.provider)) return payload;
  if (depth >= 4) return payload;
  const nested = [payload.config, payload.providerConfig, payload.setting, payload.data]
    .find(isRecord);
  if (nested) {
    const config = unwrapConfig(nested, depth + 1);
    if (typeof config.updatedAt !== 'string' && typeof payload.updatedAt === 'string') {
      return { ...config, updatedAt: payload.updatedAt };
    }
    return config;
  }
  return payload;
}

function normalizeAdminConfig(payload: unknown): TtsProviderAdminConfig {
  const envelope = isRecord(payload) ? payload : {};
  const source = unwrapConfig(payload);
  if (!isTtsProviderId(source.provider)) {
    throw new Error('TTS 提供商配置响应缺少有效的 provider 字段');
  }
  const provider: TtsProviderId = source.provider;
  const fish = isRecord(source.fish) ? source.fish : {};
  const edge = isRecord(source.edge) ? source.edge : {};
  const configuredDefaultModel =
    typeof source.defaultModel === 'string' ? source.defaultModel.trim() : '';
  const hasProviderMismatch = isForeignTtsModelId(configuredDefaultModel, provider);
  const providerDefaultModel = defaultModelForProvider(provider);
  const defaultModel = configuredDefaultModel && !hasProviderMismatch
    ? configuredDefaultModel
    : providerDefaultModel;

  return {
    provider,
    enabledProviders: normalizeEnabledProviders(source.enabledProviders, provider),
    defaultModel,
    fish: {
      baseUrl:
        typeof fish.baseUrl === 'string' && fish.baseUrl.trim()
          ? fish.baseUrl.trim()
          : FISH_DEFAULT_TTS_BASE_URL,
      referenceId: typeof fish.referenceId === 'string' ? fish.referenceId.trim() : '',
      apiKeyConfigured:
        fish.apiKeyConfigured === true || fish.hasApiKey === true,
      modelCurl: typeof fish.modelCurl === 'string' ? fish.modelCurl : '',
      defaultVoicesCurl: typeof fish.defaultVoicesCurl === 'string' ? fish.defaultVoicesCurl : '',
    },
    edge: {
      baseUrl:
        typeof edge.baseUrl === 'string' && edge.baseUrl.trim()
          ? edge.baseUrl.trim()
          : EDGE_DEFAULT_TTS_BASE_URL,
      defaultVoice:
        typeof edge.defaultVoice === 'string' && edge.defaultVoice.trim()
          ? edge.defaultVoice.trim()
          : EDGE_DEFAULT_TTS_VOICE,
      voiceSource: edge.voiceSource === 'refreshed' ? 'refreshed' : 'snapshot',
      voiceCount:
        typeof edge.voiceCount === 'number' && Number.isFinite(edge.voiceCount)
          ? edge.voiceCount
          : 0,
      ...(typeof edge.voicesUpdatedAt === 'string' && edge.voicesUpdatedAt
        ? { voicesUpdatedAt: edge.voicesUpdatedAt }
        : {}),
    },
    updatedAt:
      typeof source.updatedAt === 'string'
        ? source.updatedAt
        : typeof envelope.updatedAt === 'string'
          ? envelope.updatedAt
          : undefined,
  };
}

async function readResponse(response: Response, fallbackMessage: string): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => ({}));
  if (response.ok) return payload;

  const errorPayload = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const message = isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : errorPayload && typeof errorPayload.message === 'string'
        ? errorPayload.message
        : fallbackMessage;
  throw new Error(message);
}

export interface TtsProviderAdminClient {
  load: () => Promise<unknown>;
  save: (payload: TtsProviderAdminUpdate) => Promise<unknown>;
  refreshVoices?: () => Promise<unknown>;
}

const defaultClient: TtsProviderAdminClient = {
  async load() {
    const response = await fetch(TTS_PROVIDER_ADMIN_API, {
      credentials: 'include',
      headers: { ...getAuthHeaders() },
    });
    return readResponse(response, '获取 TTS 提供商配置失败');
  },
  async save(payload) {
    const response = await fetch(TTS_PROVIDER_ADMIN_API, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    return readResponse(response, '保存 TTS 提供商配置失败');
  },
  async refreshVoices() {
    const response = await fetch(TTS_EDGE_VOICES_REFRESH_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({}),
    });
    return readResponse(response, '刷新微软语音音色失败');
  },
};

interface TtsProviderConfigSectionProps {
  prefersReducedMotion?: boolean | null;
  client?: TtsProviderAdminClient;
}

export default function TtsProviderConfigSection({
  prefersReducedMotion,
  client = defaultClient,
}: TtsProviderConfigSectionProps) {
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const hasRequestedLoad = useRef(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<TtsProviderId>('openai');
  const [enabledProviders, setEnabledProviders] = useState<TtsProviderId[]>(['openai']);
  const [defaultModel, setDefaultModel] = useState(() => defaultModelForProvider('openai'));
  const [fishBaseUrl, setFishBaseUrl] = useState(FISH_DEFAULT_TTS_BASE_URL);
  const [fishReferenceId, setFishReferenceId] = useState('');
  const [fishApiKey, setFishApiKey] = useState('');
  const [fishModelCurl, setFishModelCurl] = useState('');
  const [fishDefaultVoicesCurl, setFishDefaultVoicesCurl] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [edgeBaseUrl, setEdgeBaseUrl] = useState(EDGE_DEFAULT_TTS_BASE_URL);
  const [edgeDefaultVoice, setEdgeDefaultVoice] = useState(EDGE_DEFAULT_TTS_VOICE);
  const [edgeVoiceSource, setEdgeVoiceSource] = useState<'snapshot' | 'refreshed'>('snapshot');
  const [edgeVoiceCount, setEdgeVoiceCount] = useState(0);
  const [edgeVoicesUpdatedAt, setEdgeVoicesUpdatedAt] = useState<string | undefined>();
  const [refreshingVoices, setRefreshingVoices] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const applyConfig = useCallback((config: TtsProviderAdminConfig) => {
    setProvider(config.provider);
    setEnabledProviders(config.enabledProviders);
    setDefaultModel(config.defaultModel);
    setFishBaseUrl(config.fish.baseUrl);
    setFishReferenceId(config.fish.referenceId);
    setApiKeyConfigured(config.fish.apiKeyConfigured);
    setFishModelCurl(config.fish.modelCurl);
    setFishDefaultVoicesCurl(config.fish.defaultVoicesCurl);
    setEdgeBaseUrl(config.edge.baseUrl);
    setEdgeDefaultVoice(config.edge.defaultVoice);
    setEdgeVoiceSource(config.edge.voiceSource);
    setEdgeVoiceCount(config.edge.voiceCount);
    setEdgeVoicesUpdatedAt(config.edge.voicesUpdatedAt);
    setUpdatedAt(config.updatedAt);
    setFishApiKey('');
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      applyConfig(normalizeAdminConfig(await client.load()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '获取 TTS 提供商配置失败');
    } finally {
      setLoading(false);
    }
  }, [applyConfig, client]);

  useEffect(() => {
    if (!isOpen || hasRequestedLoad.current) return;
    hasRequestedLoad.current = true;
    void loadConfig();
  }, [isOpen, loadConfig]);

  const modelOptions = useMemo(() => {
    const options = provider === 'openai'
      ? OPENAI_TTS_MODELS.map((option) => option.id)
      : [provider === 'edge' ? EDGE_DEFAULT_TTS_MODEL : FISH_DEFAULT_TTS_MODEL];
    return options.includes(defaultModel) ? options : [defaultModel, ...options];
  }, [defaultModel, provider]);

  const handleProviderChange = (nextProvider: TtsProviderId) => {
    setProvider(nextProvider);
    // 默认提供商必须处于启用集合内：设为默认时自动勾上
    setEnabledProviders((current) =>
      current.includes(nextProvider) ? current : [...current, nextProvider],
    );
    setDefaultModel(defaultModelForProvider(nextProvider));
    setError('');
    setStatus('');
  };

  const handleEnabledProviderToggle = (id: TtsProviderId, checked: boolean) => {
    setError('');
    setStatus('');
    if (checked) {
      setEnabledProviders((current) => (current.includes(id) ? current : [...current, id]));
      return;
    }
    // 至少保留一个启用的提供商，取消最后一项时保持原样并提示
    if (enabledProviders.length <= 1) {
      setError('至少需要启用一个 TTS 提供商');
      return;
    }
    const next = enabledProviders.filter((item) => item !== id);
    setEnabledProviders(next);
    // 默认提供商不能落在启用集合之外：取消当前默认项时改选剩下的第一项
    if (provider === id) {
      const nextProvider = next[0];
      setProvider(nextProvider);
      setDefaultModel(defaultModelForProvider(nextProvider));
    }
  };

  const handleSave = async () => {
    if (!canWrite) return;
    if (saving) return;
    const baseUrl = fishBaseUrl.trim();
    const model = defaultModel.trim();
    const edgeUrl = edgeBaseUrl.trim();
    const edgeVoice = edgeDefaultVoice.trim();
    if (!model) {
      setError('默认模型不能为空');
      return;
    }
    if (provider === 'fish') {
      try {
        const parsed = new URL(baseUrl);
        if (
          (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error();
        }
      } catch {
        setError('Fish Audio Base URL 必须是有效的 HTTP 或 HTTPS 地址，且不能包含用户名或密码');
        return;
      }
    }
    if (provider === 'edge') {
      try {
        const parsed = new URL(edgeUrl);
        if (
          (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error();
        }
      } catch {
        setError('微软语音接口地址必须是有效的 ws 或 wss 地址');
        return;
      }
      if (!EDGE_VOICE_ID_PATTERN.test(edgeVoice)) {
        setError('微软语音默认音色格式无效');
        return;
      }
    }

    setSaving(true);
    setError('');
    setStatus('');
    try {
      // 顺序即展示顺序：默认提供商排第一，其余按当前勾选顺序
      const enabledForSave: TtsProviderId[] = [
        provider,
        ...enabledProviders.filter((id) => id !== provider),
      ];
      const savedConfig = await client.save({
        provider,
        enabledProviders: enabledForSave,
        defaultModel: model,
        fish: {
          baseUrl: baseUrl || FISH_DEFAULT_TTS_BASE_URL,
          referenceId: fishReferenceId.trim(),
          apiKey: fishApiKey.trim(),
          modelCurl: fishModelCurl.trim(),
          defaultVoicesCurl: fishDefaultVoicesCurl.trim(),
        },
        edge: {
          baseUrl: edgeUrl || EDGE_DEFAULT_TTS_BASE_URL,
          defaultVoice: edgeVoice || EDGE_DEFAULT_TTS_VOICE,
        },
      });

      const savedSource = unwrapConfig(savedConfig);
      if (isTtsProviderId(savedSource.provider)) {
        applyConfig(normalizeAdminConfig(savedConfig));
      } else {
        try {
          applyConfig(normalizeAdminConfig(await client.load()));
        } catch {
          setFishApiKey('');
          if (fishApiKey.trim()) setApiKeyConfigured(true);
          setStatus('配置已保存，但状态刷新失败；请点击刷新确认当前配置');
          return;
        }
      }
      setStatus('TTS 提供商配置已保存');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 TTS 提供商配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshVoices = async () => {
    if (!canWrite || loading || saving || refreshingVoices) return;
    const refresh = client.refreshVoices;
    if (!refresh) {
      setError('当前环境不支持刷新微软语音音色');
      return;
    }

    setRefreshingVoices(true);
    setError('');
    setStatus('');
    try {
      const result = await refresh();
      const count = isRecord(result) && typeof result.count === 'number' ? result.count : 0;
      try {
        applyConfig(normalizeAdminConfig(await client.load()));
      } catch {
        // 回读失败时仍保留本次刷新的结果，避免状态显示成旧值
        setEdgeVoiceSource('refreshed');
        setEdgeVoiceCount(count);
        if (isRecord(result) && typeof result.updatedAt === 'string') {
          setEdgeVoicesUpdatedAt(result.updatedAt);
        }
      }
      setStatus(`已刷新 ${count} 个音色`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '刷新微软语音音色失败');
    } finally {
      setRefreshingVoices(false);
    }
  };

  return (
    <CollapsibleSection
      title="TTS 提供商与模型"
      description="可同时启用多个提供商（OpenAI / Fish Audio / 微软语音），前端 /tts 会展示这些选项并允许用户切换；默认提供商决定用户未指定时请求的路由，并始终处于启用状态。同时可配置各提供商的服务地址、参考音色与音色清单。"
      sectionKey="ttsProvider"
      isOpen={isOpen}
      onToggle={() => setIsOpen((value) => !value)}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          type="button"
          onClick={(event) => { event.stopPropagation(); void loadConfig(); }}
          disabled={loading || saving}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </m.button>
      }
    >
      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-700">{error}</div> : null}
      {status ? <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">{status}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          当前提供商
          <select
            value={provider}
            onChange={(event) => {
              if (isTtsProviderId(event.target.value)) handleProviderChange(event.target.value);
            }}
            className={`${studioFieldClassName} mt-1`}
            disabled={loading || saving || !canWrite}
          >
            <option value="openai">OpenAI</option>
            <option value="fish">Fish Audio</option>
            <option value="edge">微软语音</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          默认模型
          <input
            list="tts-provider-model-options"
            value={defaultModel}
            onChange={(event) => setDefaultModel(event.target.value)}
            className={`${studioFieldClassName} mt-1 font-mono`}
            disabled={loading || saving || !canWrite}
          />
          <datalist id="tts-provider-model-options">
            {modelOptions.map((model) => <option key={model} value={model} />)}
          </datalist>
          {provider === 'edge' ? (
            <span className="mt-1 block text-xs text-slate-500">微软语音只有固定的一种模型，此处填写其它值也会被服务端忽略。</span>
          ) : null}
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
        <div className="text-sm font-medium text-slate-700">启用的提供商</div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {TTS_PROVIDER_IDS.map((id) => (
            <label key={id} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={enabledProviders.includes(id)}
                onChange={(event) => handleEnabledProviderToggle(id, event.target.checked)}
                className="h-4 w-4"
                disabled={loading || saving || !canWrite}
              />
              {TTS_PROVIDER_LABELS[id]}
              {id === provider ? <span className="text-xs text-slate-500">（默认）</span> : null}
            </label>
          ))}
        </div>
        <span className="mt-2 block text-xs text-slate-500">
          至少启用一个提供商；默认提供商始终处于启用状态，取消勾选它会自动改用剩下的第一个提供商。
        </span>
      </div>

      {provider === 'fish' ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <label className="block text-sm font-medium text-slate-700">
            Fish Audio Base URL
            <input value={fishBaseUrl} onChange={(event) => setFishBaseUrl(event.target.value)} className={`${studioFieldClassName} mt-1 font-mono`} disabled={loading || saving || !canWrite} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Reference ID（管理员配置音色）
            <input value={fishReferenceId} onChange={(event) => setFishReferenceId(event.target.value)} className={`${studioFieldClassName} mt-1 font-mono`} disabled={loading || saving || !canWrite} placeholder="可留空；请求将不指定 reference_id" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            API Key
            <input type="password" value={fishApiKey} onChange={(event) => setFishApiKey(event.target.value)} className={`${studioFieldClassName} mt-1 font-mono`} disabled={loading || saving || !canWrite} autoComplete="new-password" placeholder={apiKeyConfigured ? '已配置；留空保留现有密钥' : '请输入 Fish Audio API Key'} />
            <span className="mt-1 block text-xs text-slate-500">{apiKeyConfigured ? '服务器已保存 API Key。空值不会覆盖现有密钥。' : '尚未配置 API Key。'}</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Fish Audio 模型库请求 curl
            <textarea value={fishModelCurl} onChange={(event) => setFishModelCurl(event.target.value)} className={`${studioFieldClassName} mt-1 min-h-32 font-mono text-xs`} disabled={loading || saving || !canWrite} placeholder="粘贴 GET /model/web 的 Windows curl 命令" />
            <span className="mt-1 block text-xs text-slate-500">保存后后台代发请求；Authorization 在页面回显时会隐藏。</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Fish Audio 默认音色请求 curl
            <textarea value={fishDefaultVoicesCurl} onChange={(event) => setFishDefaultVoicesCurl(event.target.value)} className={`${studioFieldClassName} mt-1 min-h-32 font-mono text-xs`} disabled={loading || saving || !canWrite} placeholder="粘贴 GET /model/default-voices 的 Windows curl 命令" />
          </label>
        </div>
      ) : null}

      {provider === 'edge' ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <label className="block text-sm font-medium text-slate-700">
            微软语音接口地址
            <input value={edgeBaseUrl} onChange={(event) => setEdgeBaseUrl(event.target.value)} className={`${studioFieldClassName} mt-1 font-mono`} disabled={loading || saving || !canWrite} placeholder={EDGE_DEFAULT_TTS_BASE_URL} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            默认音色
            <input value={edgeDefaultVoice} onChange={(event) => setEdgeDefaultVoice(event.target.value)} className={`${studioFieldClassName} mt-1 font-mono`} disabled={loading || saving || !canWrite} placeholder={EDGE_DEFAULT_TTS_VOICE} />
            <span className="mt-1 block text-xs text-slate-500">音色 ID 形如 zh-CN-XiaoxiaoNeural。</span>
          </label>
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {`音色来源：${edgeVoiceSource === 'refreshed' ? '已刷新' : '内置快照'} · 音色数量：${edgeVoiceCount}${edgeVoicesUpdatedAt ? ` · 上次刷新：${new Date(edgeVoicesUpdatedAt).toLocaleString()}` : ''}`}
            </div>
            <m.button
              type="button"
              onClick={() => void handleRefreshVoices()}
              disabled={!canWrite || loading || saving || refreshingVoices}
              className={REFRESH_BUTTON_CLASS}
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`h-4 w-4 ${refreshingVoices ? 'animate-spin' : ''}`} />
              {refreshingVoices ? '刷新中...' : '刷新音色'}
            </m.button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500">{updatedAt ? `上次更新：${new Date(updatedAt).toLocaleString()}` : '尚无更新时间'}</div>
        <m.button type="button" onClick={() => void handleSave()} disabled={loading || saving || !canWrite} className={`${studioPrimaryButtonClassName} disabled:opacity-40 disabled:cursor-not-allowed`} whileTap={{ scale: 0.97 }}>
          {saving ? '保存中...' : '保存配置'}
        </m.button>
      </div>
    </CollapsibleSection>
  );
}