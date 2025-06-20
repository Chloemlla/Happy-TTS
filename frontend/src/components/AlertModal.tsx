import React from 'react';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

const AlertModal: React.FC<AlertModalProps> = ({ open, onClose, title, message }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      onClick={onClose}
      style={{ overflowY: 'auto' }}
    >
      <div
        className="bg-white rounded-lg shadow-2xl p-8 max-w-sm w-[90vw] sm:w-full text-center relative animate-bounceIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <span className="text-5xl text-red-500">❗️</span>
        </div>
        <h2 className="text-xl font-bold mb-2">{title || '温馨提示'}</h2>
        <div className="text-gray-700 mb-6">{message}</div>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          知道了
        </button>
      </div>
    </div>
  );
};

export default AlertModal; 