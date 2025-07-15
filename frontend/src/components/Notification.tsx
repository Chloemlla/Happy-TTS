import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationData {
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

    const setNotification = useCallback((data: NotificationData) => {
        setNotificationState(data);
    }, []);

    const handleClose = () => setNotificationState(null);

    return (
        <NotificationContext.Provider value={{ setNotification }}>
            {children}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: -50, scale: 0.3 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                        className={`fixed top-4 right-4 z-[9999] ${getTypeStyles(notification.type)} text-white px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg backdrop-blur-sm bg-opacity-95 flex justify-between items-center min-w-[180px] max-w-xs`}
                    >
                        <div className="text-sm sm:text-base font-medium break-all pr-2 flex-1">{notification.message}</div>
                        <div className="flex items-center">
                            <button
                                onClick={handleClose}
                                className="p-1 sm:p-2 rounded-full hover:bg-white/20 focus:outline-none transition-all duration-150"
                                aria-label="关闭通知"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    );
};

function getTypeStyles(type: NotificationData['type']) {
    switch (type) {
        case 'success':
            return 'bg-green-500';
        case 'error':
            return 'bg-red-500';
        case 'warning':
            return 'bg-yellow-500';
        case 'info':
            return 'bg-blue-500';
        default:
            return 'bg-gray-500';
    }
} 