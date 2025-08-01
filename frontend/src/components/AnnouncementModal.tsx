import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { FaBullhorn } from 'react-icons/fa';

interface AnnouncementModalProps {
  open: boolean;
  onClose: () => void;
  onCloseToday: () => void;
  onCloseForever: () => void;
  content: string;
  format: 'markdown' | 'html';
  contentClassName?: string;
}

function renderMarkdownSafe(md: string) {
  let html: string;
  try {
    html = marked(md) as string;
  } catch {
    html = md;
  }
  return DOMPurify.sanitize(html);
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  open,
  onClose,
  onCloseToday,
  onCloseForever,
  content,
  format,
  contentClassName,
}) => {
  const [closing, setClosing] = useState(false);

  if (!open) return null;

  const handleClose = (cb: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      cb();
    }, 250);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => handleClose(onClose)}
        >
          <motion.div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8 relative animate-bounceIn"
            initial={{ scale: 0.95, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center mb-4">
              <FaBullhorn className="text-3xl mr-2 text-blue-600" />
              <h2 className="text-xl font-bold">最新公告</h2>
            </div>
            <div className={`prose max-w-none mb-6 min-h-[60px] ${contentClassName || ''}`}>
              {content ? (
                format === 'markdown' ? (
                  <span dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(content) }} />
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
                )
              ) : (
                <span className="text-gray-400">暂无公告内容</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
                onClick={e => { e.stopPropagation(); handleClose(onCloseToday); }}
              >今日不再提示</button>
              <button
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold shadow hover:bg-gray-200 transition"
                onClick={e => { e.stopPropagation(); handleClose(onClose); }}
              >关闭</button>
              <button
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold shadow hover:bg-gray-400 transition"
                onClick={e => { e.stopPropagation(); handleClose(onCloseForever); }}
              >永久不再提示</button>
            </div>
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              onClick={e => { e.stopPropagation(); handleClose(onClose); }}
              aria-label="关闭公告"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnnouncementModal; 