import React, { createContext, use, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface NotificationData {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    details?: string[]; // 可选的详细信息数组
    title?: string; // 可选的标题
    duration?: number; // 可选的展示时长（毫秒），默认 3000
}

interface NotificationItem extends NotificationData {
    id: number;
    isPaused: boolean;
    isFaded: boolean;
    startTime: number;
    pausedTime: number;
    remainingTime: number;
    itemDuration: number; // 该通知的实际展示时长
}

interface NotificationContextProps {
    setNotification: (data: NotificationData) => void;
}

const NotificationContext = createContext<NotificationContextProps>({
    setNotification: () => { },
});

export const useNotification = () => use(NotificationContext);

// Toast 兼容接口（支持 shadcn/ui 风格）
interface ToastOptions {
    title?: string;
    description?: string;
    variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info' | 'error';
}

// 提供 useToast hook 用于兼容性
export const useToast = () => {
    const { setNotification } = useNotification();

    const toast = (options: ToastOptions) => {
        // 智能类型推断
        let type: NotificationData['type'] = 'info';

        if (options.variant) {
            // 直接映射标准类型
            if (options.variant === 'destructive' || options.variant === 'error') {
                type = 'error';
            } else if (options.variant === 'success') {
                type = 'success';
            } else if (options.variant === 'warning') {
                type = 'warning';
            } else if (options.variant === 'info' || options.variant === 'default') {
                type = 'info';
            }
        } else {
            // 根据标题内容智能推断
            const title = options.title?.toLowerCase() || '';
            const description = options.description?.toLowerCase() || '';
            const content = title + ' ' + description;

            if (content.includes('成功') || content.includes('完成') || content.includes('success')) {
                type = 'success';
            } else if (content.includes('错误') || content.includes('失败') || content.includes('error') || content.includes('failed')) {
                type = 'error';
            } else if (content.includes('警告') || content.includes('注意') || content.includes('warning')) {
                type = 'warning';
            }
        }

        setNotification({
            type,
            title: options.title,
            message: options.description || options.title || '通知',
        });
    };

    return { toast };
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const notificationIdRef = React.useRef<number>(0);
    const timersRef = React.useRef<Map<number, NodeJS.Timeout>>(new Map());
    const duration = 3000;

    // 创建新通知的函数
    const createNotificationItem = useCallback((data: NotificationData): NotificationItem => {
        const id = ++notificationIdRef.current;
        const itemDuration = data.duration ?? duration;
        return {
            ...data,
            id,
            isPaused: false,
            isFaded: false,
            startTime: Date.now(),
            pausedTime: 0,
            remainingTime: itemDuration,
            itemDuration,
        };
    }, []);

    // 启动通知计时器 - 使用简单的setTimeout替代RAF
    const startNotificationTimer = useCallback((notification: NotificationItem) => {
        const timer = setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
            timersRef.current.delete(notification.id);
        }, notification.remainingTime);

        timersRef.current.set(notification.id, timer);
    }, []);

    // 处理鼠标悬停暂停
    const handleMouseEnter = useCallback((notificationId: number) => {
        const timer = timersRef.current.get(notificationId);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(notificationId);
        }

        setNotifications(prev =>
            prev.map(n => {
                if (n.id === notificationId && !n.isPaused) {
                    const elapsed = Date.now() - n.startTime;
                    return {
                        ...n,
                        isPaused: true,
                        pausedTime: Date.now(),
                        remainingTime: Math.max(0, n.itemDuration - elapsed)
                    };
                }
                return n;
            })
        );
    }, []);

    // 处理鼠标离开恢复
    const handleMouseLeave = useCallback((notificationId: number) => {
        setNotifications(prev => {
            const notification = prev.find(n => n.id === notificationId);
            if (notification && notification.isPaused) {
                // 重新启动计时器
                const timer = setTimeout(() => {
                    setNotifications(p => p.filter(n => n.id !== notificationId));
                    timersRef.current.delete(notificationId);
                }, notification.remainingTime);

                timersRef.current.set(notificationId, timer);
            }

            return prev.map(n => {
                if (n.id === notificationId && n.isPaused) {
                    return {
                        ...n,
                        isPaused: false,
                        startTime: Date.now() - (n.itemDuration - n.remainingTime)
                    };
                }
                return n;
            });
        });
    }, []);

    // 设置新通知
    const setNotification = useCallback((data: NotificationData) => {
        const newNotification = createNotificationItem(data);

        setNotifications(prev => {
            // 将现有通知设为淡出状态
            const updatedPrev = prev.map(n => ({ ...n, isFaded: true }));

            // 添加新通知到队列前面
            return [newNotification, ...updatedPrev];
        });

        // 启动新通知的计时器
        startNotificationTimer(newNotification);
    }, [createNotificationItem, startNotificationTimer]);

    // 手动关闭通知
    const handleClose = useCallback((notificationId: number) => {
        const timer = timersRef.current.get(notificationId);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(notificationId);
        }
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }, []);

    // 组件卸载时清理所有计时器
    React.useEffect(() => {
        return () => {
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
        };
    }, []);

    return (
        <NotificationContext.Provider value={{ setNotification }}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] space-y-3">
                <AnimatePresence mode="popLayout">
                    {notifications.map((notification, index) => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            index={index}
                            onMouseEnter={() => handleMouseEnter(notification.id)}
                            onMouseLeave={() => handleMouseLeave(notification.id)}
                            onClose={() => handleClose(notification.id)}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </NotificationContext.Provider>
    );
};

// 单个通知项组件
interface NotificationItemProps {
    notification: NotificationItem;
    index: number;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClose: () => void;
}

const NotificationCard = React.memo(React.forwardRef<HTMLDivElement, NotificationItemProps>(({
    notification,
    index,
    onMouseEnter,
    onMouseLeave,
    onClose,
}, ref) => {
    const duration = notification.itemDuration;
    const progressRef = React.useRef<HTMLDivElement>(null);
    const animationRef = React.useRef<number | null>(null);

    // 实时进度状态 - 根据当前剩余时间计算初始进度
    const [currentProgress, setCurrentProgress] = React.useState(() => {
        // 计算初始进度值
        const elapsed = Date.now() - notification.startTime;
        const initialProgress = Math.max(0, Math.min(100, 100 - (elapsed / duration) * 100));
        return initialProgress;
    });
    const updateIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
    const lastUpdateTimeRef = React.useRef<number>(Date.now());

    // 启动进度条更新
    React.useEffect(() => {
        if (notification.isPaused) {
            // 暂停时清除动画
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            setCurrentProgress((notification.remainingTime / duration) * 100);
            return;
        }

        // 使用RAF实现平滑的进度更新
        const updateProgress = () => {
            const now = Date.now();
            const elapsed = now - notification.startTime;
            const targetProgress = Math.max(0, Math.min(100, 100 - (elapsed / duration) * 100));

            // 直接设置目标进度，不使用插值（避免延迟）
            setCurrentProgress(targetProgress);

            if (targetProgress > 0) {
                animationRef.current = requestAnimationFrame(updateProgress);
            } else {
                // 进度完成，确保设置为0
                setCurrentProgress(0);
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                    animationRef.current = null;
                }
            }
        };

        // 立即更新一次当前进度，然后开始动画
        const now = Date.now();
        const elapsed = now - notification.startTime;
        const currentTargetProgress = Math.max(0, Math.min(100, 100 - (elapsed / duration) * 100));
        setCurrentProgress(currentTargetProgress);

        // 开始RAF动画循环
        animationRef.current = requestAnimationFrame(updateProgress);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [notification.isPaused, notification.startTime, notification.remainingTime, duration]);

    // 计算动画属性
    const opacity = notification.isFaded ? 0.6 : 1;
    const y = index * 4; // 轻微的层叠效果

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, y: -32 }}
            animate={{
                opacity,
                y,
                transition: {
                    duration: 0.32,
                    ease: [0.4, 0, 0.2, 1],
                    opacity: { duration: notification.isFaded ? 0.2 : 0.32 }
                }
            }}
            exit={{
                opacity: 0,
                y: -24,
                transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] }
            }}
            className={`bg-white/90 text-gray-800 px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg backdrop-blur-sm border flex flex-col items-stretch min-w-[200px] max-w-sm cursor-pointer select-none ${notification.isPaused ? 'ring-2 ring-blue-200' : ''
                } ${notification.isFaded ? 'shadow-md' : 'shadow-lg'
                }`}
            style={{ gap: 8 }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={`flex ${notification.details && notification.details.length > 0 ? 'items-start' : 'items-center'}`} style={{ gap: 12 }}>
                <StatusIcon type={notification.type} />
                <div className="flex-1 pr-2">
                    {notification.title && (
                        <div className="text-sm sm:text-base font-semibold mb-1 break-all">
                            {notification.title}
                        </div>
                    )}
                    <div className="text-sm sm:text-base font-medium break-all">
                        {notification.message}
                    </div>
                    {notification.details && notification.details.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {notification.details.map((detail, index) => (
                                <div key={index} className="text-xs sm:text-sm text-gray-600 break-all pl-2 border-l-2 border-gray-200">
                                    {detail}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 sm:p-2 rounded-full hover:bg-gray-100 focus:outline-none transition-all duration-150 flex items-center justify-center flex-shrink-0"
                    aria-label="关闭通知"
                    style={{ alignSelf: 'flex-start', marginTop: -2 }}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            {/* 底部进度条 */}
            <div className="w-full h-1 mt-2 rounded bg-gray-200 overflow-hidden relative">
                <div
                    ref={progressRef}
                    className={`h-full ${notification.isPaused ? 'animate-pulse' : ''}`}
                    style={{
                        width: `${currentProgress}%`,
                        background: notification.isPaused
                            ? `linear-gradient(90deg, ${getBarColor(notification.type)}80, ${getBarColor(notification.type)})`
                            : `linear-gradient(90deg, ${getBarColor(notification.type)}, ${getBarColor(notification.type)}dd)`,
                        transformOrigin: 'left center',
                        willChange: 'width',
                        transition: 'none', // 移除CSS过渡，让RAF完全控制动画
                    }}
                />
                {notification.isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1 h-1 bg-white rounded-full opacity-80"></div>
                    </div>
                )}
            </div>
            {notification.isPaused && (
                <div className="text-xs text-gray-500 text-center mt-1 opacity-75">
                    悬停暂停 • Hover to pause
                </div>
            )}
        </motion.div>
    );
}));

function StatusIcon({ type }: { type: NotificationData['type'] }) {
    switch (type) {
        case 'success':
            return (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" stroke="#22c55e" strokeWidth="2" fill="#e9fbe8" />
                    {/* 轻微上移并向右平移，修正视觉偏左下 */}
                    <g transform="translate(0.5,-0.5)">
                        <path stroke="#22c55e" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 12.5L10.5 15.5L16 10" />
                    </g>
                </svg>
            );
        case 'error':
            return (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" stroke="#ef4444" strokeWidth="2" fill="#fbeaea" />
                    <g transform="translate(0,-0.5)">
                        <path stroke="#ef4444" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-6 6M9 9l6 6" />
                    </g>
                </svg>
            );
        case 'warning':
            return (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" stroke="#eab308" strokeWidth="2" fill="#fffbe8" />
                    <g transform="translate(0,-0.5)">
                        <path stroke="#eab308" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                    </g>
                </svg>
            );
        case 'info':
        default:
            return (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10.5" stroke="#3b82f6" strokeWidth="2" fill="#e8f1fb" />
                    <g transform="translate(0,-0.5)">
                        <path stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8h.01M12 12v4" />
                    </g>
                </svg>
            );
    }
}

function getBarColor(type: NotificationData['type']) {
    switch (type) {
        case 'success':
            return '#22c55e';
        case 'error':
            return '#ef4444';
        case 'warning':
            return '#eab308';
        case 'info':
        default:
            return '#3b82f6';
    }
} 