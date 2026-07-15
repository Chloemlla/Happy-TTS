import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

interface SecretKeySectionProps {
  title: string;
  description: string;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion?: boolean | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  inputLabel: string;
  inputValue: string;
  inputPlaceholder: string;
  currentLabel?: string;
  currentValue?: string;
  updatedAt?: string;
  onInputChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onDelete: () => void;
  extraField?: {
    label: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  };
}

export default function SecretKeySection({
  title,
  description,
  sectionKey,
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  deleting,
  inputLabel,
  inputValue,
  inputPlaceholder,
  currentLabel = '当前配置（脱敏）',
  currentValue,
  updatedAt,
  onInputChange,
  onRefresh,
  onSave,
  onDelete,
  extraField,
}: SecretKeySectionProps) {
  return (
    <CollapsibleSection
      title={title}
      description={description}
      sectionKey={sectionKey}
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
      <div className={`grid grid-cols-1 ${extraField ? 'md:grid-cols-3' : 'md:grid-cols-3'} gap-4 mb-4`}>
        {extraField ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{extraField.label}</label>
            <input
              value={extraField.value}
              onChange={(event) => extraField.onChange(event.target.value)}
              placeholder={extraField.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
            />
          </div>
        ) : null}
        <div className={extraField ? 'md:col-span-2' : 'md:col-span-2'}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{inputLabel}</label>
          <input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={inputPlaceholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
          />
        </div>
        {!extraField ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{currentLabel}</label>
            <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center">
              {loading ? '加载中...' : currentValue || '未设置'}
            </div>
          </div>
        ) : null}
      </div>

      {extraField ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          当前配置：{loading ? '加载中...' : currentValue || '未设置'}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <m.button
          onClick={onDelete}
          disabled={deleting}
          className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium"
          whileTap={{ scale: 0.96 }}
        >
          {deleting ? '删除中...' : '删除'}
        </m.button>
        <m.button
          onClick={onSave}
          disabled={saving}
          className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
          whileTap={{ scale: 0.96 }}
        >
          {saving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}
