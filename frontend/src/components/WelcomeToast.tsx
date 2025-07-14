import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';

const WelcomeToast: React.FC = () => {
  const { setNotification } = useNotification();

  useEffect(() => {
    setNotification({ message: '欢迎使用 Synapse！', type: 'info' });
    // 只弹一次
    // eslint-disable-next-line
  }, []);

  return null;
};

export default WelcomeToast; 