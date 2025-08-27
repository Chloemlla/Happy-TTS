import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaEdit, FaCheck, FaTimes, FaCopy, FaExpand, FaCompress } from 'react-icons/fa';


interface PromptModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
  maxLength?: number;
  codeEditor?: boolean;
  language?: string;
}

const PromptModal: React.FC<PromptModalProps> = ({ 
  open, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  placeholder = '请输入内容',
  defaultValue = '',
  confirmText = '确定', 
  cancelText = '取消',
  multiline = false,
  maxLength,
  codeEditor = false,
  language = 'text'
}) => {
  const [value, setValue] = useState(defaultValue);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // 移动端专用样式
  const mobileStyles = {
    modal: {
      // 使用 CSS 自定义属性来适应键盘弹出
      height: isMobile ? 'calc(var(--vh, 1vh) * 100)' : 'auto',
      // 优化触摸滚动
      WebkitOverflowScrolling: 'touch' as const,
      // 防止双击缩放
      touchAction: 'manipulation' as const
    },
    input: {
      // 移动端输入框优化
      fontSize: isMobile ? '16px' : '14px', // 防止 iOS Safari 缩放
      WebkitAppearance: 'none' as const,
      borderRadius: isMobile ? '8px' : '6px'
    }
  };

  // 检测设备类型和屏幕尺寸
  useEffect(() => {
    const checkDeviceAndSize = () => {
      const width = window.innerWidth;
      
      setIsMobile(width <= 768);
      setIsTablet(width > 768 && width <= 1024);
    };
    
    checkDeviceAndSize();
    window.addEventListener('resize', checkDeviceAndSize);
    return () => window.removeEventListener('resize', checkDeviceAndSize);
  }, []);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      
      // 移动端键盘适配
      if (isMobile) {
        // 防止页面滚动
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        
        // 监听视口变化以适应键盘弹出
        const handleViewportChange = () => {
          const vh = window.innerHeight * 0.01;
          document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        handleViewportChange();
        window.addEventListener('resize', handleViewportChange);
        
        return () => {
          window.removeEventListener('resize', handleViewportChange);
        };
      }
    } else if (isMobile) {
      // 恢复页面滚动
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  }, [open, defaultValue, isMobile]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (isMobile) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }
    };
  }, [isMobile]);

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value); // 移除 trim() 以保留换行符
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline && !codeEditor) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // 复制内容到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      // 可以添加一个临时的成功提示
    } catch (err) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };



  return (
    <>

      <AnimatePresence>
        {open && (
        <motion.div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm ${
            isMobile ? 'p-2' : 'p-4'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            // 防止移动端滚动穿透
            touchAction: 'none',
            overscrollBehavior: 'contain'
          }}
        >
          <motion.div
            className={`bg-white shadow-sm border border-gray-200 relative ${
              isMobile 
                ? `w-full h-full rounded-lg p-3 ${isExpanded ? '' : 'max-h-[95vh] overflow-y-auto'}` 
                : isTablet
                ? `rounded-xl p-4 mx-3 ${isExpanded ? 'w-[92vw] h-[85vh]' : 'max-w-3xl w-[88vw]'}`
                : `rounded-xl p-6 mx-4 ${isExpanded ? 'w-[95vw] h-[90vh]' : 'max-w-2xl w-[90vw]'}`
            }`}
            initial={{ 
              opacity: 0, 
              scale: isMobile ? 0.98 : 0.95, 
              y: isMobile ? 10 : 20 
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ 
              opacity: 0, 
              scale: isMobile ? 0.98 : 0.95, 
              y: isMobile ? 10 : 20 
            }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            style={{
              ...mobileStyles.modal,
              // 确保在移动端有足够的触摸区域
              minHeight: isMobile ? '200px' : 'auto',
              // 防止内容溢出
              maxHeight: isMobile ? '95vh' : 'auto'
            }}
          >
            <div className={`flex items-center justify-between ${isMobile ? 'mb-3' : 'mb-4'}`}>
              <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
                <FaEdit className={`text-blue-500 ${isMobile ? 'w-5 h-5' : 'w-6 h-6'}`} />
                <h2 className={`font-semibold text-gray-800 ${isMobile ? 'text-base' : 'text-lg'}`}>
                  {title || '输入内容'}
                </h2>
              </div>
              <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
                {codeEditor && (
                  <>
                    <button
                      onClick={copyToClipboard}
                      className={`text-gray-500 hover:text-gray-700 transition-colors touch-manipulation ${
                        isMobile ? 'p-1.5 min-w-[36px] min-h-[36px]' : 'p-2'
                      }`}
                      title="复制内容"
                    >
                      <FaCopy className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                    </button>
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className={`text-gray-500 hover:text-gray-700 transition-colors touch-manipulation ${
                        isMobile ? 'p-1.5 min-w-[36px] min-h-[36px]' : 'p-2'
                      }`}
                      title={isExpanded ? '收起' : '展开'}
                    >
                      {isExpanded ? <FaCompress className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> : <FaExpand className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className={`text-gray-400 hover:text-gray-600 transition-colors touch-manipulation ${
                    isMobile ? 'p-1.5 min-w-[36px] min-h-[36px]' : 'p-2'
                  }`}
                >
                  <FaTimes className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
                </button>
              </div>
            </div>
            
            {message && (
              <div className={`text-gray-700 leading-relaxed ${isMobile ? 'mb-3 text-sm' : 'mb-4'}`}>
                {message}
              </div>
            )}
            
            <div className={`${isMobile ? 'mb-4' : 'mb-6'} ${isExpanded ? 'flex-1' : ''}`}>
              {codeEditor ? (
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className={`w-full border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all resize-none font-mono bg-gray-50 text-gray-900 ${
                    isExpanded 
                      ? isMobile 
                        ? 'h-[calc(100vh-180px)]' 
                        : isTablet 
                        ? 'h-[calc(85vh-180px)]' 
                        : 'h-[calc(90vh-200px)]'
                      : isMobile 
                      ? 'max-h-80' 
                      : 'max-h-96'
                  }`}
                  style={{
                    padding: isMobile ? '12px' : '16px',
                    fontSize: isMobile ? '16px' : '14px',
                    lineHeight: '1.5',
                    minHeight: isExpanded 
                      ? isMobile ? '300px' : '400px' 
                      : isMobile ? '150px' : '200px',
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    WebkitAppearance: 'none'
                  }}
                  autoFocus
                  spellCheck={false}
                  wrap="off"
                />
              ) : multiline ? (
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className="w-full border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all resize-none font-mono"
                  rows={isMobile ? 3 : 4}
                  autoFocus
                  spellCheck={false}
                  style={{
                    padding: isMobile ? '12px' : '16px',
                    fontSize: isMobile ? '16px' : '14px',
                    lineHeight: '1.5',
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    WebkitAppearance: 'none',
                    borderRadius: isMobile ? '8px' : '6px'
                  }}
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className="w-full border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                  autoFocus
                  style={{
                    padding: isMobile ? '12px' : '16px',
                    fontSize: isMobile ? '16px' : '14px',
                    lineHeight: '1.5',
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                    WebkitAppearance: 'none',
                    borderRadius: isMobile ? '8px' : '6px'
                  }}
                />
              )}
              
              {maxLength && (
                <div className={`text-gray-400 text-right ${isMobile ? 'text-xs mt-1' : 'text-xs mt-2'}`}>
                  {value.length}/{maxLength}
                </div>
              )}
            </div>
            
            <div className={`flex justify-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <motion.button
                onClick={onClose}
                className={`border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 touch-manipulation ${
                  isMobile ? 'px-4 py-2.5 text-sm min-h-[44px]' : 'px-6 py-3'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <FaTimes className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                {cancelText}
              </motion.button>
              <motion.button
                onClick={handleConfirm}
                disabled={!value.trim()}
                className={`bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${
                  isMobile ? 'px-4 py-2.5 text-sm min-h-[44px]' : 'px-6 py-3'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <FaCheck className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PromptModal; 