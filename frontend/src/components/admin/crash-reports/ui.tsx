import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaCheck, FaChevronDown, FaChevronUp, FaCopy, FaDownload } from 'react-icons/fa';
import { useNotification } from '@/components/Notification';
import { isAppFrame } from './format';

/** navigator.clipboard is unavailable on plain-HTTP admin hosts, hence the fallback. */
const writeClipboard = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

export const useCopyAction = () => {
  const { setNotification } = useNotification();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const run = useCallback(async (value: string, message?: string) => {
    if (!value) {
      setNotification({ message: '没有可复制的内容', type: 'warning' });
      return;
    }
    if (!(await writeClipboard(value))) {
      setNotification({ message: '复制失败，请检查浏览器剪贴板权限', type: 'error' });
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    if (message) setNotification({ message, type: 'success' });
  }, [setNotification]);

  return { copied, run };
};

const chipButtonClass =
  'inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

export const CopyButton: React.FC<{
  getValue: () => string;
  label: string;
  message?: string;
  title?: string;
  className?: string;
}> = ({ getValue, label, message = '已复制到剪贴板', title, className = '' }) => {
  const { copied, run } = useCopyAction();
  return (
    <button
      type="button"
      title={title || label}
      onClick={() => void run(getValue(), message)}
      className={`${chipButtonClass} ${copied ? 'border-emerald-200 text-emerald-700' : ''} ${className}`}
    >
      {copied ? <FaCheck /> : <FaCopy />}
      {copied ? '已复制' : label}
    </button>
  );
};

export const CopyIconButton: React.FC<{ getValue: () => string; title: string }> = ({ getValue, title }) => {
  const { copied, run } = useCopyAction();
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => void run(getValue())}
      className={`shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
        copied ? 'text-emerald-600' : ''
      }`}
    >
      {copied ? <FaCheck className="h-3 w-3" /> : <FaCopy className="h-3 w-3" />}
    </button>
  );
};

export const DownloadButton: React.FC<{
  onDownload: () => void;
  label: string;
  className?: string;
}> = ({ onDownload, label, className = '' }) => (
  <button type="button" title={label} onClick={onDownload} className={`${chipButtonClass} ${className}`}>
    <FaDownload />
    {label}
  </button>
);

export const FilterChip: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
      active
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300'
    }`}
  >
    {label}
  </button>
);

export const ToolbarSelect: React.FC<{
  value: string | number;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string | number; label: string }>;
  title: string;
}> = ({ value, onChange, options, title }) => (
  <select
    value={value}
    title={title}
    aria-label={title}
    onChange={(event) => onChange(event.target.value)}
    className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const preClass =
  'mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-white/80 p-3 text-xs leading-5 backdrop-blur-xl';

/** Frames from the crashing app are what an admin scans for first. */
export const StackPre: React.FC<{ text: string; packageName?: string; maxLines?: number }> = ({
  text,
  packageName,
  maxLines,
}) => {
  const lines = text.split('\n');
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  return (
    <pre className={preClass}>
      {shown.map((line, index) => (
        <span
          key={`${index}-${line.slice(0, 24)}`}
          className={isAppFrame(line, packageName) ? 'block bg-amber-50 font-semibold text-amber-900' : 'block'}
        >
          {line || ' '}
        </span>
      ))}
      {maxLines && lines.length > maxLines ? (
        <span className="block text-slate-400">… 其余 {lines.length - maxLines} 行已折叠</span>
      ) : null}
    </pre>
  );
};

export const DetailField: React.FC<{
  label: string;
  value?: React.ReactNode;
  copyValue?: string;
  hint?: string;
}> = ({ label, value, copyValue, hint }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="group flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <span className="text-slate-500">{label}：</span>
        <span className="break-all text-slate-700" title={hint}>{value}</span>
      </div>
      {copyValue ? (
        <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <CopyIconButton getValue={() => copyValue} title={`复制${label}`} />
        </span>
      ) : null}
    </div>
  );
};

export const CollapsibleBlock: React.FC<{
  label: string;
  value: string;
  packageName?: string;
  defaultOpen?: boolean;
  onDownload?: () => void;
}> = ({ label, value, packageName, defaultOpen = false, onDownload }) => {
  const [open, setOpen] = useState(defaultOpen);
  const lineCount = value ? value.split('\n').length : 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-700"
        >
          {open ? <FaChevronUp /> : <FaChevronDown />}
          {label}
          <span className="text-slate-400">({lineCount} 行)</span>
        </button>
        <CopyButton getValue={() => value} label={`复制${label}`} message={`已复制${label}`} />
        {onDownload ? <DownloadButton onDownload={onDownload} label="下载" /> : null}
      </div>
      {open ? <StackPre text={value} packageName={packageName} /> : null}
    </div>
  );
};
