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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br relative overflow-hidden">
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
          className="mt-6 text-center font-medium"
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
  const compact = size <= 0.75;
  const cardWidth = compact ? 52 * size : 168 * size;
  const cardHeight = compact ? 32 * size : 76 * size;
  const progressWidth = compact ? 30 * size : 126 * size;
  const progressHeight = Math.max(3, (compact ? 5 : 6) * size);
  const labelSize = 15 * size;
  const hintSize = 11 * size;
  const shimmerWidth = compact ? progressWidth * 0.82 : progressWidth * 0.42;

  return (
    <motion.div
      className="relative overflow-hidden border border-slate-200/80 bg-white/85 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl"
      style={{
        width: cardWidth,
        minHeight: cardHeight,
        borderRadius: 22 * size,
        padding: compact ? `${6 * size}px ${8 * size}px` : `${14 * size}px ${16 * size}px`,
      }}
      initial={{ opacity: 0, y: 6 * size }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at top left, rgba(99, 102, 241, 0.16), transparent 52%), radial-gradient(circle at bottom right, rgba(34, 211, 238, 0.14), transparent 48%)',
        }}
        animate={{ opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-y-0 left-[-45%] w-1/2 rounded-full bg-white/75 blur-xl"
        animate={{ x: ['0%', '250%'] }}
        transition={{ duration: compact ? 2.1 : 2.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className={`relative z-10 flex ${compact ? 'items-center justify-center' : 'flex-col gap-3'}`}>
        {!compact && (
          <div className="space-y-1">
            <motion.span
              className="block font-semibold tracking-[0.18em] text-slate-700"
              style={{ fontSize: labelSize }}
              animate={{ opacity: [0.82, 1, 0.82] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              加载中
            </motion.span>
            <span
              className="block text-slate-400"
              style={{ fontSize: hintSize }}
            >
              正在整理页面内容，请稍候片刻
            </span>
          </div>
        )}

        <div
          className="relative overflow-hidden rounded-full bg-slate-200/80"
          style={{ width: progressWidth, height: progressHeight }}
        >
          <motion.div
            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-cyan-300 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
            style={{ width: shimmerWidth }}
            animate={{ x: ['-62%', '122%'] }}
            transition={{ duration: compact ? 1.15 : 1.75, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.55)' }}
            animate={{ opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
};

// 统一的加载状态组件（类似 AnnouncementManager 的实现）
export const UnifiedLoadingSpinner: React.FC<{ 
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}> = ({ 
  size = 'md', 
  text = '加载中...',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`text-center py-8 text-gray-500 ${className}`}>
      <svg 
        className={`animate-spin ${sizeClasses[size]} mx-auto mb-4 text-blue-500`} 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text}
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
