import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import ConfigFieldRow from './ConfigFieldRow';
import { logShareInputClass } from '../LogShareStyleScaffold';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400';

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
  const extraFieldNode = extraField ? (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{extraField.label}</label>
      <input
        value={extraField.value}
        onChange={(event) => extraField.onChange(event.target.value)}
        placeholder={extraField.placeholder}
        className={logShareInputClass}
      />
    </div>
  ) : undefined;

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
      <ConfigFieldRow
        inputLabel={inputLabel}
        value={inputValue}
        onChange={onInputChange}
        placeholder={inputPlaceholder}
        currentLabel={currentLabel}
        currentValue={currentValue || '未设置'}
        loading={loading}
        isSaving={saving}
        isDeleting={deleting}
        onSave={onSave}
        onDelete={onDelete}
        isPassword
        extraField={extraFieldNode}
        inlineCurrent={!!extraField}
      />
      <div className="mt-4 text-xs text-slate-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}