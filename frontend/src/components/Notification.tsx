import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationProps {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onClose: () => void;
    duration?: number;
}

export const Notification: React.FC<NotificationProps> = ({
    message,
    type,
    onClose,
    duration = 5000
}) => {
    React.useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const getTypeStyles = () => {
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
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.3 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                className={`fixed top-4 right-4 z-[9999] ${getTypeStyles()} text-white px-6 py-3 rounded-lg shadow-lg backdrop-blur-sm bg-opacity-95 flex items-center space-x-3`}
            >
                <span className="text-sm font-medium">{message}</span>
                <button
                    onClick={onClose}
                    className="ml-4 hover:text-gray-200 transition-colors focus:outline-none"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </motion.div>
        </AnimatePresence>
    );
}; 