import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface NotificationData {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

interface NotificationContextProps {
    setNotification: (data: NotificationData) => void;
}

const NotificationContext = createContext<NotificationContextProps>({
    setNotification: () => { },
});

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notification, setNotificationState] = useState<NotificationData | null>(null);
    const [isPaused, setIsPaused] = useState<boolean>(false);
    const progressRef = React.useRef<HTMLDivElement>(null);
    const rafRef = React.useRef<number | null>(null);
    const startTimeRef = React.useRef<number>(0);
    const pausedTimeRef = React.useRef<number>(0);
    const isActiveRef = React.useRef<boolean>(false);
    const isPausedRef = React.useRef<boolean>(false);
    const notificationIdRef = React.useRef<number>(0);
    const duration = 3000;

    // 更新暂停状态的 ref
    React.useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    // 处理暂停和恢复
    const handleMouseEnter = React.useCallback(() => {
        if (isActiveRef.current && !isPausedRef.current) {
            setIsPaused(true);
            pausedTimeRef.current = performance.now();
        }
    }, []);

    const handleMouseLeave = React.useCallback(() => {
        if (isActiveRef.current && isPausedRef.current) {
            setIsPaused(false);
            // 调整开始时间，补偿暂停的时间
            const pausedDuration = performance.now() - pausedTimeRef.current;
            startTimeRef.current += pausedDuration;
        }
    }, []);

    // 统一的进度条和倒计时管理
    React.useEffect(() => {
        if (!notification) {
            // 清理状态
            isActiveRef.current = false;
            setIsPaused(false);
            isPausedRef.current = false;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (progressRef.current) {
                progressRef.current.style.width = '0%';
            }
            return;
        }

        // 为这个通知分配一个唯一ID，防止竞争条件
        const currentNotificationId = ++notificationIdRef.current;

        // 清理之前的动画
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        // 重置状态
        isActiveRef.current = true;
        setIsPaused(false);
        isPausedRef.current = false;

        // 使用 requestAnimationFrame 确保 DOM 更新后再开始动画
        const startAnimation = () => {
            // 检查这个通知是否仍然是当前的通知
            if (currentNotificationId !== notificationIdRef.current || !isActiveRef.current) {
                return;
            }

            // 设置开始时间和初始状态
            startTimeRef.current = performance.now();
            pausedTimeRef.current = 0;

            if (progressRef.current) {
                progressRef.current.style.width = '100%';
            }

            const animate = (now: number) => {
                // 检查这个动画是否仍然有效
                if (currentNotificationId !== notificationIdRef.current || !isActiveRef.current) {
                    return;
                }

                // 如果暂停，不更新进度，但继续动画循环
                if (isPausedRef.current) {
                    rafRef.current = requestAnimationFrame(animate);
                    return;
                }

                const elapsed = now - startTimeRef.current;
                const progress = Math.max(0, Math.min(100, 100 - (elapsed / duration) * 100));

                if (progressRef.current) {
                    progressRef.current.style.width = `${progress}%`;
                }

                if (elapsed >= duration) {
                    // 时间到了，关闭通知
                    if (currentNotificationId === notificationIdRef.current) {
                        isActiveRef.current = false;
                        setNotificationState(null);
                    }
                } else {
                    // 继续动画
                    rafRef.current = requestAnimationFrame(animate);
                }
            };

            // 启动动画
            rafRef.current = requestAnimationFrame(animate);
        };

        requestAnimationFrame(startAnimation);

        // 清理函数
        return () => {
            if (currentNotificationId === notificationIdRef.current) {
                isActiveRef.current = false;
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
            }
        };
    }, [notification]); // 只依赖 notification

    const setNotification = useCallback((data: NotificationData) => {
        // 直接设置新通知，不需要延迟重置
        setNotificationState(data);
    }, []);

    const handleClose = React.useCallback(() => {
        isActiveRef.current = false;
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setNotificationState(null);
    }, []);

    // 组件卸载时清理
    React.useEffect(() => {
        return () => {
            isActiveRef.current = false;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    return (
        <NotificationContext.Provider value={{ setNotification }}>
            {children}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: -32, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } }}
                        exit={{ opacity: 0, y: -24, scale: 0.96, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
                        className={`fixed top-4 right-4 z-[9999] bg-white/90 text-gray-800 px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg backdrop-blur-sm border flex flex-col items-stretch min-w-[200px] max-w-xs cursor-pointer select-none ${isPaused ? 'ring-2 ring-blue-200' : ''}`}
                        style={{ gap: 8 }}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="flex items-center" style={{ gap: 12 }}>
                            <StatusIcon type={notification.type} />
                            <div className="text-sm sm:text-base font-medium break-all pr-2 flex-1">{notification.message}</div>
                            <button
                                onClick={handleClose}
                                className="p-1 sm:p-2 rounded-full hover:bg-gray-100 focus:outline-none transition-all duration-150 flex items-center justify-center"
                                aria-label="关闭通知"
                                style={{ alignSelf: 'center', marginLeft: 4 }}
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
                                className={`h-full transition-none ${isPaused ? 'animate-pulse' : ''}`}
                                style={{
                                    width: '100%',
                                    background: isPaused
                                        ? `linear-gradient(90deg, ${getBarColor(notification.type)}80, ${getBarColor(notification.type)})`
                                        : `linear-gradient(90deg, ${getBarColor(notification.type)}, ${getBarColor(notification.type)}dd)`,
                                    transformOrigin: 'left center',
                                }}
                            />
                            {isPaused && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-1 h-1 bg-white rounded-full opacity-80"></div>
                                </div>
                            )}
                        </div>
                        {isPaused && (
                            <div className="text-xs text-gray-500 text-center mt-1 opacity-75">
                                悬停暂停 • Hover to pause
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    );
};

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