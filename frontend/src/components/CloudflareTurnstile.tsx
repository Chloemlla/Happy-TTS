import React, { useEffect, useRef } from 'react';

interface CloudflareTurnstileProps {
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  siteKey: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
  className?: string;
}

declare global {
  interface Window {
    turnstile: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark';
          size?: 'normal' | 'compact';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export const CloudflareTurnstile: React.FC<CloudflareTurnstileProps> = ({
  onVerify,
  onExpire,
  onError,
  siteKey,
  theme = 'light',
  size = 'normal',
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 动态加载 Cloudflare Turnstile 脚本
    const loadTurnstileScript = () => {
      if (window.turnstile) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile script'));
        
        document.head.appendChild(script);
      });
    };

    const initializeTurnstile = async () => {
      try {
        await loadTurnstileScript();
        
        if (containerRef.current) {
          // 使用官方推荐的方法：创建 cf-turnstile 元素
          const turnstileElement = document.createElement('div');
          turnstileElement.className = 'cf-turnstile';
          turnstileElement.setAttribute('data-sitekey', siteKey);
          turnstileElement.setAttribute('data-theme', theme);
          turnstileElement.setAttribute('data-size', size);
          
          // 添加回调属性
          turnstileElement.setAttribute('data-callback', 'turnstileCallback');
          turnstileElement.setAttribute('data-expired-callback', 'turnstileExpiredCallback');
          turnstileElement.setAttribute('data-error-callback', 'turnstileErrorCallback');
          
          // 清空容器并添加新元素
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(turnstileElement);
          
          // 定义全局回调函数
          (window as any).turnstileCallback = (token: string) => {
            onVerify(token);
          };
          
          (window as any).turnstileExpiredCallback = () => {
            onExpire();
          };
          
          (window as any).turnstileErrorCallback = () => {
            onError();
          };
        }
      } catch (error) {
        console.error('Failed to initialize Cloudflare Turnstile:', error);
        onError();
      }
    };

    initializeTurnstile();

    // 清理函数
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      // 清理全局回调函数
      delete (window as any).turnstileCallback;
      delete (window as any).turnstileExpiredCallback;
      delete (window as any).turnstileErrorCallback;
    };
  }, [siteKey, theme, size, onVerify, onExpire, onError]);

  const reset = () => {
    if (containerRef.current) {
      // 重新初始化组件来重置
      const turnstileElement = containerRef.current.querySelector('.cf-turnstile');
      if (turnstileElement) {
        turnstileElement.remove();
      }
      
      const newTurnstileElement = document.createElement('div');
      newTurnstileElement.className = 'cf-turnstile';
      newTurnstileElement.setAttribute('data-sitekey', siteKey);
      newTurnstileElement.setAttribute('data-theme', theme);
      newTurnstileElement.setAttribute('data-size', size);
      newTurnstileElement.setAttribute('data-callback', 'turnstileCallback');
      newTurnstileElement.setAttribute('data-expired-callback', 'turnstileExpiredCallback');
      newTurnstileElement.setAttribute('data-error-callback', 'turnstileErrorCallback');
      
      containerRef.current.appendChild(newTurnstileElement);
    }
  };

  return (
    <div className={`cloudflare-turnstile ${className}`}>
      <div 
        ref={containerRef} 
        className="turnstile-container transform transition-transform duration-200 hover:scale-105" 
      />
    </div>
  );
};

export default CloudflareTurnstile; 