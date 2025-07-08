import { useCallback } from 'react';
import { toast, ToastOptions } from 'react-toastify';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export const useToast = () => {
    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const options: ToastOptions = {
            position: 'top-right',
            autoClose: 4000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            draggablePercent: 60,
            className: `custom-toast custom-toast-${type} animated-toast`,
            style: {
                background: 'transparent',
                boxShadow: 'none',
                padding: 0,
                margin: 0,
                borderRadius: '16px',
                minHeight: 'auto',
                maxWidth: '400px',
            },
        };
        
        toast[type](message, options);
    }, []);

    // 便捷方法
    const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
    const error = useCallback((message: string) => showToast(message, 'error'), [showToast]);
    const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);
    const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);

    return { 
        showToast, 
        success, 
        error, 
        warning, 
        info 
    };
}; 