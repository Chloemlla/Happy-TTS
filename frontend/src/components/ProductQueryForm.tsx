import React, { useState, useRef } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AntiCounterfeitError, ProductQueryParams } from '../types/anta';

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
  const canSubmit = formData.barcode.trim() && !validationError && !loading;

  // 处理输入变化
  const handleInputChange = (field: keyof ProductQueryParams, value: string) => {
    const newFormData = {
      ...formData,
      [field]: value
    };

    setFormData(newFormData);

    // 实时验证 - 使用更新后的数据进行验证
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
      itemNumber: formData.itemNumber?.trim() || undefined,
      ean: formData.ean?.trim() || undefined,
      size: formData.size?.trim() || undefined
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
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
        </svg>
      )
    },
    {
      key: 'itemNumber' as keyof ProductQueryParams,
      label: '货号',
      placeholder: '请输入货号（选填，如：112535584-1）',
      required: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      )
    },
    {
      key: 'ean' as keyof ProductQueryParams,
      label: 'EAN码',
      placeholder: '请输入EAN码（选填，如：2000000134554）',
      required: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      key: 'size' as keyof ProductQueryParams,
      label: '尺码',
      placeholder: '请输入尺码（选填，如：11）',
      required: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4a1 1 0 011-1h4m12 0h-4a1 1 0 00-1 1v4m0 8v4a1 1 0 001 1h4m-12 0H4a1 1 0 01-1-1v-4" />
        </svg>
      )
    }
  ];

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans03}
        className="w-full max-w-4xl mx-auto"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 输入字段网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inputFields.map((field, index) => (
              <m.div
                key={field.key}
                initial={ENTER_INITIAL}
                animate={ENTER_ANIMATE}
                transition={{ ...trans03, delay: index * 0.1 }}
                className="relative"
              >
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-500 dark:text-blue-400">{field.icon}</span>
                    <span>{field.label}</span>
                    {field.required && <span className="text-red-500">*</span>}
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
                      w-full px-4 py-3 pl-12 border-2 rounded-xl font-medium
                      transition-all duration-300 ease-in-out backdrop-blur-sm
                      focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/30
                      disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
                      placeholder:text-gray-400 dark:placeholder:text-gray-500
                      ${validationError && field.required
                        ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400 bg-red-50/50 dark:bg-red-900/10 text-red-900 dark:text-red-100'
                        : focusedField === field.key
                          ? 'border-blue-500 dark:border-blue-400 bg-white dark:bg-gray-800 shadow-xl dark:shadow-blue-900/20 text-gray-900 dark:text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-white shadow-lg'
                      }
                    `}
                  />

                  {/* 字段图标 */}
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
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
                className="px-4 py-3 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-700/50 rounded-xl shadow-lg backdrop-blur-sm"
              >
                <div className="flex items-center text-sm text-red-700 dark:text-red-300">
                  <m.svg
                    className="w-5 h-5 mr-3 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </m.svg>
                  <span className="font-medium">{validationError}</span>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* 调试信息（开发时可见） */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-500 p-2 bg-gray-100 rounded">
              调试: 条码="{formData.barcode}" | 验证错误="{validationError}" | 可提交={canSubmit.toString()}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* 导入URL按钮 */}
            <m.button
              type="button"
              onClick={() => {
                setShowImportDialog(true);
                // 打开对话框时自动尝试从剪贴板读取
                setTimeout(handlePasteFromClipboard, 100);
              }}
              disabled={loading}
              whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              className="px-6 py-3 border-2 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 rounded-xl font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>导入链接</span>
              </div>
            </m.button>

            {/* 清空按钮 */}
            <m.button
              type="button"
              onClick={handleClear}
              disabled={loading}
              whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>清空</span>
              </div>
            </m.button>

            {/* 查询按钮 */}
            <m.button
              type="submit"
              disabled={!canSubmit}
              whileHover={prefersReducedMotion ? {} : { scale: 1.05, y: -2 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              className={`
                px-8 py-3 rounded-xl font-semibold text-white
                transition-all duration-300 ease-in-out
                focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/30
                ${!canSubmit
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-indigo-600 shadow-lg hover:shadow-xl dark:shadow-blue-900/20'
                }
              `}
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <m.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  />
                  <span>查询中...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>查询产品</span>
                </div>
              )}
            </m.button>
          </div>

          {/* 填写提示 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...trans03, delay: 0.4 }}
            className="text-center"
          >
            <div className="inline-flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-6 px-6 py-4 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="flex items-center">
                <m.svg
                  className="w-4 h-4 mr-2 text-red-500 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </m.svg>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">条码为必填项</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-gray-300 dark:bg-gray-600"></div>
              <div className="flex items-center">
                <m.svg
                  className="w-4 h-4 mr-2 text-green-500 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </m.svg>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">其他字段可提高查询准确性</span>
              </div>
            </div>
          </m.div>
        </form>

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
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      导入查询链接
                    </h3>
                    <button
                      onClick={() => setShowImportDialog(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          粘贴安踏查询链接
                        </label>
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center space-x-1"
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                        rows={3}
                      />
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          <p className="font-medium mb-1">支持的链接格式：</p>
                          <p>安踏官方查询链接，包含货号、尺码、EAN码和条码信息</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setShowImportDialog(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleImportUrl}
                        disabled={!importUrl.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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