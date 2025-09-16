import React from 'react';
import { motion } from 'framer-motion';
import { useNotification } from './Notification';

const NotificationTestPage: React.FC = () => {
    const { setNotification } = useNotification();

    const testNotifications = [
        {
            type: 'success' as const,
            title: '成功通知',
            message: '操作已成功完成！',
            details: ['数据已保存', '缓存已更新', '用户已通知']
        },
        {
            type: 'error' as const,
            title: '错误通知',
            message: '操作失败，请重试',
            details: ['网络连接超时', '服务器返回500错误', '请检查网络连接']
        },
        {
            type: 'warning' as const,
            title: '警告通知',
            message: '请注意以下问题',
            details: ['磁盘空间不足', '内存使用率过高', '建议清理缓存']
        },
        {
            type: 'info' as const,
            title: '信息通知',
            message: '系统维护通知',
            details: ['维护时间：今晚22:00-24:00', '影响范围：所有服务', '请提前保存工作']
        }
    ];

    const handleSingleNotification = (index: number) => {
        const notification = testNotifications[index];
        setNotification(notification);
    };

    const handleMultipleNotifications = () => {
        testNotifications.forEach((notification, index) => {
            setTimeout(() => {
                setNotification(notification);
            }, index * 500);
        });
    };

    const handleRapidNotifications = () => {
        testNotifications.forEach((notification, index) => {
            setTimeout(() => {
                setNotification({
                    ...notification,
                    message: `快速通知 #${index + 1}: ${notification.message}`
                });
            }, index * 100);
        });
    };

    const handleSimpleNotifications = () => {
        const simpleNotifications = [
            { type: 'success' as const, message: '简单成功消息' },
            { type: 'error' as const, message: '简单错误消息' },
            { type: 'warning' as const, message: '简单警告消息' },
            { type: 'info' as const, message: '简单信息消息' }
        ];

        simpleNotifications.forEach((notification, index) => {
            setTimeout(() => {
                setNotification(notification);
            }, index * 300);
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* 页面标题 */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">
                        通知系统测试页面
                    </h1>
                    <p className="text-gray-600">
                        测试多通知队列、淡出效果和交互功能
                    </p>
                </motion.div>

                {/* 测试按钮区域 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 单个通知测试 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
                    >
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">
                            单个通知测试
                        </h2>
                        <div className="space-y-3">
                            {testNotifications.map((notification, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleSingleNotification(index)}
                                    className={`w-full px-4 py-3 rounded-lg font-medium transition-all duration-200 hover:scale-105 ${
                                        notification.type === 'success'
                                            ? 'bg-green-500 hover:bg-green-600 text-white'
                                            : notification.type === 'error'
                                            ? 'bg-red-500 hover:bg-red-600 text-white'
                                            : notification.type === 'warning'
                                            ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    }`}
                                >
                                    {notification.type.toUpperCase()} 通知
                                </button>
                            ))}
                        </div>
                    </motion.div>

                    {/* 批量通知测试 */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
                    >
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">
                            批量通知测试
                        </h2>
                        <div className="space-y-3">
                            <button
                                onClick={handleMultipleNotifications}
                                className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
                            >
                                顺序显示所有通知 (0.5s间隔)
                            </button>
                            <button
                                onClick={handleRapidNotifications}
                                className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
                            >
                                快速连续通知 (0.1s间隔)
                            </button>
                            <button
                                onClick={handleSimpleNotifications}
                                className="w-full px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
                            >
                                简单通知测试 (0.3s间隔)
                            </button>
                        </div>
                    </motion.div>
                </div>

                {/* 功能说明 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
                >
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        测试功能说明
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="font-semibold text-gray-700 mb-2">通知队列功能</h3>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• 支持多个通知同时显示</li>
                                <li>• 新通知出现时旧通知自动淡出</li>
                                <li>• 每个通知独立计时和管理</li>
                                <li>• 支持手动关闭通知</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-700 mb-2">交互功能</h3>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• 鼠标悬停暂停倒计时</li>
                                <li>• 进度条显示剩余时间</li>
                                <li>• 点击关闭按钮手动关闭</li>
                                <li>• 支持详细信息展示</li>
                            </ul>
                        </div>
                    </div>
                </motion.div>

                {/* 返回按钮 */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-8 text-center"
                >
                    <button
                        onClick={() => window.history.back()}
                        className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
                    >
                        返回上一页
                    </button>
                </motion.div>
            </div>
        </div>
    );
};

export default NotificationTestPage;
