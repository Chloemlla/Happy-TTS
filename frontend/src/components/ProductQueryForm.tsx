import React, { useState, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AntiCounterfeitError, ProductQueryParams } from '../types/anta';
import { FaBarcode, FaTag, FaFileAlt, FaRulerCombined, FaLink, FaTrash, FaSearch } from 'react-icons/fa';

interface ProductQueryFormProps {
  onQuery: (params: ProductQueryParams) => void;
  loading: boolean;
  error: AntiCounterfeitError | null;
}

const ProductQueryForm: React.FC<ProductQueryFormProps> = ({
  onQuery,
  loading,
  error
}) => {
  const [formData, setFormData] = useState<ProductQueryParams>({
    barcode: '',
    itemNumber: '',
    ean: '',
    size: ''
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // 输入验证
  const validateForm = (): string | null => {
    if (!formData.barcode.trim()) {
      return '请输入条码';
    }

    // 条码格式验证
    const barcodePattern = /^[a-zA-Z0-9\-_]{3,50}$/;
    if (!barcodePattern.test(formData.barcode.trim())) {
      return '条码格式不正确，请输入有效的条码';
    }

    return null;
  };

  // 检查表单是否可以提交
  const canSubmit = formData.barcode.trim() && 
    !validationError && 
    !loading;

  // 处理输入变化
  const handleInputChange = (field: keyof ProductQueryParams, value: string) => {
    const newFormData = {
      ...formData,
      [field]: value
    };

    setFormData(newFormData);

    // 实时验证 - 只验证条码字段
    if (field === 'barcode') {
      if (value.trim()) {
        // 使用新的条码值进行验证
        const barcodePattern = /^[a-zA-Z0-9\-_]{3,50}$/;
        if (!barcodePattern.test(value.trim())) {
          setValidationError('条码格式不正确，请输入有效的条码');
        } else {
          setValidationError(null);
        }
      } else {
        setValidationError('请输入条码');
      }
    } else {
      // 其他字段不进行必填验证，只清除错误
      if (validationError && !validationError.includes('条码')) {
        setValidationError(null);
      }
    }
  };

  // 处理表单提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateForm();

    if (error) {
      setValidationError(error);
      barcodeRef.current?.focus();
      return;
    }

    setValidationError(null);

    // 清理数据并提交
    const cleanedData: ProductQueryParams = {
      barcode: formData.barcode.trim(),
      itemNumber: formData.itemNumber?.trim(),
      ean: formData.ean?.trim(),
      size: formData.size?.trim()
    };

    onQuery(cleanedData);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit(e as any);
    }
  };

  // 解析安踏查询URL
  const parseAntaUrl = (url: string): ProductQueryParams | null => {
    try {
      // 匹配安踏查询URL格式
      // https://ascm.anta.com/consumer/innerbox/search?code=货号&尺码&EAN&条码&CN
      const urlPattern = /https?:\/\/ascm\.anta\.com\/consumer\/innerbox\/search\?code=([^&]*)&([^&]*)&([^&]*)&([^&]*)&CN/;
      const match = url.match(urlPattern);

      if (match) {
        const [, itemNumber, size, ean, barcode] = match;
        return {
          barcode: decodeURIComponent(barcode || ''),
          itemNumber: decodeURIComponent(itemNumber || '') || undefined,
          ean: decodeURIComponent(ean || '') || undefined,
          size: decodeURIComponent(size || '') || undefined
        };
      }

      // 也支持简单的参数格式
      const simplePattern = /code=([^&]+)&([^&]+)&([^&]+)&([^&]+)/;
      const simpleMatch = url.match(simplePattern);

      if (simpleMatch) {
        const [, itemNumber, size, ean, barcode] = simpleMatch;
        return {
          barcode: decodeURIComponent(barcode || ''),
          itemNumber: decodeURIComponent(itemNumber || '') || undefined,
          ean: decodeURIComponent(ean || '') || undefined,
          size: decodeURIComponent(size || '') || undefined
        };
      }

      return null;
    } catch (error) {
      console.error('解析URL失败:', error);
      return null;
    }
  };

  // 处理URL导入
  const handleImportUrl = () => {
    const parsedData = parseAntaUrl(importUrl);

    if (parsedData && parsedData.barcode) {
      setFormData(parsedData);
      setValidationError(null);
      setShowImportDialog(false);
      setImportUrl('');

      // 显示成功提示
      setTimeout(() => {
        barcodeRef.current?.focus();
      }, 100);
    } else {
      setValidationError('无法解析URL，请检查URL格式是否正确');
    }
  };

  // 尝试从剪贴板读取URL
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();

        // 安全地验证URL，防止恶意URL注入
        if (text && typeof text === 'string') {
          try {
            const url = new URL(text);
            // 严格验证域名，确保只接受安踏官方域名
            if (url.hostname === 'ascm.anta.com' && url.protocol === 'https:') {
              setImportUrl(text);
            }
          } catch (urlError) {
            // URL格式无效，忽略
            console.log('无效的URL格式:', urlError);
          }
        }
      }
    } catch (error) {
      // 如果无法访问剪贴板，忽略错误
      console.log('无法访问剪贴板:', error);
    }
  };

  // 清空输入
  const handleClear = () => {
    setFormData({
      barcode: '',
      itemNumber: '',
      ean: '',
      size: ''
    });
    setValidationError(null);
    setFocusedField(null);
    barcodeRef.current?.focus();
  };

  // 动画常量
  const ENTER_INITIAL = { opacity: 0, y: 20 } as const;
  const ENTER_ANIMATE = { opacity: 1, y: 0 } as const;
  const DURATION_03 = { duration: 0.3 } as const;
  const NO_DURATION = { duration: 0 } as const;

  const trans03 = prefersReducedMotion ? NO_DURATION : DURATION_03;

  // 输入字段配置
  const inputFields = [
    {
      key: 'barcode' as keyof ProductQueryParams,
      label: '条码',
      placeholder: '请输入条码（必填，如：BRA047EBXF）',
      required: true,
      icon: <FaBarcode className="w-4 h-4" />
    },
    {
      key: 'itemNumber' as keyof ProductQueryParams,
      label: '货号',
      placeholder: '请输入货号（选填，如：112535584-1）',
      required: false,
      icon: <FaTag className="w-4 h-4" />
    },
    {
      key: 'ean' as keyof ProductQueryParams,
      label: 'EAN码',
      placeholder: '请输入EAN码（选填，如：2000000134554）',
      required: false,
      icon: <FaFileAlt className="w-4 h-4" />
    },
    {
      key: 'size' as keyof ProductQueryParams,
      label: '尺码',
      placeholder: '请输入尺码（选填，如：11）',
      required: false,
      icon: <FaRulerCombined className="w-4 h-4" />
    }
  ];

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans03}
        className="w-full"
      >
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h3 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">产品信息查询</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inputFields.map((field, index) => (
                <m.div
                  key={field.key}
                  initial={ENTER_INITIAL}
                  animate={ENTER_ANIMATE}
                  transition={{ ...trans03, delay: index * 0.1 }}
                  className="relative"
                >
                  <label className="block text-sm font-medium text-blue-700 mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-blue-600">{field.icon}</span>
                      <span>{field.label}</span>
                      {field.required && <span className="text-blue-500">*</span>}
                    </div>
                  </label>

                  <m.div
                    whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
                    whileFocus={prefersReducedMotion ? {} : { scale: 1.02 }}
                    className="relative"
                  >
                    <input
                      ref={field.key === 'barcode' ? barcodeRef : undefined}
                      type="text"
                      value={formData[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key, e.target.value)}
                      onFocus={() => setFocusedField(field.key)}
                      onBlur={() => setFocusedField(null)}
                      placeholder={field.placeholder}
                      disabled={loading}
                      className={`
                      w-full px-4 py-2 pl-10 border rounded-lg
                      transition-all duration-200 ease-in-out
                      focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
                      disabled:bg-blue-50/30 disabled:cursor-not-allowed
                      placeholder:text-blue-300
                      ${validationError && field.key === 'barcode' && !formData[field.key]?.trim()
                          ? 'border-blue-300 focus:border-blue-500 bg-blue-50/50 text-blue-900'
                          : focusedField === field.key
                            ? 'border-blue-400 bg-blue-50/30 text-blue-900 shadow-md'
                            : 'border-blue-200 hover:border-blue-300 bg-white text-blue-800'
                        }
                    `}
                    />

                    {/* 字段图标 */}
                    <div className={`absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors duration-200 ${
                      focusedField === field.key ? 'text-blue-600' : 'text-blue-400'
                    }`}>
                      {field.icon}
                    </div>
                  </m.div>
                </m.div>
              ))}
            </div>

            {/* 验证错误提示 */}
            <AnimatePresence>
              {validationError && (
                <m.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={trans03}
                  className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <div className="flex items-center text-sm text-blue-700">
                    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{validationError}</span>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* 操作按钮 */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              {/* 导入URL按钮 */}
              <m.button
                type="button"
                onClick={() => {
                  setShowImportDialog(true);
                  setTimeout(handlePasteFromClipboard, 100);
                }}
                disabled={loading}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FaLink className="w-4 h-4" />
                <span>导入链接</span>
              </m.button>

              {/* 清空按钮 */}
              <m.button
                type="button"
                onClick={handleClear}
                disabled={loading}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FaTrash className="w-4 h-4" />
                <span>清空</span>
              </m.button>

              {/* 查询按钮 */}
              <m.button
                type="submit"
                disabled={!canSubmit}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                className={`
                px-6 py-2 rounded-lg font-medium text-white transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
                ${!canSubmit
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
                  }
                flex items-center gap-2
              `}
              >
                {loading ? (
                  <>
                    <m.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                    <span>查询中...</span>
                  </>
                ) : (
                  <>
                    <FaSearch className="w-4 h-4" />
                    <span>查询产品</span>
                  </>
                )}
              </m.button>
            </div>

            {/* 提示信息 */}
            <m.div
              initial={ENTER_INITIAL}
              animate={ENTER_ANIMATE}
              transition={{ ...trans03, delay: 0.4 }}
              className="text-center"
            >
              <div className="inline-flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-6 px-6 py-4 bg-gradient-to-r from-blue-50/80 to-white/80 backdrop-blur-sm rounded-xl border border-blue-200/50 shadow-lg">
              <div className="flex items-center">
                <m.svg
                  className="w-4 h-4 mr-2 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </m.svg>
                <span className="text-sm font-medium text-blue-700">仅条码为必填项</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-blue-300"></div>
              <div className="flex items-center">
                <m.svg
                  className="w-4 h-4 mr-2 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </m.svg>
                <span className="text-sm font-medium text-blue-600">其他字段选填，填写更多信息可提高查询准确性</span>
              </div>
            </div>
          </m.div>
        </form>
      </div>

      {/* 导入URL对话框 */}
        <AnimatePresence>
          {showImportDialog && (
            <>
              {/* 背景遮罩 */}
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={trans03}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setShowImportDialog(false)}
              >
                {/* 对话框 */}
                <m.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={trans03}
                  className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl shadow-xl max-w-md w-full p-6 border border-blue-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                      导入查询链接
                    </h3>
                    <button
                      onClick={() => setShowImportDialog(false)}
                      className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-blue-700">
                          粘贴安踏查询链接
                        </label>
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>从剪贴板粘贴</span>
                        </button>
                      </div>
                      <textarea
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://ascm.anta.com/consumer/innerbox/search?code=112535584-1&11&2000000134554&BRA047EBXF&CN"
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-blue-50/30 text-blue-900 resize-none placeholder:text-blue-300"
                        rows={3}
                      />
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-blue-700">
                          <p className="font-medium mb-1">支持的链接格式：</p>
                          <p>安踏官方查询链接，包含货号、尺码、EAN码和条码信息</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setShowImportDialog(false)}
                        className="flex-1 px-4 py-2 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleImportUrl}
                        disabled={!importUrl.trim()}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:from-blue-300 disabled:to-blue-300 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
                      >
                        导入
                      </button>
                    </div>
                  </div>
                </m.div>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </m.div>
    </LazyMotion>
  );
};

export default ProductQueryForm;