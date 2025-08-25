import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaEdit, FaCheck, FaTimes, FaCode, FaEye, FaEyeSlash, FaCopy, FaExpand, FaCompress } from 'react-icons/fa';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsLang from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import tsLang from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import cssLang from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import htmlLang from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sqlLang from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import pythonLang from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bashLang from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';

// 注册语言
SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);
SyntaxHighlighter.registerLanguage('typescript', tsLang);
SyntaxHighlighter.registerLanguage('css', cssLang);
SyntaxHighlighter.registerLanguage('html', htmlLang);
SyntaxHighlighter.registerLanguage('sql', sqlLang);
SyntaxHighlighter.registerLanguage('python', pythonLang);
SyntaxHighlighter.registerLanguage('bash', bashLang);
SyntaxHighlighter.registerLanguage('markdown', markdownLang);

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
  const [showRaw, setShowRaw] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
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

  // 检测内容类型并自动选择语言
  const detectLanguage = (content: string): string => {
    if (!content) return 'text';
    
    const trimmed = content.trim();
    
    // JSON检测
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    
    // JavaScript/TypeScript检测
    if (trimmed.includes('function') || trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('var ')) {
      if (trimmed.includes('interface ') || trimmed.includes('type ') || trimmed.includes(': ')) {
        return 'typescript';
      }
      return 'javascript';
    }
    
    // HTML检测
    if (trimmed.includes('<html') || trimmed.includes('<div') || trimmed.includes('<span')) {
      return 'html';
    }
    
    // CSS检测
    if (trimmed.includes('{') && trimmed.includes('}') && (trimmed.includes('color:') || trimmed.includes('background:'))) {
      return 'css';
    }
    
    // SQL检测
    if (trimmed.toLowerCase().includes('select ') || trimmed.toLowerCase().includes('insert ') || trimmed.toLowerCase().includes('update ')) {
      return 'sql';
    }
    
    // Python检测
    if (trimmed.includes('def ') || trimmed.includes('import ') || trimmed.includes('print(')) {
      return 'python';
    }
    
    // Bash检测
    if (trimmed.includes('#!/') || trimmed.includes('echo ') || trimmed.includes('cd ')) {
      return 'bash';
    }
    
    // Markdown检测
    if (trimmed.includes('# ') || trimmed.includes('**') || trimmed.includes('```')) {
      return 'markdown';
    }
    
    return 'text';
  };

  const detectedLang = codeEditor ? (language === 'auto' ? detectLanguage(value) : language) : 'text';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 mx-4 relative ${
              isExpanded ? 'w-[95vw] h-[90vh]' : 'max-w-2xl w-[90vw]'
            }`}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FaEdit className="w-6 h-6 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-800">
                  {title || '输入内容'}
                </h2>
                {codeEditor && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {detectedLang}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {codeEditor && (
                  <>
                    <button
                      onClick={copyToClipboard}
                      className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                      title="复制内容"
                    >
                      <FaCopy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowRaw(!showRaw)}
                      className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                      title={showRaw ? '显示语法高亮' : '显示原始文本'}
                    >
                      {showRaw ? <FaCode className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                      title={isExpanded ? '收起' : '展开'}
                    >
                      {isExpanded ? <FaCompress className="w-4 h-4" /> : <FaExpand className="w-4 h-4" />}
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {message && (
              <div className="text-gray-700 mb-4 leading-relaxed">
                {message}
              </div>
            )}
            
            <div className={`mb-6 ${isExpanded ? 'flex-1' : ''}`}>
              {codeEditor ? (
                <div className={`border-2 border-gray-200 rounded-lg overflow-hidden ${isExpanded ? 'h-[calc(90vh-200px)]' : 'max-h-96'}`}>
                  {showRaw ? (
                    <textarea
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={placeholder}
                      maxLength={maxLength}
                      className="w-full h-full px-4 py-3 bg-gray-50 text-gray-900 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                      style={{ minHeight: isExpanded ? '400px' : '200px' }}
                      autoFocus
                    />
                  ) : (
                    <div className="relative">
                      <SyntaxHighlighter
                        language={detectedLang}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          fontSize: '14px',
                          lineHeight: '1.5',
                          minHeight: isExpanded ? '400px' : '200px',
                          maxHeight: isExpanded ? 'none' : '300px',
                          overflow: 'auto'
                        }}
                        showLineNumbers
                        wrapLongLines
                        lineNumberStyle={{
                          color: '#6b7280',
                          fontSize: '12px',
                          paddingRight: '16px'
                        }}
                      >
                        {value || placeholder}
                      </SyntaxHighlighter>
                      <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-gray-300 font-mono text-sm resize-none focus:outline-none border-none p-4"
                        style={{
                          paddingTop: '1rem',
                          paddingLeft: '3.5rem',
                          lineHeight: '1.5',
                          fontSize: '14px'
                        }}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ) : multiline ? (
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all resize-none"
                  rows={4}
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                  autoFocus
                />
              )}
              
              {maxLength && (
                <div className="text-xs text-gray-400 mt-2 text-right">
                  {value.length}/{maxLength}
                </div>
              )}
            </div>
            
            <div className="flex gap-3 justify-center">
              <motion.button
                onClick={onClose}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
                whileTap={{ scale: 0.95 }}
              >
                <FaTimes className="w-4 h-4" />
                {cancelText}
              </motion.button>
              <motion.button
                onClick={handleConfirm}
                disabled={!value.trim()}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                whileTap={{ scale: 0.95 }}
              >
                <FaCheck className="w-4 h-4" />
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PromptModal; 