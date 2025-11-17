import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaFingerprint, FaExclamationTriangle, FaCheck, FaTimes, FaSync } from 'react-icons/fa';
import { useNotification } from './Notification';
import { reportFingerprintOnce } from '../utils/fingerprint';
import getApiBaseUrl from '../api/api';

interface FingerprintRequestModalProps {
    isOpen: boolean;
    onClose: (isDismissed?: boolean) => void;
    onRequestComplete?: () => void;
}

const FingerprintRequestModal: React.FC<FingerprintRequestModalProps> = ({
    isOpen,
    onClose,
    onRequestComplete
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [localClosed, setLocalClosed] = useState(false);
    const { setNotification } = useNotification();

    // 重置状态当弹窗打开时
    useEffect(() => {
        if (isOpen) {
            setIsSubmitted(false);
            setError('');
            setIsSubmitting(false);
            setLocalClosed(false);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (isSubmitting || isSubmitted) return;

        setIsSubmitting(true);
        setError('');

        try {
            console.log('🔍 用户确认上报指纹...');
            await reportFingerprintOnce();

            setIsSubmitted(true);
            setNotification({ type: 'success', message: '指纹上报成功，感谢您的配合！' });

            // 通知父组件请求完成
            if (onRequestComplete) {
                onRequestComplete();
            }

            // 2秒后自动关闭
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err) {
            console.error('指纹上报失败:', err);
            setError('指纹上报失败，请稍后重试');
            setNotification({ type: 'error', message: '指纹上报失败，请稍后重试' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDismiss = () => {
        if (!isSubmitting) {
            setNotification({ type: 'warning', message: '您暂时跳过了指纹上报，管理员可能再次请求' });
            onClose(true); // 传递 true 表示这是主动跳过，需要 dismissal tracking
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            onClose(false); // 传递 false 表示这是普通关闭，不需要 dismissal tracking
        }
    };

    return (
        <AnimatePresence>
            {isOpen && !localClosed && (
                <motion.div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                >
                    <motion.div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative"
                        initial={{ scale: 0.9, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 关闭按钮 */}
                        {!isSubmitting && !isSubmitted && (
                            <button
                                onClick={handleClose}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                                title="关闭"
                            >
                                <FaTimes className="w-5 h-5" />
                            </button>
                        )}

                        {/* 头部图标和标题 */}
                        <div className="flex items-center justify-center mb-6">
                            <motion.div
                                className={`w-16 h-16 rounded-full flex items-center justify-center ${isSubmitted
                                        ? 'bg-green-100 text-green-600'
                                        : 'bg-blue-100 text-blue-600'
                                    }`}
                                animate={isSubmitting ? { rotate: 360 } : { rotate: 0 }}
                                transition={{ duration: 1, repeat: isSubmitting ? Infinity : 0, ease: "linear" }}
                            >
                                {isSubmitted ? (
                                    <FaCheck className="w-8 h-8" />
                                ) : isSubmitting ? (
                                    <FaSync className="w-8 h-8" />
                                ) : (
                                    <FaFingerprint className="w-8 h-8" />
                                )}
                            </motion.div>
                        </div>

                        {/* 标题和描述 */}
                        <div className="text-center mb-6">
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                {isSubmitted ? '指纹上报成功' : '指纹上报请求'}
                            </h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                {isSubmitted
                                    ? '您的浏览器指纹已成功上报，感谢您的配合！'
                                    : '管理员请求上报您的浏览器指纹，用于安全验证和用户识别。此过程不会收集任何个人信息。'
                                }
                            </p>
                        </div>

                        {/* 错误信息 */}
                        {error && (
                            <motion.div
                                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <FaExclamationTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <span className="text-red-700 text-sm">{error}</span>
                            </motion.div>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex gap-3">
                            {!isSubmitted && (
                                <>
                                    <button
                                        onClick={handleDismiss}
                                        disabled={isSubmitting}
                                        className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        暂时跳过
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <FaSync className="w-4 h-4 animate-spin" />
                                                上报中...
                                            </>
                                        ) : (
                                            <>
                                                <FaFingerprint className="w-4 h-4" />
                                                立即上报
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                            {isSubmitted && (
                                <button
                                    onClick={() => setLocalClosed(true)}
                                    className="w-full px-4 py-2 text-green-600 bg-green-100 rounded-lg hover:bg-green-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <FaCheck className="w-4 h-4" />
                                    关闭窗口
                                </button>
                            )}
                        </div>

                        {/* 说明信息 */}
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="text-xs text-gray-500 space-y-1">
                                <p>• 指纹信息包含：浏览器类型、屏幕分辨率、时区等设备特征</p>
                                <p>• 此信息仅用于安全验证，不会识别您的个人身份</p>
                                <p>• 您可以随时跳过，管理员可能会再次请求</p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default FingerprintRequestModal;
