import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
            // 防止背景滚动
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
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
                    className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    <motion.div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
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
                            className="bg-white rounded-2xl shadow-2xl overflow-hidden"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            {/* 头部 */}
                            <motion.div 
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 sm:p-6 text-white text-center relative"
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                {/* 滑动指示器 */}
                                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-white/30 rounded-full" />
                                <motion.div
                                    className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-white/20 rounded-full flex items-center justify-center"
                                    variants={iconVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </motion.div>
                                <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">选择验证方式</h2>
                                <p className="text-sm sm:text-base text-indigo-100">为 {username} 选择二次验证方式</p>
                            </motion.div>

                            {/* 内容 */}
                            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                                {/* Passkey 选项 */}
                                {availableMethods.includes('passkey') && (
                                    <motion.div
                                        className="group cursor-pointer"
                                        variants={cardVariants}
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => !loading && onSelectMethod('passkey')}
                                    >
                                        <div className="relative p-3 sm:p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-indigo-50 hover:to-purple-50">
                                            <div className="flex items-center space-x-3 sm:space-x-4">
                                                <motion.div
                                                    className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg flex-shrink-0"
                                                    whileHover={{ rotate: 5, scale: 1.1 }}
                                                    transition={{ type: "spring" as const, stiffness: 400 }}
                                                >
                                                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                    </svg>
                                                </motion.div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                                        Passkey 验证
                                                    </h3>
                                                    <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
                                                        使用生物识别或设备PIN码快速验证
                                                    </p>
                                                </div>
                                                <motion.div
                                                    className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                    initial={{ x: -10 }}
                                                    whileHover={{ x: 0 }}
                                                >
                                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </motion.div>
                                            </div>
                                            {loading && (
                                                <motion.div
                                                    className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                >
                                                    <motion.div
                                                        className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-indigo-500 border-t-transparent rounded-full"
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
                                        <div className="relative p-3 sm:p-4 border-2 border-gray-200 rounded-xl hover:border-green-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-green-50 hover:to-emerald-50">
                                            <div className="flex items-center space-x-3 sm:space-x-4">
                                                <motion.div
                                                    className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg flex-shrink-0"
                                                    whileHover={{ rotate: -5, scale: 1.1 }}
                                                    transition={{ type: "spring" as const, stiffness: 400 }}
                                                >
                                                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </motion.div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-green-600 transition-colors truncate">
                                                        动态口令 (TOTP)
                                                    </h3>
                                                    <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
                                                        使用验证器应用生成的6位数字码
                                                    </p>
                                                </div>
                                                <motion.div
                                                    className="text-green-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                    initial={{ x: -10 }}
                                                    whileHover={{ x: 0 }}
                                                >
                                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </motion.div>
                                            </div>
                                            {loading && (
                                                <motion.div
                                                    className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                >
                                                    <motion.div
                                                        className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-green-500 border-t-transparent rounded-full"
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    />
                                                </motion.div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </div>

                            {/* 提示信息 */}
                            <motion.div
                                className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                            >
                                <div className="flex items-start space-x-2 sm:space-x-3">
                                    <div className="flex-shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-xs sm:text-sm font-medium text-blue-900">安全提示</h4>
                                        <p className="text-xs sm:text-sm text-blue-700 mt-1">
                                            两种验证方式都提供相同的安全级别，您可以根据个人喜好选择。
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* 底部按钮 */}
                        <motion.div 
                            className="p-4 sm:p-6 border-t border-gray-100"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <motion.button
                                onClick={onClose}
                                className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium text-sm sm:text-base rounded-lg"
                                disabled={loading}
                                whileTap={{ scale: 0.97 }}
                            >
                                取消
                            </motion.button>
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default VerificationMethodSelector; 