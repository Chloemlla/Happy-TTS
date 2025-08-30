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
                            className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
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
                                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                                            <motion.div
                                                initial={{ opacity: 0, rotate: -180 }}
                                                animate={{ opacity: 1, rotate: 0 }}
                                                transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
                                                whileHover={{ rotate: 5 }}
                                            >
                                                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                            </motion.div>
                                        </div>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-2">选择验证方式</h2>
                                        <div className="text-gray-600">为 <span className="text-gray-900 font-semibold">{username}</span> 选择安全验证方式</div>
                                    </div>
                                </motion.div>
                                {/* 调试信息 - 临时显示可用方法 */}
                                {process.env.NODE_ENV === 'development' && (
                                    <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded-lg border border-blue-200 mb-4">
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
                                        <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center border border-blue-200">
                                            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-blue-900 mb-3">未设置验证方式</h3>
                                        <p className="text-blue-700 mb-2">检测到您还未设置任何二次验证方式</p>
                                        <p className="text-sm text-blue-600">请先在设置中启用验证方式</p>
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
                                            <div className="relative p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-indigo-50 hover:to-purple-50">
                                                <div className="flex items-center space-x-4">
                                                    <motion.div
                                                        className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg flex-shrink-0"
                                                        whileHover={{ rotate: 5, scale: 1.1 }}
                                                        transition={{ type: "spring" as const, stiffness: 400 }}
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0112 2.944a6 6 0 0118 0z" />
                                                        </svg>
                                                    </motion.div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                                            Passkey 验证
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            使用生物识别或设备PIN码快速验证
                                                        </p>
                                                    </div>
                                                    <motion.div
                                                        className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
                                                            className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"
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
                                            <div className="relative p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-indigo-50 hover:to-purple-50">
                                                <div className="flex items-center space-x-4">
                                                    <motion.div
                                                        className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg flex-shrink-0"
                                                        whileHover={{ rotate: -5, scale: 1.1 }}
                                                        transition={{ type: "spring" as const, stiffness: 400 }}
                                                    >
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </motion.div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                                            动态口令 (TOTP)
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            使用验证器应用生成的6位数字码
                                                        </p>
                                                    </div>
                                                    <motion.div
                                                        className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
                                                            className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"
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
                                    className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 1.0 }}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                >
                                    <div className="flex items-start">
                                        <motion.div
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                        >
                                            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                            </svg>
                                        </motion.div>
                                        <div>
                                            <motion.p
                                                className="text-sm font-medium text-blue-800"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.3, delay: 1.1 }}
                                            >
                                                安全提示
                                            </motion.p>
                                            <motion.p
                                                className="text-sm text-blue-700 mt-1"
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
                                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200"
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