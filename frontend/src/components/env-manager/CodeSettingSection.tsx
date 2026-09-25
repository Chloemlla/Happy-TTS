import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import ConfigFieldRow from './ConfigFieldRow';
import { studioPrimaryButtonClassName } from '../studioTheme';

const REFRESH_BUTTON_CLASS = studioPrimaryButtonClassName;

interface CodeSettingSectionProps {
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
  disabled?: boolean;
}

export default function CodeSettingSection({
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
  disabled = false,
}: CodeSettingSectionProps) {
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
        readOnly={disabled}
      />
      <div className="mt-4 text-xs text-slate-500">
        最后更新时间：{updatedAt ? new Date(updatedAt).toLocaleString() : '-'}
      </div>
    </CollapsibleSection>
  );
}