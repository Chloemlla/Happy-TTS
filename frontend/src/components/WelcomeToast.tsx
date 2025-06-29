import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WelcomeToast: React.FC = () => {
  const [isVisible, setIsVisible] = React.useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -80, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, duration: 0.5 }}
          className="fixed top-4 right-4 z-50"
        >
          <motion.div
            className="bg-white rounded-lg shadow-xl p-4 border-l-4 border-indigo-500"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex items-center">
              <motion.div
                className="flex-shrink-0"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 30 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                whileHover={{ scale: 1.15, rotate: 10 }}
              >
                <svg className="h-6 w-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </motion.div>
              <motion.div
                className="ml-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <p className="text-sm font-medium text-gray-900">
                  欢迎使用 Synapse
                </p>
                <p className="text-sm text-gray-500">
                  开发者邮箱：admin@hapxs.com
                </p>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeToast; 