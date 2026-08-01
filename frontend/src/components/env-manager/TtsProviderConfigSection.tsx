import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import {
  FISH_DEFAULT_TTS_BASE_URL,
  FISH_DEFAULT_TTS_MODEL,
  OPENAI_DEFAULT_TTS_MODEL,
  OPENAI_TTS_MODELS,
} from '../../utils/ttsProviderConfig';
import type { TtsProviderId } from '../../types/tts';
import CollapsibleSection from './CollapsibleSection';
import { TTS_PROVIDER_ADMIN_API, getAuthHeaders } from './api';
import type {
  TtsProviderAdminConfig,
  TtsProviderAdminUpdate,
} from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const FIELD_CLASS =
  'w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapConfig(payload: unknown, depth = 0): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  if (payload.provider === 'openai' || payload.provider === 'fish') return payload;
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
  if (source.provider !== 'openai' && source.provider !== 'fish') {
    throw new Error('TTS 提供商配置响应缺少有效的 provider 字段');
  }
  const provider: TtsProviderId = source.provider === 'fish' ? 'fish' : 'openai';
  const fish = isRecord(source.fish) ? source.fish : {};
  const configuredDefaultModel =
    typeof source.defaultModel === 'string' ? source.defaultModel.trim() : '';
  const hasProviderMismatch = provider === 'fish'
    ? OPENAI_TTS_MODELS.some((option) => option.id === configuredDefaultModel)
    : configuredDefaultModel === FISH_DEFAULT_TTS_MODEL;
  const providerDefaultModel = provider === 'fish'
    ? FISH_DEFAULT_TTS_MODEL
    : OPENAI_DEFAULT_TTS_MODEL;
  const defaultModel = configuredDefaultModel && !hasProviderMismatch
    ? configuredDefaultModel
    : providerDefaultModel;

  return {
    provider,
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
};

interface TtsProviderConfigSectionProps {
  prefersReducedMotion?: boolean | null;
  client?: TtsProviderAdminClient;
}

export default function TtsProviderConfigSection({
  prefersReducedMotion,
  client = defaultClient,
}: TtsProviderConfigSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasRequestedLoad = useRef(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<TtsProviderId>('openai');
  const [defaultModel, setDefaultModel] = useState(OPENAI_DEFAULT_TTS_MODEL);
  const [fishBaseUrl, setFishBaseUrl] = useState(FISH_DEFAULT_TTS_BASE_URL);
  const [fishReferenceId, setFishReferenceId] = useState('');
  const [fishApiKey, setFishApiKey] = useState('');
  const [fishModelCurl, setFishModelCurl] = useState('');
  const [fishDefaultVoicesCurl, setFishDefaultVoicesCurl] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const applyConfig = useCallback((config: TtsProviderAdminConfig) => {
    setProvider(config.provider);
    setDefaultModel(config.defaultModel);
    setFishBaseUrl(config.fish.baseUrl);
    setFishReferenceId(config.fish.referenceId);
    setApiKeyConfigured(config.fish.apiKeyConfigured);
    setFishModelCurl(config.fish.modelCurl);
    setFishDefaultVoicesCurl(config.fish.defaultVoicesCurl);
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
      : [FISH_DEFAULT_TTS_MODEL];
    return options.includes(defaultModel) ? options : [defaultModel, ...options];
  }, [defaultModel, provider]);

  const handleProviderChange = (nextProvider: TtsProviderId) => {
    setProvider(nextProvider);
    setDefaultModel(nextProvider === 'fish' ? FISH_DEFAULT_TTS_MODEL : OPENAI_DEFAULT_TTS_MODEL);
    setError('');
    setStatus('');
  };

  const handleSave = async () => {
    if (saving) return;
    const baseUrl = fishBaseUrl.trim();
    const model = defaultModel.trim();
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

    setSaving(true);
    setError('');
    setStatus('');
    try {
      const savedConfig = await client.save({
        provider,
        defaultModel: model,
        fish: {
          baseUrl: baseUrl || FISH_DEFAULT_TTS_BASE_URL,
          referenceId: fishReferenceId.trim(),
          apiKey: fishApiKey.trim(),
          modelCurl: fishModelCurl.trim(),
          defaultVoicesCurl: fishDefaultVoicesCurl.trim(),
        },
      });

      const savedSource = unwrapConfig(savedConfig);
      if (savedSource.provider === 'openai' || savedSource.provider === 'fish') {
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

  return (
    <CollapsibleSection
      title="TTS 提供商与模型"
      description="选择当前语音提供商、默认模型，并配置 Fish Audio 的服务地址与参考音色。"
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
      {error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {status ? <div role="status" className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">{status}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          当前提供商
          <select
            value={provider}
            onChange={(event) => handleProviderChange(event.target.value === 'fish' ? 'fish' : 'openai')}
            className={`${FIELD_CLASS} mt-1`}
            disabled={loading || saving}
          >
            <option value="openai">OpenAI</option>
            <option value="fish">Fish Audio</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-foreground">
          默认模型
          <input
            list="tts-provider-model-options"
            value={defaultModel}
            onChange={(event) => setDefaultModel(event.target.value)}
            className={`${FIELD_CLASS} mt-1 font-mono`}
            disabled={loading || saving}
          />
          <datalist id="tts-provider-model-options">
            {modelOptions.map((model) => <option key={model} value={model} />)}
          </datalist>
        </label>
      </div>

      {provider === 'fish' ? (
        <div className="space-y-4 rounded-md border border-border bg-muted/50 p-4">
          <label className="block text-sm font-medium text-foreground">
            Fish Audio Base URL
            <input value={fishBaseUrl} onChange={(event) => setFishBaseUrl(event.target.value)} className={`${FIELD_CLASS} mt-1 font-mono`} disabled={loading || saving} />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Reference ID（管理员配置音色）
            <input value={fishReferenceId} onChange={(event) => setFishReferenceId(event.target.value)} className={`${FIELD_CLASS} mt-1 font-mono`} disabled={loading || saving} placeholder="可留空；请求将不指定 reference_id" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            API Key
            <input type="password" value={fishApiKey} onChange={(event) => setFishApiKey(event.target.value)} className={`${FIELD_CLASS} mt-1 font-mono`} disabled={loading || saving} autoComplete="new-password" placeholder={apiKeyConfigured ? '已配置；留空保留现有密钥' : '请输入 Fish Audio API Key'} />
            <span className="mt-1 block text-xs text-muted-foreground">{apiKeyConfigured ? '服务器已保存 API Key。空值不会覆盖现有密钥。' : '尚未配置 API Key。'}</span>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Fish Audio 模型库请求 curl
            <textarea value={fishModelCurl} onChange={(event) => setFishModelCurl(event.target.value)} className={`${FIELD_CLASS} mt-1 min-h-32 font-mono text-xs`} disabled={loading || saving} placeholder="粘贴 GET /model/web 的 Windows curl 命令" />
            <span className="mt-1 block text-xs text-muted-foreground">保存后后台代发请求；Authorization 在页面回显时会隐藏。</span>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Fish Audio 默认音色请求 curl
            <textarea value={fishDefaultVoicesCurl} onChange={(event) => setFishDefaultVoicesCurl(event.target.value)} className={`${FIELD_CLASS} mt-1 min-h-32 font-mono text-xs`} disabled={loading || saving} placeholder="粘贴 GET /model/default-voices 的 Windows curl 命令" />
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">{updatedAt ? `上次更新：${new Date(updatedAt).toLocaleString()}` : '尚无更新时间'}</div>
        <m.button type="button" onClick={() => void handleSave()} disabled={loading || saving} className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" whileTap={{ scale: 0.96 }}>
          {saving ? '保存中...' : '保存配置'}
        </m.button>
      </div>
    </CollapsibleSection>
  );
}
