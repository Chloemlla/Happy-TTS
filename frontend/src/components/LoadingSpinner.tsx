import React from 'react';
import { motion } from 'framer-motion';

// 轻量级加载组件（用于组件级别的懒加载），支持 size
export const SimpleLoadingSpinner: React.FC<{ size?: number }> = ({ size = 1 }) => {
  const compact = size <= 0.75;
  const ringSize = compact ? Math.round(34 * size) : Math.round(56 * size);
  const ringStroke = Math.max(2, Math.round(2.6 * size));
  const haloSize = ringSize + Math.round(10 * size);
  const dotSize = Math.max(4, Math.round(ringSize * 0.26));
  const labelSize = 13 * size;
  const hintSize = 11 * size;

  const Spinner = (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: ringSize, height: ringSize }}
      role="status"
      aria-label="加载中"
    >
      {/* 外发光光晕 */}
      <motion.div
        className="pointer-events-none absolute rounded-full"
        style={{
          width: haloSize,
          height: haloSize,
          background:
            'radial-gradient(circle, rgba(99,102,241,0.22) 0%, rgba(56,189,248,0.16) 45%, transparent 72%)',
          filter: 'blur(6px)',
        }}
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [0.9, 1.04, 0.9] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 静态轨道环 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          borderWidth: ringStroke,
          borderStyle: 'solid',
          borderColor: 'rgba(148, 163, 184, 0.22)',
        }}
      />

      {/* 旋转主弧 */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          borderWidth: ringStroke,
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderTopColor: 'rgb(99, 102, 241)',
          borderRightColor: 'rgb(56, 189, 248)',
          boxShadow: '0 0 12px rgba(99,102,241,0.28)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
      />

      {/* 反向次弧，叠出细节层次 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: ringStroke + 2,
          borderWidth: Math.max(1, ringStroke - 1),
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderBottomColor: 'rgba(34, 211, 238, 0.55)',
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 1.7, repeat: Infinity, ease: 'linear' }}
      />

      {/* 中心律动小点 */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
          boxShadow: '0 0 10px rgba(99,102,241,0.55)',
        }}
        animate={{ scale: [0.78, 1.08, 0.78], opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );

  if (compact) {
    return Spinner;
  }

  return (
    <motion.div
      className="inline-flex flex-col items-center"
      style={{ gap: 14 * size }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
    >
      {Spinner}
      <div className="flex flex-col items-center" style={{ gap: 4 * size }}>
        <motion.span
          className="font-semibold uppercase tracking-[0.26em] text-slate-500"
          style={{ fontSize: labelSize }}
          animate={{ opacity: [0.78, 1, 0.78] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          Loading
        </motion.span>
        <span className="text-slate-400" style={{ fontSize: hintSize }}>
          正在整理页面内容
        </span>
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
    <div className={`text-center py-8 text-slate-500 ${className}`}>
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
      <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-slate-200 rounded w-1/2 mb-4"></div>
      <div className="h-4 bg-slate-200 rounded w-5/6"></div>
    </div>
  );
}; 
