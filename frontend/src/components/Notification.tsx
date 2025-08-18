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
    setNotification: () => {},
});

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notification, setNotificationState] = useState<NotificationData | null>(null);
    const progressRef = React.useRef<HTMLDivElement>(null);
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const rafRef = React.useRef<number | null>(null);
    const startTimeRef = React.useRef<number>(0);
    const duration = 3000;

    // 进度条动画
    React.useEffect(() => {
        if (!notification) {
            if (progressRef.current) progressRef.current.style.width = '0%';
            return;
        }
        if (progressRef.current) progressRef.current.style.width = '100%';
        startTimeRef.current = performance.now();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (timerRef.current) clearTimeout(timerRef.current);
        function animate(now: number) {
            const elapsed = now - startTimeRef.current;
            const percent = Math.max(0, 100 - (elapsed / duration) * 100);
            if (progressRef.current) progressRef.current.style.width = percent + '%';
            if (elapsed < duration) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                if (progressRef.current) progressRef.current.style.width = '0%';
                setNotificationState(null);
            }
        }
        rafRef.current = requestAnimationFrame(animate);
        timerRef.current = setTimeout(() => {
            setNotificationState(null);
            if (progressRef.current) progressRef.current.style.width = '0%';
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }, duration);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [notification]);

    const setNotification = useCallback((data: NotificationData) => {
        setNotificationState(null); // 先关闭再弹出，确保动画重置
        setTimeout(() => setNotificationState(data), 10);
    }, []);

    const handleClose = () => {
        setNotificationState(null);
        if (progressRef.current) progressRef.current.style.width = '0%';
        if (timerRef.current) clearTimeout(timerRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    React.useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
                        className={`fixed top-4 right-4 z-[9999] bg-white/90 text-gray-800 px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg backdrop-blur-sm border flex flex-col items-stretch min-w-[200px] max-w-xs`}
                        style={{ gap: 8 }}
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
                        <div className="w-full h-1 mt-2 rounded bg-gray-200 overflow-hidden">
                            <div
                                ref={progressRef}
                                className="h-full"
                                style={{
                                    width: '100%',
                                    background: getBarColor(notification.type),
                                    transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
                                }}
                            />
                        </div>
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