import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DebugInfo {
    action: string;
    timestamp: string;
    [key: string]: any;
}

interface DebugInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    debugInfos: DebugInfo[];
    userRole?: string; // 添加用户角色属性
}

export const DebugInfoModal: React.FC<DebugInfoModalProps> = ({ isOpen, onClose, debugInfos, userRole }) => {
    const [copied, setCopied] = useState(false);

    // 检查用户是否为管理员
    const isAdmin = userRole === 'admin' || userRole === 'administrator';

    const copyToClipboard = async () => {
        try {
            const debugText = debugInfos.map(info => {
                return `[${info.timestamp}] ${info.action}: ${JSON.stringify(info, null, 2)}`;
            }).join('\n\n');
            
            await navigator.clipboard.writeText(debugText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('复制失败:', error);
        }
    };

    // 如果不是管理员，不显示调试信息模态框
    if (!isAdmin) {
        console.log('[调试信息] 用户非管理员，跳过调试信息显示');
        return null;
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 50 }}
                    transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 25 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-auto my-8 max-h-[90vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 标题栏 */}
                    <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </motion.div>
                                <div>
                                    <h2 className="text-2xl font-bold">Passkey 调试信息 (管理员专用)</h2>
                                    <p className="text-sm opacity-90">请将此信息提供给管理员进行问题诊断</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-white hover:text-gray-200 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* 内容区域 */}
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-4">
                            {debugInfos.map((info, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.1 }}
                                    className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-2 mb-2">
                                                <span className="text-sm font-medium text-gray-500">
                                                    {new Date(info.timestamp).toLocaleTimeString()}
                                                </span>
                                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                                    {info.action}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-700 space-y-1">
                                                {Object.entries(info).map(([key, value]) => {
                                                    if (key === 'action' || key === 'timestamp') return null;
                                                    return (
                                                        <div key={key} className="flex">
                                                            <span className="font-medium text-gray-600 w-24 flex-shrink-0">
                                                                {key}:
                                                            </span>
                                                            <span className="text-gray-800 break-all">
                                                                {typeof value === 'object' 
                                                                    ? JSON.stringify(value, null, 2)
                                                                    : String(value)
                                                                }
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* 底部操作栏 */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                                共 {debugInfos.length} 条调试信息
                            </div>
                            <div className="flex space-x-3">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={copyToClipboard}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                        copied 
                                            ? 'bg-green-500 text-white' 
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                    }`}
                                >
                                    {copied ? '已复制!' : '复制调试信息'}
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onClose}
                                    className="px-4 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                                >
                                    关闭
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}; 