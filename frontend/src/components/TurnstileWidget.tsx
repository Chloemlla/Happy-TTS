import React, { useEffect, useRef } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
  callback?: string;
  'expired-callback'?: string;
  'error-callback'?: string;
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

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = 'light',
  size = 'normal',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 加载 Turnstile 脚本
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (containerRef.current && window.turnstile) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          callback: onVerify,
          'expired-callback': onExpire,
          'error-callback': onError,
        });
      }
    };

    document.head.appendChild(script);

    return () => {
      // 清理脚本
      const existingScript = document.querySelector('script[src*="turnstile"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [siteKey, theme, size, onVerify, onExpire, onError]);

  const reset = () => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  return (
    <div className="turnstile-widget">
      <div ref={containerRef} className="cf-turnstile" />
    </div>
  );
}; 