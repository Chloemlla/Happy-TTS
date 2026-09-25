import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExclamationTriangle, FaCheck, FaTimes } from 'react-icons/fa';
import { studioModalCardClassName, studioModalOverlayClassName, studioSecondaryButtonClassName } from './studioTheme';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  type = 'warning'
}) => {
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <FaExclamationTriangle className="w-8 h-8 text-rose-500" />;
      case 'info':
        return <FaExclamationTriangle className="w-8 h-8 text-emerald-500" />;
      default:
        return <FaExclamationTriangle className="w-8 h-8 text-amber-500" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-rose-500 hover:bg-rose-600';
      case 'info':
        return 'bg-emerald-500 hover:bg-emerald-600';
      default:
        return 'bg-amber-500 hover:bg-amber-600';
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={studioModalOverlayClassName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className={`${studioModalCardClassName} max-w-md mx-4 relative max-h-[90vh] overflow-y-auto`}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              {getIcon()}
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3 text-center">
              {title || '确认操作'}
            </h2>
            <div className="text-slate-700 mb-6 text-center leading-relaxed">
              {message}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <motion.button
                onClick={onClose}
                className={studioSecondaryButtonClassName}
                whileTap={{ scale: 0.95 }}
              >
                <FaTimes className="w-4 h-4" />
                {cancelText}
              </motion.button>
              <motion.button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition ${getConfirmButtonClass()}`}
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

export default ConfirmModal;
