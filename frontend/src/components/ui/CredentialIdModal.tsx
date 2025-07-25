import { motion, AnimatePresence } from 'framer-motion';
import React, { useState } from 'react';

// 纯 motion 弹窗渲染函数
export function renderCredentialIdModal({ open, credentialId, onClose }: { open: boolean; credentialId: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credentialId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={onClose}
        >
          <motion.div
            className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <div className="font-bold text-lg mb-2">验证器 CredentialID</div>
              <div className="break-all text-sm bg-gray-100 p-2 rounded select-all mb-4">{credentialId}</div>
              <div className="flex justify-center gap-3">
                <motion.button
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold"
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={onClose}
                >
                  关闭
                </motion.button>
                <motion.button
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-semibold"
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={handleCopy}
                  disabled={copied}
                >
                  {copied ? '已复制' : '复制'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const CredentialIdModal = renderCredentialIdModal; 