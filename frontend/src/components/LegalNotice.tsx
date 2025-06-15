import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const LegalNotice: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2000); // 10秒后自动隐藏

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-xl px-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                法律声明
              </h2>
              <button
                onClick={() => setIsVisible(false)}
                className="text-white hover:text-gray-200 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-gray-700 text-sm">
                尊敬的用户，请注意：
              </p>
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg">
                <p className="text-red-700 text-sm font-medium">
                  禁止上传任何非法内容。如违反相关规定，我们将配合公安机关和政府调查，并提供相关材料。
                </p>
              </div>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg">
                <p className="text-blue-700 text-sm">
                  如有任何问题，请联系开发者：
                  <a 
                    href="mailto:admin@hapxs.com" 
                    className="font-medium hover:text-blue-800 transition-colors duration-200"
                  >
                    admin@hapxs.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}; 