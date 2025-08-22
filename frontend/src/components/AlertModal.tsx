import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';

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
        return <FaExclamationTriangle className="w-8 h-8 text-red-500" />;
      case 'success':
        return <FaTimes className="w-8 h-8 text-green-500" />;
      case 'info':
        return <FaExclamationTriangle className="w-8 h-8 text-blue-500" />;
      default:
        return <FaExclamationTriangle className="w-8 h-8 text-orange-500" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'success':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'info':
        return 'bg-blue-500 hover:bg-blue-600 text-white';
      default:
        return 'bg-orange-500 hover:bg-orange-600 text-white';
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
              {getIcon()}
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 text-center">
              {title || '温馨提示'}
            </h2>
            <div className="text-gray-700 mb-6 text-center leading-relaxed">
              {message}
        </div>
            <div className="flex justify-center">
              <motion.button
          onClick={onClose}
                className={`px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2 ${getButtonClass()}`}
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