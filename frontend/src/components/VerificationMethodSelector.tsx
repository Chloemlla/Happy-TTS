import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog } from './ui/Dialog';

interface VerificationMethodSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMethod: (method: 'passkey' | 'totp') => void;
    username: string;
    loading?: boolean;
}

const VerificationMethodSelector: React.FC<VerificationMethodSelectorProps> = ({
    isOpen,
    onClose,
    onSelectMethod,
    username,
    loading = false
}) => {
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
                <Dialog open={isOpen} onOpenChange={onClose}>
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
                            className="relative w-full max-w-md"
                            variants={modalVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
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
                                    className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center"
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                >
                                    <motion.div
                                        className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center"
                                        variants={iconVariants}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </motion.div>
                                    <h2 className="text-2xl font-bold mb-2">选择验证方式</h2>
                                    <p className="text-indigo-100">为 {username} 选择二次验证方式</p>
                                </motion.div>

                                {/* 内容 */}
                                <div className="p-6 space-y-4">
                                    {/* Passkey 选项 */}
                                    <motion.div
                                        className="group cursor-pointer"
                                        variants={cardVariants}
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => !loading && onSelectMethod('passkey')}
                                    >
                                        <div className="relative p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-indigo-50 hover:to-purple-50">
                                            <div className="flex items-center space-x-4">
                                                <motion.div
                                                    className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg"
                                                    whileHover={{ rotate: 5, scale: 1.1 }}
                                                    transition={{ type: "spring" as const, stiffness: 400 }}
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                    </svg>
                                                </motion.div>
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                                        Passkey 验证
                                                    </h3>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        使用生物识别或设备PIN码快速验证
                                                    </p>
                                                </div>
                                                <motion.div
                                                    className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                                    className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center"
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

                                    {/* TOTP 选项 */}
                                    <motion.div
                                        className="group cursor-pointer"
                                        variants={cardVariants}
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => !loading && onSelectMethod('totp')}
                                    >
                                        <div className="relative p-4 border-2 border-gray-200 rounded-xl hover:border-green-300 transition-colors duration-200 bg-gradient-to-r from-gray-50 to-white hover:from-green-50 hover:to-emerald-50">
                                            <div className="flex items-center space-x-4">
                                                <motion.div
                                                    className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg"
                                                    whileHover={{ rotate: -5, scale: 1.1 }}
                                                    transition={{ type: "spring" as const, stiffness: 400 }}
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </motion.div>
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                                                        动态口令 (TOTP)
                                                    </h3>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        使用验证器应用生成的6位数字码
                                                    </p>
                                                </div>
                                                <motion.div
                                                    className="text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                                    className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                >
                                                    <motion.div
                                                        className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full"
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    />
                                                </motion.div>
                                            )}
                                        </div>
                                    </motion.div>

                                    {/* 提示信息 */}
                                    <motion.div
                                        className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <div className="flex items-start space-x-3">
                                            <div className="flex-shrink-0">
                                                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-medium text-blue-900">安全提示</h4>
                                                <p className="text-sm text-blue-700 mt-1">
                                                    两种验证方式都提供相同的安全级别，您可以根据个人喜好选择。
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>

                                {/* 底部按钮 */}
                                <motion.div 
                                    className="p-6 border-t border-gray-100"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    <button
                                        onClick={onClose}
                                        className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
                                        disabled={loading}
                                    >
                                        取消
                                    </button>
                                </motion.div>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                </Dialog>
            )}
        </AnimatePresence>
    );
};

export default VerificationMethodSelector; 