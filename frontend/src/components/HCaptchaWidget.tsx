import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

interface HCaptchaWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: any) => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact' | 'invisible';
  tabIndex?: number;
  'aria-label'?: string;
}

export interface HCaptchaWidgetRef {
  execute: () => void;
  reset: () => void;
  getResponse: () => string;
}

declare global {
  interface Window {
    hcaptcha: {
      render: (container: string | HTMLElement, params: any) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId?: string) => string;
    };
    onHCaptchaLoad?: () => void;
  }
}

const HCaptchaWidget = forwardRef<HCaptchaWidgetRef, HCaptchaWidgetProps>(({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = 'light',
  size = 'normal',
  tabIndex,
  'aria-label': ariaLabel = 'hCaptcha 人机验证'
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.hcaptcha || !siteKey || widgetIdRef.current) {
      return;
    }

    try {
      const widgetId = window.hcaptcha.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        tabindex: tabIndex,
        callback: (token: string) => {
          onVerify(token);
        },
        'expired-callback': () => {
          onExpire?.();
        },
        'error-callback': (error: any) => {
          console.error('hCaptcha error:', error);
          onError?.(error);
        }
      });

      widgetIdRef.current = widgetId;
    } catch (error) {
      console.error('Failed to render hCaptcha widget:', error);
      onError?.(error);
    }
  }, [siteKey, theme, size, tabIndex, onVerify, onExpire, onError]);

  const loadHCaptchaScript = useCallback(() => {
    if (isLoadingRef.current || window.hcaptcha) {
      if (window.hcaptcha) {
        renderWidget();
      }
      return;
    }

    isLoadingRef.current = true;

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=onHCaptchaLoad&render=explicit';
    script.async = true;
    script.defer = true;

    window.onHCaptchaLoad = () => {
      renderWidget();
    };

    script.onerror = () => {
      console.error('Failed to load hCaptcha script');
      isLoadingRef.current = false;
      onError?.(new Error('Failed to load hCaptcha script'));
    };

    document.head.appendChild(script);
  }, [renderWidget, onError]);

  useEffect(() => {
    loadHCaptchaScript();

    return () => {
      if (widgetIdRef.current && window.hcaptcha) {
        try {
          window.hcaptcha.remove(widgetIdRef.current);
        } catch (error) {
          console.warn('Failed to remove hCaptcha widget:', error);
        }
        widgetIdRef.current = null;
      }
    };
  }, [loadHCaptchaScript]);

  // Reset widget when siteKey changes
  useEffect(() => {
    if (widgetIdRef.current && window.hcaptcha) {
      try {
        window.hcaptcha.reset(widgetIdRef.current);
      } catch (error) {
        console.warn('Failed to reset hCaptcha widget:', error);
      }
    }
  }, [siteKey]);

  const executeChallenge = useCallback(() => {
    if (widgetIdRef.current && window.hcaptcha) {
      try {
        window.hcaptcha.execute(widgetIdRef.current);
      } catch (error) {
        console.error('Failed to execute hCaptcha challenge:', error);
        onError?.(error);
      }
    }
  }, [onError]);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.hcaptcha) {
      try {
        window.hcaptcha.reset(widgetIdRef.current);
      } catch (error) {
        console.warn('Failed to reset hCaptcha widget:', error);
      }
    }
  }, []);

  const getResponse = useCallback(() => {
    if (widgetIdRef.current && window.hcaptcha) {
      try {
        return window.hcaptcha.getResponse(widgetIdRef.current);
      } catch (error) {
        console.warn('Failed to get hCaptcha response:', error);
        return '';
      }
    }
    return '';
  }, []);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    execute: executeChallenge,
    reset: resetWidget,
    getResponse
  }));

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      role="region"
      className="hcaptcha-container"
    />
  );
});

HCaptchaWidget.displayName = 'HCaptchaWidget';

export default HCaptchaWidget;
