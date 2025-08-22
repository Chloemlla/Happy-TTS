import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaEdit, FaCheck, FaTimes } from 'react-icons/fa';

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
  maxLength
}) => {
  const [value, setValue] = useState(defaultValue);

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
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

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
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-md w-[90vw] mx-4 relative"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <FaEdit className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 text-center">
              {title || '输入内容'}
            </h2>
            {message && (
              <div className="text-gray-700 mb-4 text-center leading-relaxed">
                {message}
              </div>
            )}
            <div className="mb-6">
              {multiline ? (
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