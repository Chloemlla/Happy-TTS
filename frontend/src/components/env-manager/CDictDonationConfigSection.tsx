import { m } from 'framer-motion';
import { FaSync, FaTrash } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

export interface CDictDonationChannelDraft {
  id: string;
  name: string;
  hint: string;
  enabled: boolean;
  imageUrl: string;
}

interface CDictDonationConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  readOnly?: boolean;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  enabled: boolean;
  notice: string;
  channels: CDictDonationChannelDraft[];
  previewBaseUrl: string;
  updatedAt?: string;
  onEnabledChange: (value: boolean) => void;
  onNoticeChange: (value: string) => void;
  onChannelChange: (index: number, patch: Partial<CDictDonationChannelDraft>) => void;
  onChannelRemove: (index: number) => void;
  onChannelAdd: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';
const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400';

export default function CDictDonationConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  readOnly = false,
  loading,
  saving,
  deleting,
  enabled,
  notice,
  channels,
  previewBaseUrl,
  updatedAt,
  onEnabledChange,
  onNoticeChange,
  onChannelChange,
  onChannelRemove,
  onChannelAdd,
  onRefresh,
  onSave,
  onReset,
}: CDictDonationConfigSectionProps) {
  const isDisabled = saving || deleting || readOnly;

  return (
    <CollapsibleSection
      title="CDict 赞赏码配置"
      description="配置 CDict 客户端赞赏页的说明文案与收款渠道。客户端每次打开赞赏页都实时拉取 /api/cdict/donate，安装包内不内置任何收款信息，改图改文案无需发版。"
      sectionKey="cdictDonation"
      isOpen={isOpen}
      onToggle={onToggle}
      prefersReducedMotion={prefersReducedMotion}
      headerRight={
        <m.button
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className={REFRESH_BUTTON_CLASS}
          whileTap={{ scale: 0.95 }}
        >
          <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </m.button>
      }
    >
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs leading-5 text-emerald-900">
        <p>
          图片地址留空时，服务端使用内置资源
          <code className="mx-1 rounded bg-white/80 px-1">src/assets/donation/&lt;渠道 id&gt;.(png|jpg)</code>
          ；填写后必须是 https 直链，由服务端代取并缓存 10 分钟，取不到时自动回落到内置图片。
        </p>
        <p className="mt-1">渠道 id 只允许小写字母、数字和连字符，最多 8 个渠道；客户端按 id 请求图片。</p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          disabled={readOnly}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span>
          对客户端开放赞赏页
          <span className="mt-1 block text-xs text-gray-500">
            取消勾选后 /api/cdict/donate 返回 404，客户端赞赏页显示"暂不可用"。
          </span>
        </span>
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">说明文案（最多 200 字）</label>
        <textarea
          value={notice}
          onChange={(event) => onNoticeChange(event.target.value)}
          disabled={readOnly}
          rows={2}
          maxLength={200}
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-3">
        {channels.map((channel, index) => (
          <div key={`${channel.id}-${index}`} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">渠道 id</label>
                <input
                  value={channel.id}
                  onChange={(event) => onChannelChange(index, { id: event.target.value })}
                  disabled={readOnly}
                  placeholder="alipay"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">显示名称</label>
                <input
                  value={channel.name}
                  onChange={(event) => onChannelChange(index, { name: event.target.value })}
                  disabled={readOnly}
                  placeholder="支付宝"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">扫码提示</label>
                <input
                  value={channel.hint}
                  onChange={(event) => onChannelChange(index, { hint: event.target.value })}
                  disabled={readOnly}
                  placeholder="打开支付宝扫一扫"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">图片地址（留空用内置图片）</label>
              <input
                value={channel.imageUrl}
                onChange={(event) => onChannelChange(index, { imageUrl: event.target.value })}
                disabled={readOnly}
                placeholder="https://example.com/qr.png"
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT_CLASS} font-mono text-xs`}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={(event) => onChannelChange(index, { enabled: event.target.checked })}
                  disabled={readOnly}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                启用该渠道
              </label>
              <div className="flex items-center gap-3">
                {channel.id ? (
                  <a
                    href={`${previewBaseUrl}/${channel.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-emerald-700 underline"
                  >
                    预览当前生效图片
                  </a>
                ) : null}
                <m.button
                  onClick={() => onChannelRemove(index)}
                  disabled={isDisabled || channels.length <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  whileTap={{ scale: 0.96 }}
                >
                  <FaTrash className="h-3 w-3" /> 删除
                </m.button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <m.button
          onClick={onChannelAdd}
          disabled={isDisabled || channels.length >= 8}
          className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          whileTap={{ scale: 0.96 }}
        >
          新增渠道
        </m.button>
        <div className="flex items-center gap-3">
          <m.button
            onClick={onReset}
            disabled={isDisabled}
            className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
            whileTap={{ scale: 0.96 }}
          >
            {deleting ? '重置中...' : '重置为默认'}
          </m.button>
          <m.button
            onClick={onSave}
            disabled={isDisabled}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
            whileTap={{ scale: 0.96 }}
          >
            {saving ? '保存中...' : '保存/更新'}
          </m.button>
        </div>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}
