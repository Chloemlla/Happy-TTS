import React, { useEffect, useRef, useCallback } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
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
    mockTurnstileCallback?: () => void;
  }
}

// 全局脚本加载状态
let scriptLoaded = false;
let scriptLoading = false;

const loadTurnstileScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (scriptLoaded) {
      resolve();
      return;
    }

    if (scriptLoading) {
      // 如果正在加载，等待加载完成
      const checkLoaded = () => {
        if (scriptLoaded) {
          resolve();
        } else if (scriptLoading) {
          setTimeout(checkLoaded, 100);
        } else {
          reject(new Error('Script loading failed'));
        }
      };
      checkLoaded();
      return;
    }

    scriptLoading = true;

    // 检查是否已经存在脚本
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript) {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      return;
    }

    // 开发环境或脚本加载失败时的模拟处理
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      console.warn('🔧 开发环境：模拟 Turnstile 脚本加载');
      // 模拟 Turnstile API
      window.turnstile = {
        render: (container: string | HTMLElement, options: any) => {
          const element = typeof container === 'string' ? document.getElementById(container) : container;
          if (element) {
            element.innerHTML = `
              <div style="
                width: 300px;
                height: 65px;
                border: 2px dashed #ccc;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f9f9f9;
                color: #666;
                font-family: Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
              " onclick="this.style.background='#e8f5e8'; this.innerHTML='✅ 验证成功 (开发模式)'; setTimeout(() => { if (window.mockTurnstileCallback) window.mockTurnstileCallback(); }, 500);">
                🔧 点击模拟验证 (开发模式)
              </div>
            `;
            
            // 设置模拟回调
            window.mockTurnstileCallback = () => {
              if (options.callback) {
                options.callback('mock-token-' + Date.now());
              }
            };
          }
          return 'mock-widget-id';
        },
        reset: (widgetId: string) => {
          console.log('🔧 开发环境：重置 Turnstile widget', widgetId);
        }
      };
      
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;

    // 设置超时
    const timeout = setTimeout(() => {
      scriptLoading = false;
      console.warn('⚠️ Turnstile 脚本加载超时，启用开发模式');
      
      // 超时后启用模拟模式
      window.turnstile = {
        render: (container: string | HTMLElement, options: any) => {
          const element = typeof container === 'string' ? document.getElementById(container) : container;
          if (element) {
            element.innerHTML = `
              <div style="
                width: 300px;
                height: 65px;
                border: 2px dashed #orange;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #fff3cd;
                color: #856404;
                font-family: Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
              " onclick="this.style.background='#e8f5e8'; this.innerHTML='✅ 验证成功 (离线模式)'; setTimeout(() => { if (window.mockTurnstileCallback) window.mockTurnstileCallback(); }, 500);">
                ⚠️ 点击模拟验证 (离线模式)
              </div>
            `;
            
            window.mockTurnstileCallback = () => {
              if (options.callback) {
                options.callback('offline-token-' + Date.now());
              }
            };
          }
          return 'offline-widget-id';
        },
        reset: (widgetId: string) => {
          console.log('⚠️ 离线模式：重置 Turnstile widget', widgetId);
        }
      };
      
      scriptLoaded = true;
      resolve();
    }, 5000); // 5秒超时

    script.onload = () => {
      clearTimeout(timeout);
      scriptLoaded = true;
      scriptLoading = false;
      console.log('✅ Turnstile 脚本加载成功');
      resolve();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      scriptLoading = false;
      console.warn('❌ Turnstile 脚本加载失败，启用离线模式');
      
      // 加载失败时启用模拟模式
      window.turnstile = {
        render: (container: string | HTMLElement, options: any) => {
          const element = typeof container === 'string' ? document.getElementById(container) : container;
          if (element) {
            element.innerHTML = `
              <div style="
                width: 300px;
                height: 65px;
                border: 2px dashed #dc3545;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f8d7da;
                color: #721c24;
                font-family: Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
              " onclick="this.style.background='#e8f5e8'; this.innerHTML='✅ 验证成功 (离线模式)'; setTimeout(() => { if (window.mockTurnstileCallback) window.mockTurnstileCallback(); }, 500);">
                🚫 点击模拟验证 (网络错误)
              </div>
            `;
            
            window.mockTurnstileCallback = () => {
              if (options.callback) {
                options.callback('error-fallback-token-' + Date.now());
              }
            };
          }
          return 'error-fallback-widget-id';
        },
        reset: (widgetId: string) => {
          console.log('🚫 错误回退模式：重置 Turnstile widget', widgetId);
        }
      };
      
      scriptLoaded = true;
      resolve(); // 即使失败也 resolve，使用模拟模式
    };

    document.head.appendChild(script);
  });
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
      console.log('Turnstile: Skipping render - container:', !!containerRef.current, 'turnstile:', !!window.turnstile, 'mounted:', mountedRef.current, 'verified:', verifiedRef.current);
      return;
    }

    try {
      // 确保 siteKey 是字符串
      const cleanSiteKey = String(siteKey).trim();
      console.log('Turnstile siteKey:', cleanSiteKey, typeof cleanSiteKey);
      
      if (!cleanSiteKey) {
        console.error('Turnstile: Invalid siteKey provided');
        onError();
        return;
      }

      // 清理容器
      containerRef.current.innerHTML = '';

      console.log('Turnstile render options:', {
        sitekey: cleanSiteKey,
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
          console.log('Turnstile callback triggered with token:', token);
          verifiedRef.current = true;
          onVerify(token);
        },
        'expired-callback': () => {
          console.log('Turnstile expired');
          verifiedRef.current = false;
          onExpire();
        },
        'error-callback': () => {
          console.log('Turnstile error');
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
          window.turnstile.reset(widgetIdRef.current);
        } catch (error) {
          console.warn('Turnstile reset error:', error);
        }
        widgetIdRef.current = null;
      }
    };
  }, []); // 只在组件挂载时执行一次

  // 当 siteKey 变化时重新渲染（仅在未验证成功时）
  useEffect(() => {
    if (mountedRef.current && window.turnstile && !verifiedRef.current) {
      console.log('Turnstile: siteKey changed, re-rendering');
      mountedRef.current = false;
      renderWidget();
    }
  }, [siteKey]); // 移除 renderWidget 依赖，避免无限循环

  return (
    <div className="turnstile-widget">
      <div ref={containerRef} className="cf-turnstile" />
    </div>
  );
}; 