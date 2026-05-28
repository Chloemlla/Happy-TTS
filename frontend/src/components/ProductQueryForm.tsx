import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AntiCounterfeitError, ProductQueryParams } from '../types/anta';
import { FaBarcode, FaFileAlt, FaLink, FaRulerCombined, FaSearch, FaTag, FaTimes, FaTrash } from 'react-icons/fa';
import { InfoPrimaryButton } from './InfoQueryScaffold';

interface ProductQueryFormProps {
  onQuery: (params: ProductQueryParams) => void;
  loading: boolean;
  error: AntiCounterfeitError | null;
}

const inputFields = [
  {
    key: 'barcode' as keyof ProductQueryParams,
    label: '条码',
    placeholder: '请输入条码（必填，如：BRA047EBXF）',
    required: true,
    icon: FaBarcode,
  },
  {
    key: 'itemNumber' as keyof ProductQueryParams,
    label: '货号',
    placeholder: '请输入货号（选填，如：112535584-1）',
    required: false,
    icon: FaTag,
  },
  {
    key: 'ean' as keyof ProductQueryParams,
    label: 'EAN 码',
    placeholder: '请输入 EAN 码（选填，如：2000000134554）',
    required: false,
    icon: FaFileAlt,
  },
  {
    key: 'size' as keyof ProductQueryParams,
    label: '尺码',
    placeholder: '请输入尺码（选填，如：11）',
    required: false,
    icon: FaRulerCombined,
  },
];

const ProductQueryForm: React.FC<ProductQueryFormProps> = ({
  onQuery,
  loading,
  error,
}) => {
  const [formData, setFormData] = useState<ProductQueryParams>({
    barcode: '',
    itemNumber: '',
    ean: '',
    size: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const validateForm = (): string | null => {
    if (!formData.barcode.trim()) {
      return '请输入条码';
    }

    const barcodePattern = /^[a-zA-Z0-9\-_]{3,50}$/;
    if (!barcodePattern.test(formData.barcode.trim())) {
      return '条码格式不正确，请输入有效的条码';
    }

    return null;
  };

  const canSubmit = !!formData.barcode.trim() && !validationError && !loading;

  const handleInputChange = (field: keyof ProductQueryParams, value: string) => {
    const newFormData = {
      ...formData,
      [field]: value,
    };

    setFormData(newFormData);

    if (field === 'barcode') {
      if (!value.trim()) {
        setValidationError('请输入条码');
        return;
      }

      const barcodePattern = /^[a-zA-Z0-9\-_]{3,50}$/;
      setValidationError(barcodePattern.test(value.trim()) ? null : '条码格式不正确，请输入有效的条码');
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const formError = validateForm();

    if (formError) {
      setValidationError(formError);
      barcodeRef.current?.focus();
      return;
    }

    setValidationError(null);
    onQuery({
      barcode: formData.barcode.trim(),
      itemNumber: formData.itemNumber?.trim(),
      ean: formData.ean?.trim(),
      size: formData.size?.trim(),
    });
  };

  const parseAntaUrl = (url: string): ProductQueryParams | null => {
    try {
      const urlPattern = /https?:\/\/ascm\.anta\.com\/consumer\/innerbox\/search\?code=([^&]*)&([^&]*)&([^&]*)&([^&]*)&CN/;
      const match = url.match(urlPattern);

      if (match) {
        const [, itemNumber, size, ean, barcode] = match;
        return {
          barcode: decodeURIComponent(barcode || ''),
          itemNumber: decodeURIComponent(itemNumber || '') || undefined,
          ean: decodeURIComponent(ean || '') || undefined,
          size: decodeURIComponent(size || '') || undefined,
        };
      }

      const simplePattern = /code=([^&]+)&([^&]+)&([^&]+)&([^&]+)/;
      const simpleMatch = url.match(simplePattern);

      if (simpleMatch) {
        const [, itemNumber, size, ean, barcode] = simpleMatch;
        return {
          barcode: decodeURIComponent(barcode || ''),
          itemNumber: decodeURIComponent(itemNumber || '') || undefined,
          ean: decodeURIComponent(ean || '') || undefined,
          size: decodeURIComponent(size || '') || undefined,
        };
      }

      return null;
    } catch (parseError) {
      console.error('解析URL失败:', parseError);
      return null;
    }
  };

  const handleImportUrl = () => {
    const parsedData = parseAntaUrl(importUrl);

    if (parsedData?.barcode) {
      setFormData(parsedData);
      setValidationError(null);
      setShowImportDialog(false);
      setImportUrl('');
      window.setTimeout(() => barcodeRef.current?.focus(), 100);
      return;
    }

    setValidationError('无法解析URL，请检查URL格式是否正确');
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        return;
      }

      const text = await navigator.clipboard.readText();
      if (!text || typeof text !== 'string') {
        return;
      }

      const url = new URL(text);
      if (url.hostname === 'ascm.anta.com' && url.protocol === 'https:') {
        setImportUrl(text);
      }
    } catch (_) {
      // 剪贴板或 URL 解析失败时保持当前输入。
    }
  };

  const handleClear = () => {
    setFormData({
      barcode: '',
      itemNumber: '',
      ean: '',
      size: '',
    });
    setValidationError(null);
    setFocusedField(null);
    barcodeRef.current?.focus();
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {inputFields.map((field) => {
            const Icon = field.icon;
            const isFocused = focusedField === field.key;
            const hasFieldError = field.key === 'barcode' && !!validationError;

            return (
              <div key={field.key}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Icon className={isFocused ? 'text-emerald-600' : 'text-slate-400'} />
                  <span>{field.label}</span>
                  {field.required && <span className="text-emerald-600">*</span>}
                </label>
                <div className="relative">
                  <Icon className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${isFocused ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <input
                    ref={field.key === 'barcode' ? barcodeRef : undefined}
                    type="text"
                    value={formData[field.key] || ''}
                    onChange={(event) => handleInputChange(field.key, event.target.value)}
                    onFocus={() => setFocusedField(field.key)}
                    onBlur={() => setFocusedField(null)}
                    placeholder={field.placeholder}
                    disabled={loading}
                    className={`h-12 w-full rounded-2xl border bg-white/80 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 ${
                      hasFieldError
                        ? 'border-rose-200 focus:border-rose-300 focus:ring-4 focus:ring-rose-100'
                        : 'border-slate-200 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {(validationError || error) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
            >
              {validationError || error?.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setShowImportDialog(true);
              window.setTimeout(handlePasteFromClipboard, 100);
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaLink /> 导入链接
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaTrash /> 清空
          </button>
          <InfoPrimaryButton type="submit" tone="emerald" disabled={!canSubmit}>
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                查询中...
              </>
            ) : (
              <>
                <FaSearch /> 查询产品
              </>
            )}
          </InfoPrimaryButton>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
          仅条码为必填项。填写货号、EAN 码与尺码可提高查询准确性，导入链接仅接受安踏官方域名。
        </div>
      </form>

      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowImportDialog(false)}
          >
            <motion.div
              className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Import URL</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">导入查询链接</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportDialog(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="关闭导入链接弹窗"
                >
                  <FaTimes />
                </button>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                粘贴安踏查询链接
                <textarea
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder="https://ascm.anta.com/consumer/innerbox/search?code=112535584-1&11&2000000134554&BRA047EBXF&CN"
                  className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
                支持安踏官方查询链接，链接内需包含货号、尺码、EAN 码和条码信息。
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowImportDialog(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  取消
                </button>
                <InfoPrimaryButton
                  type="button"
                  tone="emerald"
                  disabled={!importUrl.trim()}
                  className="flex-1"
                  onClick={handleImportUrl}
                >
                  导入
                </InfoPrimaryButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductQueryForm;
