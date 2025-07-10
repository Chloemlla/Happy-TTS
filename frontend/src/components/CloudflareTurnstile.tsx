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
  const widgetIdRef = useRef<string | null>(null);

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

    const renderTurnstile = async () => {
      try {
        await loadTurnstileScript();
        
        if (containerRef.current && window.turnstile) {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            size,
            callback: onVerify,
            'expired-callback': onExpire,
            'error-callback': onError
          });
        }
      } catch (error) {
        console.error('Failed to render Cloudflare Turnstile:', error);
        onError();
      }
    };

    renderTurnstile();

    // 清理函数
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    };
  }, [siteKey, theme, size, onVerify, onExpire, onError]);

  const reset = () => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
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