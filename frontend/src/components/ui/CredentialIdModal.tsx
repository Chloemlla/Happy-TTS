import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CredentialIdModalProps {
  open: boolean;
  credentialId: string;
  onClose: () => void;
}

export const CredentialIdModal: React.FC<CredentialIdModalProps> = ({ open, credentialId, onClose }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="font-bold text-lg mb-2">验证器 CredentialID</div>
          <div className="break-all text-sm bg-gray-100 p-2 rounded">{credentialId}</div>
          <button
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={onClose}
          >
            关闭
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
); 