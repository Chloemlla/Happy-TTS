import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { FaSlidersH, FaSync } from 'react-icons/fa';
import { useNotification } from '../Notification';
import { useAuth } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/rbac';
import CollapsibleSection from './CollapsibleSection';
import ConfigFieldRow from './ConfigFieldRow';
import InfoBox from './InfoBox';
import { API_URL, getAuthHeaders, authFetch } from './api';
import { decryptAES256 } from './utils';
import { getBackendErrorMessage } from '../../utils/backendError';

const SECTION_KEY = 'mediaTool';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

interface MediaToolEnvField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  secret?: boolean;
}

interface MediaToolEnvGroup {
  title: string;
  fields: MediaToolEnvField[];
}

/**
 * 语音转文本 / 媒体工具(media-tool)的环境变量清单。
 *
 * 只列「换一台机器就必须不一样」的项:总开关、接口地址与身份密钥、落盘目录。
 * 其余参数(语种/场景/产物默认/并发/重试/断点续传/上传上限/用户页限额)写死在
 * src/mediaTool/types.ts;要调它们走「管理后台 → 媒体工具 → 设置」(存数据库)。键名与后端
 * defaultMediaToolSettings() / explicitEnvLayer() 一一对应。
 */
export const MEDIA_TOOL_ENV_GROUPS: MediaToolEnvGroup[] = [
  {
    title: '开关与目录',
    fields: [
      { key: 'MEDIA_TOOL_DISABLED', label: '总开关', description: '填 1 停用整个媒体工具（含用户页「语音转文本」）。留空或 0 为启用。', placeholder: '0 或 1' },
      { key: 'MEDIA_TOOL_WORK_DIR', label: '工作目录', description: '文件浏览/上传/转写的根目录；留空=进程目录下 data/media-tool。用户目录锁在它内部的 users/<用户> 下。', placeholder: '/srv/media-tool' },
      { key: 'MEDIA_TOOL_DOWNLOAD_DIR', label: '下载目录', description: 'yt-dlp 落盘目录；留空=与工作目录相同。', placeholder: '/srv/media-tool/download' },
    ],
  },
  {
    title: '识别引擎（vivo LASR）',
    fields: [
      { key: 'MEDIA_TOOL_LASR_URL', label: '接口地址', description: 'LASR 服务地址，默认 https://asr-v2.vivo.com.cn。', placeholder: 'https://asr-v2.vivo.com.cn' },
      { key: 'MEDIA_TOOL_APP_ID', label: 'AppId', description: '网关 appid，默认 8735273056（录音机客户端）。', placeholder: '8735273056' },
      { key: 'MEDIA_TOOL_APP_KEY', label: 'AppKey（签名密钥）', description: 'X-AI-GATEWAY 签名用的 HMAC 密钥，与 AppId 成对。', placeholder: '请输入 AppKey', secret: true },
    ],
  },
  {
    title: 'vivo 账号（可选）',
    fields: [
      { key: 'MEDIA_TOOL_VIVO_TOKEN', label: 'token', description: 'vivo 账号 token。留空走未登录路径（默认可用）。', placeholder: '请输入 token', secret: true },
      { key: 'MEDIA_TOOL_VIVO_OPENID', label: 'openid', description: 'vivo 账号 openid，与 token 配套。', placeholder: '请输入 openid', secret: true },
    ],
  },
  {
    title: 'B 站下载（yt-dlp）',
    fields: [
      { key: 'MEDIA_TOOL_YTDLP', label: 'yt-dlp 路径', description: '留空自动探测 PATH；Windows 服机常需给绝对路径。', placeholder: 'yt-dlp' },
      { key: 'MEDIA_TOOL_COOKIES', label: 'cookies 文件', description: '下载需登录/会员内容时的 Netscape cookies 文件路径。', placeholder: '/srv/cookies.txt' },
    ],
  },
];

const ALL_FIELDS = MEDIA_TOOL_ENV_GROUPS.flatMap((group) => group.fields);

function normalizeEnvKey(rawKey: string): string {
  const parts = rawKey.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : rawKey;
}

function maskValue(value: string, secret?: boolean): string {
  if (!value) return '未设置';
  if (!secret) return value;
  if (value.length <= 8) return '已设置';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export interface MediaToolConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}

/**
 * 「语音转文本 / 媒体工具」环境变量面板。
 *
 * 与其它面板同一套 /api/admin/envs 读写:保存即写入运行时环境并生效。
 * 显式写了值的环境变量是最终权威,会覆盖「媒体工具 → 设置」页保存在库里的同名项。
 */
export default function MediaToolConfigSection({
  isOpen,
  onToggle,
  loading,
  onRefresh,
  disabled = false,
}: MediaToolConfigSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const canWrite = isSuperAdmin(user?.role);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchValues = useCallback(async () => {
    setFetching(true);
    try {
      const res = await authFetch(API_URL, { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      const next: Record<string, string> = {};
      if (res.ok && data) {
        let envList: Array<{ key: string; value: unknown }> = [];
        if (typeof data.data === 'string' && data.data && typeof data.iv === 'string' && data.iv) {
          if (!user?.id) {
            setNotification({ message: '缺少用户标识，无法解密数据', type: 'error' });
            return;
          }
          try {
            const parsed = JSON.parse(decryptAES256(data.data, data.iv, user.id));
            if (Array.isArray(parsed)) envList = parsed;
          } catch {
            // 解密失败保留现有展示,不阻塞保存
          }
        } else if (Array.isArray(data.envs)) {
          envList = data.envs;
        } else if (data.envs && typeof data.envs === 'object') {
          envList = Object.entries(data.envs).map(([key, value]) => ({ key, value }));
        }
        for (const field of ALL_FIELDS) {
          const item = envList.find((entry) => normalizeEnvKey(String(entry.key)).toUpperCase() === field.key);
          const raw = item?.value;
          if (typeof raw === 'string' && raw.trim()) next[field.key] = raw;
        }
      }
      setCurrent(next);
    } catch {
      // 读取失败不阻塞保存/删除
    } finally {
      setFetching(false);
    }
  }, [setNotification, user?.id]);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetchValues();
    }
  }, [isOpen, fetchValues]);

  const handleRefresh = useCallback(() => {
    fetchedRef.current = true;
    void fetchValues();
    onRefresh();
  }, [fetchValues, onRefresh]);

  const handleSave = useCallback(
    async (field: MediaToolEnvField) => {
      if (!canWrite || savingKey) return;
      const value = (inputs[field.key] || '').trim();
      if (!value) {
        setNotification({ message: '请填写值后再保存', type: 'error' });
        return;
      }
      setSavingKey(field.key);
      try {
        const res = await authFetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ key: field.key, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotification({ message: data?.error || `保存 ${field.key} 失败`, type: 'error' });
          return;
        }
        setNotification({ message: `${field.label} 已保存并写入运行时配置`, type: 'success' });
        setInputs((prev) => ({ ...prev, [field.key]: '' }));
        await fetchValues();
        onRefresh();
      } catch (error) {
        setNotification({ message: `保存失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
      } finally {
        setSavingKey(null);
      }
    },
    [canWrite, inputs, savingKey, fetchValues, onRefresh, setNotification],
  );

  const handleDelete = useCallback(
    async (field: MediaToolEnvField) => {
      if (!canWrite || deletingKey) return;
      if (!window.confirm(`确定删除环境变量「${field.key}」？该配置会回落到设置页或内置默认值。`)) return;
      setDeletingKey(field.key);
      try {
        const res = await authFetch(API_URL, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ key: field.key }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotification({ message: data?.error || `删除 ${field.key} 失败`, type: 'error' });
          return;
        }
        setNotification({ message: `${field.label} 已删除`, type: 'success' });
        setInputs((prev) => ({ ...prev, [field.key]: '' }));
        await fetchValues();
        onRefresh();
      } catch (error) {
        setNotification({ message: `删除失败：${getBackendErrorMessage(error, '未知错误')}`, type: 'error' });
      } finally {
        setDeletingKey(null);
      }
    },
    [canWrite, deletingKey, fetchValues, onRefresh, setNotification],
  );

  const refreshing = fetching || loading;
  const busy = savingKey !== null || deletingKey !== null;

  return (
    <CollapsibleSection
      title="语音转文本与媒体工具"
      description="转写引擎、产物与并发、用户页限额、下载工具的环境变量。保存即写入运行时配置并生效。"
      sectionKey={SECTION_KEY}
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRefresh();
          }}
          disabled={refreshing}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <InfoBox icon={<FaSlidersH />}>
        <p>
          这里只放<strong>换机器就得改</strong>的环境变量（开关、接口地址与密钥、目录）。其余参数写死在代码里，
          要调请去「管理后台 → 媒体工具 → 设置」（存数据库）：语种、场景、默认产物、文件/分片并发、单片重试、
          断点续传、上传上限、用户页限额。
        </p>
        <p className="mt-1">
          显式写了值的环境变量是最终权威：它会覆盖设置页存在库里的同名项
          （<code className="rounded bg-white/80 px-1">MEDIA_TOOL_APP_KEY</code> 等密钥类只应在这里改）。
          删除某一项即回落到设置页/内置默认值。
        </p>
      </InfoBox>

      {MEDIA_TOOL_ENV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">{group.title}</h4>
          {group.fields.map((field) => (
            <div key={field.key} className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{field.label}</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{field.key}</code>
              </div>
              <p className="mt-1 mb-3 text-xs text-slate-500">{field.description}</p>
              <ConfigFieldRow
                inputLabel="新值"
                value={inputs[field.key] || ''}
                onChange={(v) => setInputs((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={field.placeholder}
                currentLabel="当前配置"
                currentValue={maskValue(current[field.key] || '', field.secret)}
                loading={fetching}
                isSaving={savingKey === field.key}
                isDeleting={deletingKey === field.key}
                busy={busy}
                onSave={() => void handleSave(field)}
                onDelete={() => void handleDelete(field)}
                isPassword={Boolean(field.secret)}
                readOnly={disabled}
              />
            </div>
          ))}
        </div>
      ))}
    </CollapsibleSection>
  );
}
