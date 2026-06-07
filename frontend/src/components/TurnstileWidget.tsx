import React, { useEffect, useRef, useCallback } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
}

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
  language?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile: {
      render: (
        container: string | HTMLElement,
        options: TurnstileRenderOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

// 全局脚本加载状态
let scriptLoaded = false;
let turnstileScriptPromise: Promise<void> | null = null;
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SCRIPT_SELECTOR = 'script[data-turnstile-api="true"], script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';
const TURNSTILE_LOAD_TIMEOUT_MS = 10000;

const isTurnstileDebugEnabled = () => import.meta.env.DEV || import.meta.env.VITE_TURNSTILE_DEBUG === 'true';

const debugTurnstile = (...args: unknown[]) => {
  if (isTurnstileDebugEnabled()) {
    console.debug(...args);
  }
};

const warnTurnstile = (...args: unknown[]) => {
  if (isTurnstileDebugEnabled()) {
    console.warn(...args);
  }
};

const maskSiteKey = (value: string) => {
  if (value.length <= 8) {
    return 'present';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const installDevelopmentTurnstile = () => {
  window.turnstile = {
    render: (container: string | HTMLElement, options: TurnstileRenderOptions) => {
      const element = typeof container === 'string' ? document.getElementById(container) : container;
      if (element) {
        element.replaceChildren();

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '点击模拟验证 (开发模式)';
        button.style.width = '300px';
        button.style.height = '65px';
        button.style.border = '2px dashed #9ca3af';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.background = '#f9fafb';
        button.style.color = '#4b5563';
        button.style.fontFamily = 'Arial, sans-serif';
        button.style.fontSize = '14px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', () => {
          button.style.background = '#e8f5e8';
          button.textContent = '验证成功 (开发模式)';
          window.setTimeout(() => options.callback?.(`mock-token-${Date.now()}`), 500);
        });

        element.appendChild(button);
      }

      return 'mock-widget-id';
    },
    reset: (widgetId: string) => {
      debugTurnstile('开发环境：重置 Turnstile widget', widgetId);
    },
    remove: (widgetId: string) => {
      debugTurnstile('开发环境：移除 Turnstile widget', widgetId);
    },
  };
};

const waitForTurnstileApi = (timeoutMs = TURNSTILE_LOAD_TIMEOUT_MS): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const checkLoaded = () => {
      if (window.turnstile) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Turnstile API did not initialize'));
        return;
      }

      window.setTimeout(checkLoaded, 100);
    };

    checkLoaded();
  });
};

const loadTurnstileScript = (): Promise<void> => {
  if (scriptLoaded && window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  if (import.meta.env.DEV) {
    warnTurnstile('开发环境：使用模拟 Turnstile 控件');
    installDevelopmentTurnstile();
    scriptLoaded = true;
    return Promise.resolve();
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    if (scriptLoaded && window.turnstile) {
      resolve();
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      fail(new Error('Turnstile script load timed out'));
    }, TURNSTILE_LOAD_TIMEOUT_MS);

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      scriptLoaded = true;
      resolve();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      scriptLoaded = false;
      turnstileScriptPromise = null;
      reject(error);
    };

    const waitForApi = () => {
      waitForTurnstileApi()
        .then(finish)
        .catch(fail);
    };

    // 检查是否已经存在脚本
    const existingScript = document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR);
    if (existingScript) {
      existingScript.addEventListener('load', waitForApi, { once: true });
      existingScript.addEventListener('error', () => fail(new Error('Turnstile script failed to load')), { once: true });
      waitForApi();
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileApi = 'true';
    script.setAttribute('data-cfasync', 'false');

    script.onload = () => {
      waitForApi();
    };

    script.onerror = () => {
      fail(new Error('Turnstile script failed to load'));
    };

    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
};

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
  const mountedRef = useRef(false);
  const verifiedRef = useRef(false);

  const renderWidget = useCallback(async () => {
    if (!containerRef.current || !window.turnstile || mountedRef.current || verifiedRef.current) {
      debugTurnstile('Turnstile: Skipping render', {
        hasContainer: !!containerRef.current,
        hasTurnstile: !!window.turnstile,
        mounted: mountedRef.current,
        verified: verifiedRef.current,
      });
      return;
    }

    try {
      if (typeof siteKey !== 'string') {
        console.error('Turnstile: siteKey must be a string', siteKey);
        onError();
        return;
      }

      const cleanSiteKey = siteKey.trim();
      debugTurnstile('Turnstile siteKey loaded', { siteKey: maskSiteKey(cleanSiteKey) });
      
      if (!cleanSiteKey) {
        console.error('Turnstile: Invalid siteKey provided');
        onError();
        return;
      }

      // 清理容器
      containerRef.current.innerHTML = '';

      debugTurnstile('Turnstile render options', {
        sitekey: maskSiteKey(cleanSiteKey),
        theme,
        size,
        callback: typeof onVerify,
        'expired-callback': typeof onExpire,
        'error-callback': typeof onError,
      });

      // 传递完整的配置，包括回调函数
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: cleanSiteKey,
        theme,
        size,
        callback: (token: string) => {
          debugTurnstile('Turnstile callback triggered', { tokenLength: token.length });
          verifiedRef.current = true;
          onVerify(token);
        },
        'expired-callback': () => {
          debugTurnstile('Turnstile expired');
          verifiedRef.current = false;
          onExpire();
        },
        'error-callback': () => {
          debugTurnstile('Turnstile error');
          verifiedRef.current = false;
          onError();
        },
      });

      mountedRef.current = true;
    } catch (error) {
      console.error('Turnstile render error:', error);
      onError();
    }
  }, [siteKey, theme, size]); // 移除回调函数依赖，避免无限循环

  useEffect(() => {
    let mounted = true;

    const initWidget = async () => {
      try {
        await loadTurnstileScript();
        if (mounted) {
          await renderWidget();
        }
      } catch (error) {
        console.error('Turnstile initialization error:', error);
        if (mounted) {
          onError();
        }
      }
    };

    initWidget();

    return () => {
      mounted = false;
      mountedRef.current = false;
      
      // 清理 widget
      if (widgetIdRef.current && window.turnstile) {
        try {
          if (typeof window.turnstile.remove === 'function') {
            window.turnstile.remove(widgetIdRef.current);
          } else {
            window.turnstile.reset(widgetIdRef.current);
          }
        } catch (error) {
          warnTurnstile('Turnstile cleanup error:', error);
        }
        widgetIdRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []); // 只在组件挂载时执行一次

  // 当 siteKey 变化时重新渲染（仅在未验证成功时）
  useEffect(() => {
    if (mountedRef.current && window.turnstile && !verifiedRef.current) {
      debugTurnstile('Turnstile: siteKey changed, re-rendering');
      mountedRef.current = false;
      renderWidget();
    }
  }, [siteKey]); // 移除 renderWidget 依赖，避免无限循环

  return (
    <div className="turnstile-widget">
      <div ref={containerRef} className="turnstile-widget-container" />
    </div>
  );
}; 
