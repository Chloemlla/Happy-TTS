import React from 'react';
import { motion } from 'framer-motion';
import { FaBell, FaInfoCircle, FaLayerGroup, FaListOl } from 'react-icons/fa';
import { useNotification } from './Notification';
import {
    InfoBadge,
    InfoPanel,
    InfoQueryHero,
    InfoQueryShell,
    InfoSectionTitle,
    logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

const notificationMeta = {
    success: {
        label: 'SUCCESS',
        className: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
    },
    error: {
        label: 'ERROR',
        className: 'border-rose-200 bg-rose-50/80 text-rose-700',
    },
    warning: {
        label: 'WARNING',
        className: 'border-amber-200 bg-amber-50/80 text-amber-700',
    },
    info: {
        label: 'INFO',
        className: 'border-sky-200 bg-sky-50/80 text-sky-700',
    },
};

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
        <InfoQueryShell maxWidthClassName="max-w-5xl" className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <InfoQueryHero
                    eyebrow="Notification"
                    title="通知系统测试页面"
                    description="测试多通知队列、淡出效果、手动关闭和详细信息展示。"
                    icon={FaBell}
                    meta={
                        <>
                            <InfoBadge>单条通知</InfoBadge>
                            <InfoBadge>批量通知</InfoBadge>
                            <InfoBadge>快速队列</InfoBadge>
                        </>
                    }
                />
            </motion.div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <InfoPanel className="h-full">
                        <InfoSectionTitle
                            icon={FaListOl}
                            eyebrow="Single"
                            title="单个通知测试"
                            description="逐个触发不同类型的通知，检查样式、层级和关闭行为。"
                        />
                        <div className="space-y-3">
                            {testNotifications.map((notification, index) => {
                                const meta = notificationMeta[notification.type];
                                return (
                                    <button
                                        key={notification.type}
                                        onClick={() => handleSingleNotification(index)}
                                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                                    >
                                        <span>{notification.title}</span>
                                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}>
                                            {meta.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </InfoPanel>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <InfoPanel className="h-full">
                        <InfoSectionTitle
                            icon={FaLayerGroup}
                            eyebrow="Queue"
                            title="批量通知测试"
                            description="模拟连续入队、快速覆盖和简单消息等典型通知压力场景。"
                        />
                        <div className="space-y-3">
                            <button onClick={handleMultipleNotifications} className={`${logShareSecondaryButtonClass} w-full`}>
                                顺序显示所有通知 (0.5s 间隔)
                            </button>
                            <button onClick={handleRapidNotifications} className={`${logShareSecondaryButtonClass} w-full`}>
                                快速连续通知 (0.1s 间隔)
                            </button>
                            <button onClick={handleSimpleNotifications} className={`${logShareSecondaryButtonClass} w-full`}>
                                简单通知测试 (0.3s 间隔)
                            </button>
                        </div>
                    </InfoPanel>
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <InfoPanel>
                    <InfoSectionTitle
                        icon={FaInfoCircle}
                        eyebrow="Behavior"
                        title="测试功能说明"
                        description="用于核对通知系统的队列策略、倒计时、关闭和详情展示。"
                    />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                            <h3 className="font-semibold text-slate-800">通知队列功能</h3>
                            <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                <li>支持多个通知同时显示</li>
                                <li>新通知出现时旧通知自动淡出</li>
                                <li>每个通知独立计时和管理</li>
                                <li>支持手动关闭通知</li>
                            </ul>
                        </div>
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                            <h3 className="font-semibold text-slate-800">交互功能</h3>
                            <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                <li>鼠标悬停暂停倒计时</li>
                                <li>进度条显示剩余时间</li>
                                <li>点击关闭按钮手动关闭</li>
                                <li>支持详细信息展示</li>
                            </ul>
                        </div>
                    </div>
                </InfoPanel>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex justify-center"
            >
                <button onClick={() => window.history.back()} className={logShareSecondaryButtonClass}>
                    返回上一页
                </button>
            </motion.div>
        </InfoQueryShell>
    );
};

export default NotificationTestPage;
