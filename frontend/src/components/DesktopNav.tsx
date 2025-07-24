import React, { useRef, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User } from '../types/auth';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';

interface DesktopNavProps {
  user: User | null;
  logout: () => void;
  onTOTPManagerOpen: () => void;
}

const DesktopNav: React.FC<DesktopNavProps> = ({ user, logout, onTOTPManagerOpen }) => {
  const navRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const twoFactorStatus = useTwoFactorStatus();
  const [isOverflow, setIsOverflow] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (navRef.current) {
        setIsOverflow(navRef.current.scrollWidth > navRef.current.clientWidth);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, []);

  return (
    <motion.div 
      className="flex items-center space-x-3"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      ref={navRef}
    >
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Link to="/case-converter" className="px-4 py-2 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition-all duration-200 shadow-sm hover:shadow-md">大小写转换</Link>
      </motion.div>
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Link to="/api-docs" className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md">API 文档</Link>
      </motion.div>
      {user?.role === 'admin' && (
        <>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/admin" className="px-4 py-2 rounded-lg bg-pink-100 text-pink-700 font-semibold hover:bg-pink-200 transition-all duration-200 shadow-sm hover:shadow-md">管理后台</Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/admin/users" className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 transition-all duration-200 shadow-sm hover:shadow-md">用户管理</Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/email-sender" className="px-4 py-2 rounded-lg bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200 transition-all duration-200 shadow-sm hover:shadow-md">邮件发送</Link>
          </motion.div>
        </>
      )}
      {user && (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link to="/image-upload" className="px-4 py-2 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-all duration-200 shadow-sm hover:shadow-md">图片上传</Link>
        </motion.div>
      )}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Link to="/profile" className="px-4 py-2 rounded-lg bg-yellow-100 text-yellow-700 font-semibold hover:bg-yellow-200 transition-all duration-200 shadow-sm hover:shadow-md">个人主页</Link>
      </motion.div>
      <motion.button
        onClick={onTOTPManagerOpen}
        whileHover={{ scale: 1.05, y: -1 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        <motion.svg 
          className="w-4 h-4" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </motion.svg>
        <span>二次验证</span>
        {twoFactorStatus.enabled && (
          <motion.span 
            className="w-2 h-2 bg-green-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.button>
      <motion.button
        onClick={logout}
        whileHover={{ scale: 1.05, y: -1 }}
        whileTap={{ scale: 0.95 }}
        className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        退出
      </motion.button>
    </motion.div>
  );
};

export default DesktopNav; 