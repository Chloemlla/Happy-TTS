import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import {
    authInfoPanelClassName,
    authModalCardClassName,
    authModalOverlayClassName,
    authSecondaryButtonClassName,
    authSoftBadgeClassName,
    authWarningPanelClassName,
} from './authStudioTheme';

interface VerificationMethodSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMethod: (method: 'passkey' | 'totp') => void;
    username: string;
    loading?: boolean;
    availableMethods?: ('passkey' | 'totp')[]; // 新增：用户已启用的验证方式
}

const VerificationMethodSelector: React.FC<VerificationMethodSelectorProps> = ({
    isOpen,
    onClose,
    onSelectMethod,
    username,
    loading = false,
    availableMethods = ['passkey', 'totp'] // 默认显示所有方式
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const touchStartY = useRef<number>(0);
    const touchEndY = useRef<number>(0);

    // 处理触摸滑动关闭
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = () => {
        const swipeDistance = touchStartY.current - touchEndY.current;
        const minSwipeDistance = 100; // 最小滑动距离

        if (swipeDistance > minSwipeDistance) {
            // 向上滑动关闭
            onClose();
        }
    };

    // 处理键盘事件
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                duration: 0.3,
                staggerChildren: 0.1
            }
        },
        exit: {
            opacity: 0,
            transition: {
                duration: 0.2
            }
        }
    };

    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 }
    };

    const modalVariants = {
        hidden: {
            opacity: 0,
            scale: 0.8,
            y: 50
        },
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
                type: "spring" as const,
                damping: 25,
                stiffness: 300
            }
        },
        exit: {
            opacity: 0,
            scale: 0.8,
            y: 50,
            transition: {
                duration: 0.2
            }
        }
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { 
            opacity: 1, 
            y: 0,
            transition: {
                type: "spring" as const,
                damping: 20,
                stiffness: 300
            }
        },
        hover: {
            y: -5,
            scale: 1.02,
            transition: {
                type: "spring" as const,
                damping: 15,
                stiffness: 400
            }
        },
        tap: {
            scale: 0.98
        }
    };

    const iconVariants = {
        hidden: { rotate: -180, scale: 0 },
        visible: { 
            rotate: 0, 
            scale: 1,
            transition: {
                type: "spring" as const,
                damping: 15,
                stiffness: 300,
                delay: 0.2
            }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={authModalOverlayClassName}
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    <motion.div
                        className="fixed inset-0 bg-slate-950/30 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        ref={modalRef}
                        className="relative w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl max-h-[90vh] overflow-y-auto"
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        <motion.div
                            className={cn(authModalCardClassName, 'overflow-hidden')}
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            {/* 可滚动的内容容器 */}
                            <div className="p-6 max-h-[90vh] overflow-y-auto">
                                {/* 标题 */}
                                <motion.div
                                    className="text-center mb-6"
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.1 }}
                                >
                                    <div className="flex flex-col items-center">
                                        <div className={cn(authSoftBadgeClassName, 'mx-auto mb-4 h-16 w-16')}>
                                            <motion.div
                                                initial={{ opacity: 0, rotate: -180 }}
                                                animate={{ opacity: 1, rotate: 0 }}
                                                transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
                                                whileHover={{ rotate: 5 }}
                                            >
                                                <svg className="h-8 w-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                            </motion.div>
                                        </div>
                                        <h2 className="mb-2 text-2xl font-semibold text-slate-900">选择验证方式</h2>
                                        <div className="text-slate-600">为 <span className="font-semibold text-slate-900">{username}</span> 选择安全验证方式</div>
                                    </div>
                                </motion.div>
                                {/* 调试信息 - 临时显示可用方法 */}
                                {process.env.NODE_ENV === 'development' && (
                                    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                                        可用方法: {JSON.stringify(availableMethods)}
                                    </div>
                                )}
                                
                                {/* 如果没有可用方法，显示默认选项 */}
                                {availableMethods.length === 0 && (
                                    <motion.div 
                                        className="text-center py-12 px-6"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <div className={cn(authSoftBadgeClassName, 'mx-auto mb-6 h-16 w-16')}>
                                            <svg className="h-8 w-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                            </svg>
                                        </div>
                                        <h3 className="mb-3 text-lg font-semibold text-slate-900">未设置验证方式</h3>
                                        <p className="mb-2 text-slate-600">检测到您还未设置任何二次验证方式</p>
                                        <p className="text-sm text-slate-500">请先在设置中启用验证方式</p>
                                    </motion.div>
                                )}
                                
                                {/* 验证方式选项 */}
                                <motion.div
                                    className="space-y-4"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.6 }}
                                >
                                    {/* Passkey 选项 */}
                                    {availableMethods.includes('passkey') && (
                                        <motion.div
                                            className="group cursor-pointer"
                                            variants={cardVariants}
                                            whileHover="hover"
                                            whileTap="tap"
                                            onClick={() => !loading && onSelectMethod('passkey')}
                                        >
                                            <div className={cn(authInfoPanelClassName, 'relative transition hover:border-slate-300 hover:bg-white')}>
                                                <div className="flex items-center space-x-4">
                                                    <motion.div
                                                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm"
                                                        whileHover={{ rotate: 5, scale: 1.1 }}
                                                        transition={{ type: "spring" as const, stiffness: 400 }}
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0112 2.944a6 6 0 0118 0z" />
                                                        </svg>
                                                    </motion.div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-slate-700">
                                                            Passkey 验证
                                                        </h3>
                                                        <p className="mt-1 text-sm text-slate-600">
                                                            使用生物识别或设备PIN码快速验证
                                                        </p>
                                                    </div>
                                                    <motion.div
                                                        className="flex-shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
                                                        initial={{ x: -10 }}
                                                        whileHover={{ x: 0 }}
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </motion.div>
                                                </div>
                                                {loading && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                    >
                                                        <motion.div
                                                            className="h-6 w-6 rounded-full border-2 border-slate-900 border-t-transparent"
                                                            animate={{ rotate: 360 }}
                                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                        />
                                                    </motion.div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* TOTP 选项 */}
                                    {availableMethods.includes('totp') && (
                                        <motion.div
                                            className="group cursor-pointer"
                                            variants={cardVariants}
                                            whileHover="hover"
                                            whileTap="tap"
                                            onClick={() => !loading && onSelectMethod('totp')}
                                        >
                                            <div className={cn(authInfoPanelClassName, 'relative transition hover:border-slate-300 hover:bg-white')}>
                                                <div className="flex items-center space-x-4">
                                                    <motion.div
                                                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm"
                                                        whileHover={{ rotate: -5, scale: 1.1 }}
                                                        transition={{ type: "spring" as const, stiffness: 400 }}
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </motion.div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-slate-700">
                                                            动态口令 (TOTP)
                                                        </h3>
                                                        <p className="mt-1 text-sm text-slate-600">
                                                            使用验证器应用生成的6位数字码
                                                        </p>
                                                    </div>
                                                    <motion.div
                                                        className="flex-shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
                                                        initial={{ x: -10 }}
                                                        whileHover={{ x: 0 }}
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </motion.div>
                                                </div>
                                                {loading && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                    >
                                                        <motion.div
                                                            className="h-6 w-6 rounded-full border-2 border-slate-900 border-t-transparent"
                                                            animate={{ rotate: 360 }}
                                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                        />
                                                    </motion.div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </motion.div>

                                {/* 帮助信息 */}
                                <motion.div
                                    className={cn(authWarningPanelClassName, 'mt-6')}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 1.0 }}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                >
                                    <div className="flex items-start">
                                        <motion.div
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                        >
                                            <svg className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                            </svg>
                                        </motion.div>
                                        <div>
                                            <motion.p
                                                className="text-sm font-medium text-slate-900"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.3, delay: 1.1 }}
                                            >
                                                安全提示
                                            </motion.p>
                                            <motion.p
                                                className="mt-1 text-sm text-slate-600"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.3, delay: 1.2 }}
                                            >
                                                两种验证方式都提供相同的安全级别，您可以根据个人喜好选择。
                                            </motion.p>
                                        </div>
                                    </div>
                                </motion.div>

                                {/* 底部按钮 */}
                                <motion.div
                                    className="flex space-x-3 mt-6"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.9 }}
                                >
                                    <motion.button
                                        onClick={onClose}
                                        className={authSecondaryButtonClassName}
                                        disabled={loading}
                                        whileHover={{ scale: 1.02, y: -1 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        取消
                                    </motion.button>
                                </motion.div>
                            </div>
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default VerificationMethodSelector; 
