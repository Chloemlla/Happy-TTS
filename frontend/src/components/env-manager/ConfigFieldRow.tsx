import React from 'react';
import { m } from 'framer-motion';
import {
  logSharePrimaryButtonClass,
  logShareDangerButtonClass,
  logShareInputClass,
} from '../LogShareStyleScaffold';

interface ConfigFieldRowProps {
  inputLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  currentLabel?: string;
  currentValue: string;
  loading?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  busy?: boolean;
  onSave: () => void;
  onDelete: () => void;
  isPassword?: boolean;
  extraField?: React.ReactNode;
  /** When true, render current value as an inline bar instead of a column */
  inlineCurrent?: boolean;
  /** When true, disable the input and save/delete buttons (read-only view for non-writer roles) */
  readOnly?: boolean;
}

const ConfigFieldRow: React.FC<ConfigFieldRowProps> = ({
  inputLabel,
  value,
  onChange,
  placeholder,
  currentLabel = '当前配置（脱敏）',
  currentValue,
  loading = false,
  isSaving = false,
  isDeleting = false,
  busy = false,
  onSave,
  onDelete,
  isPassword = false,
  extraField,
  inlineCurrent = false,
  readOnly = false,
}) => {
  const disabled = busy || readOnly;

  if (inlineCurrent) {
    return (
      <div className="space-y-3">
        {extraField}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">{inputLabel}</label>
          <input
            type={isPassword ? 'password' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={logShareInputClass}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            readOnly={readOnly}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
          {currentLabel}：{loading ? '加载中...' : currentValue || '未设置'}
        </div>
        <div className="flex items-center justify-end gap-3">
          <m.button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className={logShareDangerButtonClass}
            whileTap={{ scale: 0.97 }}
          >
            {isDeleting ? '删除中...' : '删除'}
          </m.button>
          <m.button
            type="button"
            onClick={onSave}
            disabled={disabled}
            className={logSharePrimaryButtonClass}
            whileTap={{ scale: 0.97 }}
          >
            {isSaving ? '保存中...' : '保存/更新'}
          </m.button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {extraField}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">{inputLabel}</label>
          <input
            type={isPassword ? 'password' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={logShareInputClass}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            readOnly={readOnly}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{currentLabel}</label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 min-h-[48px] flex items-center">
            {loading ? '加载中...' : currentValue || '未设置'}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <m.button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className={logShareDangerButtonClass}
          whileTap={{ scale: 0.97 }}
        >
          {isDeleting ? '删除中...' : '删除'}
        </m.button>
        <m.button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className={logSharePrimaryButtonClass}
          whileTap={{ scale: 0.97 }}
        >
          {isSaving ? '保存中...' : '保存/更新'}
        </m.button>
      </div>
    </div>
  );
};

export default ConfigFieldRow;