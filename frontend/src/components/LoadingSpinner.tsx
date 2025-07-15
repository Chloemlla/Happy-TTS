import React from 'react';
import { motion } from 'framer-motion';

// 背景粒子组件
const BackgroundParticles: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-indigo-200 rounded-full opacity-30"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          animate={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          transition={{
            duration: Math.random() * 20 + 10,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

// 加载动画组件，支持 size 缩放
export const LoadingSpinner: React.FC<{ size?: number }> = ({ size = 1 }) => {
  const outerSize = 64 * size; // 原 16 * 4
  const border = 4 * size;
  const innerSize = 32 * size; // 原 8 * 4
  const fontSize = 18 * size;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
      <BackgroundParticles />
      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.8 * size }}
        animate={{ opacity: 1, scale: size }}
        transition={{ duration: 0.5 }}
      >
        {/* 包裹外圈和内圈的容器，保证居中 */}
        <div className="relative flex items-center justify-center" style={{ width: outerSize, height: outerSize }}>
          {/* 外圈旋转 */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div style={{ width: outerSize, height: outerSize, borderWidth: border }} className="border-indigo-200 border-t-indigo-600 rounded-full border-solid"></div>
          </motion.div>
          {/* 内圈缩放 - 使用flex居中替代transform */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div style={{ width: innerSize, height: innerSize }} className="bg-indigo-600 rounded-full"></div>
          </motion.div>
        </div>
        <motion.p
          className="mt-6 text-center text-gray-600 font-medium"
          style={{ fontSize }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          正在加载...
        </motion.p>
      </motion.div>
    </div>
  );
};

// 轻量级加载组件（用于组件级别的懒加载），支持 size
export const SimpleLoadingSpinner: React.FC<{ size?: number }> = ({ size = 1 }) => {
  const spinnerSize = 32 * size;
  const border = 2 * size;
  const fontSize = 16 * size;
  return (
    <div className="flex items-center justify-center p-8">
      <motion.div
        style={{ width: spinnerSize, height: spinnerSize, borderWidth: border }}
        className="border-indigo-200 border-t-indigo-600 rounded-full border-solid"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      <span className="ml-3 text-gray-600" style={{ fontSize }}>加载中...</span>
    </div>
  );
};

// 骨架屏加载组件
export const SkeletonLoader: React.FC = () => {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
      <div className="h-4 bg-gray-200 rounded w-5/6"></div>
    </div>
  );
}; 