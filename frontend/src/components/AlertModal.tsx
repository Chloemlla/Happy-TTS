import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { studioModalCardClassName, studioModalOverlayClassName } from './studioTheme';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'warning' | 'danger' | 'info' | 'success';
}

const AlertModal: React.FC<AlertModalProps> = ({ open, onClose, title, message, type = 'warning' }) => {
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <FaExclamationTriangle className="w-8 h-8 text-rose-500" />;
      case 'success':
        return <FaTimes className="w-8 h-8 text-emerald-500" />;
      case 'info':
        return <FaExclamationTriangle className="w-8 h-8 text-sky-500" />;
      default:
        return <FaExclamationTriangle className="w-8 h-8 text-amber-500" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-rose-500 hover:bg-rose-600';
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-600';
      case 'info':
        return 'bg-sky-500 hover:bg-sky-600';
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
              {title || '温馨提示'}
            </h2>
            <div className="text-slate-700 mb-6 text-center leading-relaxed">
              {message}
        </div>
            <div className="flex justify-center">
              <motion.button
          onClick={onClose}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition ${getButtonClass()}`}
                whileTap={{ scale: 0.95 }}
        >
                <FaTimes className="w-4 h-4" />
          知道了
              </motion.button>
      </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AlertModal; 