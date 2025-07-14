import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from './Notification';

export const LegalNotice: React.FC = () => {
  const { setNotification } = useNotification();

  useEffect(() => {
    setNotification({ message: '法律声明：请遵守相关法律法规，合理使用本服务。', type: 'info' });
    // 只弹一次
    // eslint-disable-next-line
  }, []);

  return null;
}; 