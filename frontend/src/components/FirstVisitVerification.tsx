import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import useReducedMotion from '../hooks/useReducedMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { CaptchaType } from '../utils/captchaSelection';
import { getFingerprint, verifyTempFingerprint, storeAccessToken } from '../utils/fingerprint';
import { useNotification } from './Notification';
import { integrityChecker } from '../utils/integrityCheck';

// 懒加载组件以减少初始包大小
const TurnstileWidget = lazy(() => import('./TurnstileWidget').then(module => ({ default: module.TurnstileWidget })));
const HCaptchaWidget = lazy(() => import('./HCaptchaWidget'));

// 正常导入hooks（hooks不能懒加载）
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';
import { useHCaptchaConfig } from '../hooks/useHCaptchaConfig';
import { useSecureCaptchaSelection } from '../hooks/useSecureCaptchaSelection';

// 动态导入clarity以避免阻塞主线程
let clarity: any = null;
const loadClarity = async () => {
  if (!clarity) {
    try {
      clarity = await import('@microsoft/clarity');
    } catch (err) {
      console.warn('Failed to load Microsoft Clarity:', err);
    }
  }
  return clarity;
};

interface FirstVisitVerificationProps {
  onVerificationComplete: () => void;
  fingerprint: string;
  isIpBanned?: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  clientIP?: string | null;
}

export const FirstVisitVerification: React.FC<FirstVisitVerificationProps> = ({
  onVerificationComplete,
  fingerprint,
  isIpBanned = false,
  banReason,
  banExpiresAt,
  clientIP,
}) => {
  // 通知系统
  const { setNotification } = useNotification();

  // 获取 Turnstile 和 hCaptcha 配置（备用）
  const { config: turnstileConfig, loading: turnstileConfigLoading, error: turnstileConfigError } = useTurnstileConfig({ usePublicConfig: true });
  const { config: hcaptchaConfig, loading: hcaptchaConfigLoading, error: hcaptchaConfigError } = useHCaptchaConfig({ usePublicConfig: true });

  // 安全的随机CAPTCHA选择
  const {
    captchaConfig: secureCaptchaConfig,
    loading: secureSelectionLoading,
    error: secureSelectionError,
    regenerateSelection,
    isTurnstile,
    isHCaptcha,
    siteKey: secureSiteKey,
    enabled: secureEnabled
  } = useSecureCaptchaSelection({
    fingerprint
  });

  // Turnstile 状态
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  
  // hCaptcha 状态
  const [hcaptchaToken, setHCaptchaToken] = useState<string>('');
  const [hcaptchaVerified, setHCaptchaVerified] = useState(false);
  const [hcaptchaError, setHCaptchaError] = useState(false);
  const [hcaptchaKey, setHCaptchaKey] = useState(0);
  
  // 通用状态
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  // 无障碍与偏好：使用共享 hook 检测用户是否请求减少动画
  const prefersReducedMotion = useReducedMotion();
  // 主操作按钮引用，用于自动聚焦与无障碍管理
  const mainButtonRef = useRef<HTMLButtonElement | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceCheckRef = useRef({ isMobile: false, isLandscape: false });
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // 验证模式状态（基于安全选择结果）
  const verificationMode = useMemo(() => {
    if (secureCaptchaConfig) {
      return secureCaptchaConfig.captchaType === CaptchaType.TURNSTILE ? 'turnstile' : 'hcaptcha';
    }
    return 'turnstile';
  }, [secureCaptchaConfig]);

  // 优化的响应式计算 - 使用 useMemo 缓存计算结果
  const deviceInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isLandscape: false, screenWidth: 1200 };
    }
    return {
      isMobile,
      isLandscape,
      screenWidth: window.innerWidth
    };
  }, [isMobile, isLandscape]);

  // 响应式工具函数 - 优化性能
  const getResponsiveSize = useCallback((mobile: number, desktop: number) => {
    if (deviceInfo.isMobile) {
      return deviceInfo.screenWidth < 400 ? mobile * 0.8 : mobile;
    }
    return desktop;
  }, [deviceInfo]);

  const getResponsiveFontSize = useCallback((mobile: string, desktop: string) => {
    return deviceInfo.isMobile ? mobile : desktop;
  }, [deviceInfo]);

  // 优化的设备检测 - 防抖和缓存
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const zoomLevel = window.devicePixelRatio || 1;
      const effectiveWidth = width * zoomLevel;

      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = width <= 768 || effectiveWidth <= 768;
      const newIsMobile = isMobileDevice || isSmallScreen;
      const newIsLandscape = width > height;

      // 只在值实际改变时才更新状态，避免不必要的重渲染
      if (deviceCheckRef.current.isMobile !== newIsMobile) {
        deviceCheckRef.current.isMobile = newIsMobile;
        setIsMobile(newIsMobile);
      }
      if (deviceCheckRef.current.isLandscape !== newIsLandscape) {
        deviceCheckRef.current.isLandscape = newIsLandscape;
        setIsLandscape(newIsLandscape);
      }
    };

    checkDevice();

    // 防抖的resize处理器
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(checkDevice, 150);
    };

    const handleOrientationChange = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(checkDevice, 200);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });

    // 监听缩放变化（部分浏览器支持）
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize, { passive: true });
    }

    // 延迟显示背景粒子，避免加载时的视觉问题（具体由单独 effect 管理）

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if ('visualViewport' in window && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  

  // 根据用户动画偏好来控制粒子展示（减少动画时关闭）
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (!prefersReducedMotion) {
      timer = setTimeout(() => setShowParticles(true), 100);
    } else {
      setShowParticles(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [prefersReducedMotion]);

  // 首次渲染时自动把焦点放到主按钮，改善键盘与屏幕阅读器体验
  useEffect(() => {
    if (mainButtonRef.current) {
      try {
        mainButtonRef.current.focus();
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // 监听验证配置加载状态
  useEffect(() => {
    const turnstileReady = !turnstileConfigLoading && turnstileConfig.siteKey;
    const hcaptchaReady = !hcaptchaConfigLoading && hcaptchaConfig.enabled && hcaptchaConfig.siteKey;
    
    if (!turnstileConfigLoading && !hcaptchaConfigLoading) {
      if (!turnstileReady && !hcaptchaReady) {
        // 构建详细的错误信息
        const errorDetails = [];
        
        // Turnstile 配置详情
        if (!turnstileReady) {
          if (turnstileConfigError) {
            errorDetails.push(`Turnstile配置错误: ${turnstileConfigError}`);
          } else if (!turnstileConfig.siteKey) {
            errorDetails.push('Turnstile配置缺失: 未找到有效的站点密钥');
          } else {
            errorDetails.push('Turnstile配置异常: 配置不完整');
          }
        }
        
        // hCaptcha 配置详情
        if (!hcaptchaReady) {
          if (hcaptchaConfigError) {
            errorDetails.push(`hCaptcha配置错误: ${hcaptchaConfigError}`);
          } else if (!hcaptchaConfig.enabled) {
            errorDetails.push('hCaptcha配置状态: 服务未启用');
          } else if (!hcaptchaConfig.siteKey) {
            errorDetails.push('hCaptcha配置缺失: 未找到有效的站点密钥');
          } else {
            errorDetails.push('hCaptcha配置异常: 配置不完整');
          }
        }
        
        // 安全选择服务详情
        if (secureSelectionError) {
          errorDetails.push(`安全选择服务错误: ${secureSelectionError}`);
        }
        
        setNotification({
          title: '验证服务配置加载失败',
          message: '无法继续访问，请查看详细信息',
          details: [
            ...errorDetails,
            '',
            '解决方案：',
            '• 刷新页面重试',
            '• 检查网络连接',
            '• 如问题持续存在请联系管理员'
          ],
          type: 'error'
        });
      } else {
        // 验证模式由安全选择自动确定，无需手动设置
        if (verificationMode === 'turnstile') {
          console.log('使用Turnstile验证');
        } else {
          console.log('使用hCaptcha验证');
        }
      }
    }
  }, [turnstileConfigLoading, turnstileConfig.siteKey, hcaptchaConfigLoading, hcaptchaConfig.enabled, hcaptchaConfig.siteKey, setNotification, verificationMode]);

  // 监听IP封禁状态变化
  useEffect(() => {
    if (isIpBanned) {
      setNotification({
        message: `IP地址已被封禁${banReason ? ': ' + banReason : ''}`,
        type: 'error'
      });
    }
  }, [isIpBanned, banReason, setNotification]);

  // 移除欢迎通知 - 减少干扰

  // 验证完整性检查豁免状态（开发模式）- 仅控制台输出
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const checkExemptStatus = () => {
        const status = integrityChecker.checkExemptStatus();
        console.log('🛡️ FirstVisitVerification 完整性检查豁免状态:', status);
        
        if (!status.isExempt) {
          console.warn('⚠️ FirstVisitVerification 组件未被豁免，可能会触发完整性检查');
        } else {
          console.log('✅ FirstVisitVerification 组件已被正确豁免');
        }
      };

      // 延迟检查，确保DOM已完全渲染
      const checkTimer = setTimeout(checkExemptStatus, 1000);
      return () => clearTimeout(checkTimer);
    }
  }, []);

  // 网络状态监听 - 安全的window访问
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setNotification({
        message: '网络连接已恢复',
        type: 'success'
      });
    };

    const handleOffline = () => {
      setNotification({
        message: '网络连接已断开，请检查网络',
        type: 'error'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setNotification]);

  // 移除页面可见性变化监听 - 减少不必要的通知

  // 优化的 Turnstile 事件处理器 - 批量状态更新
  const handleTurnstileVerify = useCallback((token: string) => {
    console.log('Turnstile验证成功，token:', token);
    
    // 批量状态更新，减少重渲染
    React.startTransition(() => {
      setTurnstileToken(token);
      setTurnstileVerified(true);
      setTurnstileError(false);
      setError('');
    });

    // 异步处理 Clarity 事件和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('turnstile_verify_success');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: '人机验证通过！',
        type: 'success'
      });
    });
  }, [setNotification]);

  const handleTurnstileExpire = useCallback(() => {
    console.log('Turnstile验证过期');
    
    // 批量状态更新
    React.startTransition(() => {
      setTurnstileToken('');
      setTurnstileVerified(false);
      setTurnstileError(false);
    });

    // 异步处理事件记录和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('turnstile_verify_expire');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: '验证已过期，请重新验证',
        type: 'warning'
      });
    });
  }, [setNotification]);

  const handleTurnstileError = useCallback(() => {
    console.log('Turnstile验证错误');
    
    // 批量状态更新
    React.startTransition(() => {
      setTurnstileToken('');
      setTurnstileVerified(false);
      setTurnstileError(true);
      setError('人机验证失败，请重试');
    });

    // 异步处理事件记录和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('turnstile_verify_error');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: '人机验证失败，请重试',
        type: 'error'
      });
    });
  }, [setNotification]);

  // hCaptcha 事件处理器
  const handleHCaptchaVerify = useCallback((token: string) => {
    console.log('hCaptcha验证成功，token:', token);
    
    // 批量状态更新，减少重渲染
    React.startTransition(() => {
      setHCaptchaToken(token);
      setHCaptchaVerified(true);
      setHCaptchaError(false);
      setError('');
    });

    // 异步处理 Clarity 事件和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('hcaptcha_verify_success');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: 'hCaptcha验证通过！',
        type: 'success'
      });
    });
  }, [setNotification]);

  const handleHCaptchaExpire = useCallback(() => {
    console.log('hCaptcha验证过期');
    
    // 批量状态更新
    React.startTransition(() => {
      setHCaptchaToken('');
      setHCaptchaVerified(false);
      setHCaptchaError(false);
    });

    // 异步处理事件记录和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('hcaptcha_verify_expire');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: 'hCaptcha验证已过期，请重新验证',
        type: 'warning'
      });
    });
  }, [setNotification]);

  const handleHCaptchaError = useCallback(() => {
    console.log('hCaptcha验证错误');
    
    // 批量状态更新
    React.startTransition(() => {
      setHCaptchaToken('');
      setHCaptchaVerified(false);
      setHCaptchaError(true);
      setError('hCaptcha验证失败，请重试');
    });

    // 异步处理事件记录和通知
    requestIdleCallback(async () => {
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('hcaptcha_verify_error');
        }
      } catch (err) {
        console.warn('Failed to send Clarity event:', err);
      }

      setNotification({
        message: 'hCaptcha验证失败，请重试',
        type: 'error'
      });
    });
  }, [setNotification]);

  // 计算当前验证状态
  const isVerified = useMemo(() => {
    if (verificationMode === 'turnstile') {
      return turnstileVerified && turnstileToken;
    } else {
      return hcaptchaVerified && hcaptchaToken;
    }
  }, [verificationMode, turnstileVerified, turnstileToken, hcaptchaVerified, hcaptchaToken]);

  const getCurrentToken = useCallback(() => {
    return verificationMode === 'turnstile' ? turnstileToken : hcaptchaToken;
  }, [verificationMode, turnstileToken, hcaptchaToken]);

  // 将验证逻辑提前定义，避免在依赖数组中引用未初始化变量
  const handleVerify = useCallback(async () => {
    if (!isVerified) {
      setError('请先完成人机验证');
      setNotification({
        message: '请先完成人机验证',
        type: 'warning'
      });
      return;
    }

    const token = getCurrentToken();
    if (!token) {
      setError('验证令牌无效，请重新验证');
      setNotification({
        message: '验证令牌无效，请重新验证',
        type: 'warning'
      });
      return;
    }

    setVerifying(true);
    setError('');

    // 显示验证开始通知
    setNotification({
      message: '正在验证中...',
      type: 'info'
    });

    try {
      const result = await verifyTempFingerprint(fingerprint, token, secureCaptchaConfig?.captchaType === CaptchaType.HCAPTCHA ? 'hcaptcha' : 'turnstile');
      if (result.success) {
        console.log('首次访问验证成功');

        // Microsoft Clarity事件记录：验证成功
        try {
          const clarityModule = await loadClarity();
          if (clarityModule && typeof clarityModule.event === 'function') {
            clarityModule.event('first_visit_verification_success');
          }
        } catch (err) {
          console.warn('Failed to send Clarity event:', err);
        }

        // 存储访问密钥
        if (result.accessToken) {
          storeAccessToken(fingerprint, result.accessToken);
          console.log('访问密钥已存储，5分钟内无需再次验证');

          // 显示访问密钥存储成功通知
          setNotification({
            message: '访问密钥已保存，5分钟内免验证',
            type: 'success'
          });
        }

        // 显示验证成功通知
        setNotification({
          message: '验证成功！正在跳转...',
          type: 'success'
        });


        // 延迟一下再跳转，让用户看到成功消息
        setTimeout(() => {
          onVerificationComplete();
        }, 1500); // Changed from 1000 to 1500
      } else {
        const errorMsg = '验证失败，请重试';
        
        // Microsoft Clarity事件记录：验证失败（基础信息）
        try {
          const clarityModule = await loadClarity();
          if (clarityModule && typeof clarityModule.event === 'function') {
            clarityModule.event('first_visit_verification_failed');
          }
        } catch (err) {
          console.warn('Failed to send Clarity event:', err);
        }
        setError(errorMsg);
        setNotification({
          message: errorMsg,
          type: 'error'
        });
        // 重置当前验证方式的状态
        if (verificationMode === 'turnstile') {
          setTurnstileToken('');
          setTurnstileVerified(false);
          setTurnstileKey(k => k + 1);
        } else {
          setHCaptchaToken('');
          setHCaptchaVerified(false);
          setHCaptchaKey(k => k + 1);
        }
      }
    } catch (err) {
      console.error('验证失败:', err);
      let errorMsg = '验证失败，请重试';
      let errorType = 'unknown_error';

      // 检查是否是IP封禁错误
      if (err instanceof Error && err.message.includes('IP已被封禁')) {
        errorType = 'ip_banned';
        // 从错误对象中提取封禁信息
        const banData = (err as any).banData;
        if (banData && banData.expiresAt) {
          console.log('封禁到期时间:', banData.expiresAt);
        }
        errorMsg = '您的IP地址已被封禁，请稍后再试';
        setNotification({
          message: 'IP地址已被封禁',
          type: 'error'
        });
      } else if (err instanceof Error && err.message.includes('网络')) {
        errorType = 'network_error';
        errorMsg = '网络连接异常，请检查网络后重试';
        setNotification({
          message: '网络连接异常',
          type: 'error'
        });
      } else if (err instanceof Error && err.message.includes('超时')) {
        errorType = 'timeout_error';
        errorMsg = '验证超时，请重试';
        setNotification({
          message: '验证超时，请重试',
          type: 'warning'
        });
      } else {
        setNotification({
          message: errorMsg,
          type: 'error'
        });
      }

      // Microsoft Clarity事件记录：验证异常失败
      try {
        const clarityModule = await loadClarity();
        if (clarityModule && typeof clarityModule.event === 'function') {
          clarityModule.event('first_visit_verification_exception');
        }
      } catch (clarityError) {
        console.warn('Failed to send Clarity event:', clarityError);
      }

      setError(errorMsg);
      // 重置当前验证方式的状态
      if (verificationMode === 'turnstile') {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey(k => k + 1);
      } else {
        setHCaptchaToken('');
        setHCaptchaVerified(false);
        setHCaptchaKey(k => k + 1);
      }

    } finally {
      setVerifying(false);
    }
  }, [isVerified, getCurrentToken, fingerprint, onVerificationComplete, setNotification, banExpiresAt, clientIP, verificationMode]);

  // 简化的键盘快捷键支持 - 安全的window访问
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Enter 键快速验证
      if (event.key === 'Enter' && isVerified && !verifying) {
        event.preventDefault();
        handleVerify();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVerified, verifying, handleVerify]);


  // Microsoft Clarity事件记录：IP被封禁页面显示
  useEffect(() => {
    if (isIpBanned) {
      (async () => {
        try {
          const clarityModule = await loadClarity();
          if (clarityModule && typeof clarityModule.event === 'function') {
            clarityModule.event('first_visit_ip_banned_displayed');
          }
        } catch (err) {
          console.warn('Failed to send Clarity event:', err);
        }
      })();
    }
  }, [isIpBanned]);
  
  if (isIpBanned) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center z-50"
          data-component="FirstVisitVerification"
          data-page="FirstVisitVerification"
          data-view="FirstVisitVerification"
          style={{
            minHeight: '100dvh',
            padding: isMobile ? '0.25rem' : '1.5rem',
            height: '100dvh',
            width: '100vw',
            overflow: 'hidden',
            '--mobile-scale': (isMobile && typeof window !== 'undefined' && window.innerWidth < 400) ? '0.85' : '1',
            '--mobile-padding': (isMobile && typeof window !== 'undefined' && window.innerWidth < 400) ? '0.5rem' : '1rem',
          } as React.CSSProperties}
        >
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -30, opacity: 0, scale: 0.95 }}
            transition={{
              duration: 0.6,
              ease: "easeOut",
              delay: 0.1
            }}
            className={`relative bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-red-200 ${isMobile
                ? 'w-full max-w-sm mx-1 p-3'
                : 'max-w-md w-full mx-4 p-8'
              }`}
            style={{
              maxHeight: isMobile ? 'calc(100dvh - 1rem)' : '80vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              // 动态缩放适配
              transform: (isMobile && typeof window !== 'undefined' && window.innerWidth < 400)
                ? `scale(${Math.min(window.innerWidth / 350, 0.9)})`
                : 'scale(1)',
              transformOrigin: 'center center',
              // 确保在小屏幕上不会溢出
              width: (isMobile && typeof window !== 'undefined' && window.innerWidth < 400) ? '95vw' : undefined,
              maxWidth: (isMobile && typeof window !== 'undefined' && window.innerWidth < 400) ? '95vw' : undefined,
            }}
          >
            {/* 顶部装饰线 */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent rounded-full"></div>

            {/* 警告图标 */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative mx-auto mb-6"
            >
              <svg
                width={isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 60 : 80) : 100}
                height={isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 60 : 80) : 100}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mx-auto text-red-500"
                style={{
                  minWidth: isMobile ? '60px' : '100px',
                  minHeight: isMobile ? '60px' : '100px',
                }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </motion.div>

            {/* 标题 */}
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className={`text-center text-gray-800 mb-3 bg-gradient-to-r from-red-600 to-red-700 bg-clip-text text-transparent font-bold ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 'text-xl' : 'text-2xl') : 'text-3xl'
                }`}
              style={{
                fontSize: isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? '1.25rem' : '1.5rem') : '1.875rem',
                lineHeight: '1.2',
              }}
            >
              IP地址已被封禁
            </motion.h1>

            {/* 说明文字 */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className={`text-center text-gray-600 leading-relaxed mb-4 ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 'text-xs' : 'text-sm') : 'text-base'
                }`}
              style={{
                fontSize: isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : '0.875rem') : '1rem',
                lineHeight: '1.4',
              }}
            >
              您的IP地址因违规行为已被临时封禁
              <br />
              请稍后再试或联系管理员
            </motion.p>

            {/* 封禁详情 */}
            {banReason && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className={`mb-4 p-3 bg-red-50 border border-red-200 rounded-xl ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 'text-xs' : 'text-sm') : 'text-base'
                  }`}
                style={{
                  padding: isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : '1rem') : '1rem',
                }}
              >
                <div className="flex items-center gap-2 text-red-600 mb-2">
                  <svg className={`${isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium" style={{ fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined }}>封禁原因</span>
                </div>
                <p className="text-red-700" style={{
                  fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined,
                  wordBreak: 'break-word',
                  lineHeight: '1.3'
                }}>{banReason}</p>
              </motion.div>
            )}

            {/* 客户端IP地址 */}
            {clientIP && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.55 }}
                className={`mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 'text-xs' : 'text-sm') : 'text-base'
                  }`}
                style={{
                  padding: isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : '1rem') : '1rem',
                }}
              >
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <svg className={`${isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium" style={{ fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined }}>客户端IP地址</span>
                </div>
                <p className="text-blue-700 font-mono" style={{
                  fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined,
                  wordBreak: 'break-all',
                  lineHeight: '1.3'
                }}>{clientIP}</p>
              </motion.div>
            )}

            {/* 封禁到期时间 */}
            {banExpiresAt && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className={`mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-xl ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? 'text-xs' : 'text-sm') : 'text-base'
                  }`}
                style={{
                  padding: isMobile ? (typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : '1rem') : '1rem',
                }}
              >
                <div className="flex items-center gap-2 text-yellow-600 mb-2">
                  <svg className={`${isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium" style={{ fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined }}>封禁到期时间</span>
                </div>
                <p className="text-yellow-700" style={{
                  fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined,
                  lineHeight: '1.3'
                }}>
                  {(() => {
                    return banExpiresAt.toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZoneName: 'short'
                    });
                  })()}
                </p>
              </motion.div>
            )}

            {/* 底部说明 */}
            <motion.div
              className={`text-center ${isMobile ? 'mt-3' : 'mt-8'}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-1 h-1 bg-red-400 rounded-full"></div>
                <div className="w-1 h-1 bg-red-400 rounded-full"></div>
                <div className="w-1 h-1 bg-red-400 rounded-full"></div>
              </div>
              <p className={`text-gray-500 leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'
                }`}
                style={{
                  fontSize: isMobile && typeof window !== 'undefined' && window.innerWidth < 400 ? '0.75rem' : undefined,
                  lineHeight: '1.3'
                }}>
                如有疑问，请联系系统管理员
                <br />
                感谢您的理解与配合
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // 优化的Logo组件 - 缓存尺寸计算和减少动画复杂度
  const Logo = React.memo(() => {
    const logoSize = useMemo(() => {
      return deviceInfo.isMobile ? (deviceInfo.isLandscape ? 80 : 100) : 140;
    }, [deviceInfo.isMobile, deviceInfo.isLandscape]);

    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.4, ease: "easeOut" }}
        className="relative"
      >
        <svg
          width={logoSize}
          height={logoSize}
          viewBox="0 0 140 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`mx-auto ${isMobile ? 'mb-4' : 'mb-8'} drop-shadow-lg`}
        >
          {/* 外圈光晕效果 */}
          <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.3" />
              <stop offset="70%" stopColor="#4F46E5" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
          </defs>

          {/* 光晕背景 */}
          <circle cx="70" cy="70" r="65" fill="url(#glow)" />

          {/* 主圆形背景 */}
          <circle cx="70" cy="70" r="55" fill="url(#mainGradient)" stroke="#6366F1" strokeWidth="2" />

          {/* 内圈装饰 */}
          <circle cx="70" cy="70" r="45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="70" cy="70" r="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />

          {/* 笑脸眼睛 - 简化动画 */}
          <motion.circle
            cx="55" cy="60" r="5" fill="white"
            animate={prefersReducedMotion ? undefined : { scale: [1, 1.05, 1] }}
            transition={prefersReducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx="85" cy="60" r="5" fill="white"
            animate={prefersReducedMotion ? undefined : { scale: [1, 1.05, 1] }}
            transition={prefersReducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />

          {/* 笑脸嘴巴 */}
          <path
            d="M 50 80 Q 70 95 90 80"
            stroke="white"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />

          {/* 装饰性元素 - 优化动画性能 */}
          <motion.circle
            cx="35" cy="35" r="4" fill="#A78BFA" opacity="0.6"
            animate={prefersReducedMotion ? undefined : { y: [0, -3, 0] }}
            transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.circle
            cx="105" cy="45" r="3" fill="#A78BFA" opacity="0.6"
            animate={prefersReducedMotion ? undefined : { y: [0, 3, 0] }}
            transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />
          <motion.circle
            cx="30" cy="95" r="3" fill="#A78BFA" opacity="0.6"
            animate={prefersReducedMotion ? undefined : { y: [0, -2, 0] }}
            transition={prefersReducedMotion ? undefined : { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          <motion.circle
            cx="110" cy="90" r="4" fill="#A78BFA" opacity="0.6"
            animate={prefersReducedMotion ? undefined : { y: [0, 2, 0] }}
            transition={prefersReducedMotion ? undefined : { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          />
        </svg>
      </motion.div>
    );
  });

  // 高性能背景粒子效果 - 美化和优化性能
  const BackgroundParticles = React.memo(() => {
    const particleData = useMemo(() => {
      const count = deviceInfo.isMobile ? 8 : 16;
      const width = deviceInfo.screenWidth;
      const height = typeof window !== 'undefined' ? window.innerHeight : 800;
      
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        initialX: (i * 137) % width,
        initialY: (i * 193) % height,
        targetX: (i * 211) % width,
        targetY: (i * 167) % height,
        duration: 20 + (i % 4) * 8,
        delay: i * 0.2,
        size: 1 + (i % 3) * 0.5,
        opacity: 0.1 + (i % 3) * 0.05
      }));
    }, [deviceInfo.isMobile, deviceInfo.screenWidth]);

    // 如果用户偏好减少动画，则返回静态版本
    if (prefersReducedMotion) {
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
          {particleData.slice(0, 6).map((particle) => (
            <div
              key={particle.id}
              className="absolute w-1 h-1 bg-gradient-to-r from-indigo-200 to-purple-200 rounded-full"
              style={{
                left: particle.initialX,
                top: particle.initialY,
                opacity: particle.opacity
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <motion.div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      >
        {particleData.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute bg-gradient-to-r from-indigo-300/60 to-purple-300/60 rounded-full blur-[0.5px]"
            style={{
              width: `${particle.size * 6}px`,
              height: `${particle.size * 6}px`,
            }}
            initial={{
              x: particle.initialX,
              y: particle.initialY,
              opacity: 0,
              scale: 0,
            }}
            animate={{
              x: particle.targetX,
              y: particle.targetY,
              opacity: particle.opacity,
              scale: 1,
            }}
            transition={{
              opacity: { duration: 0.8, delay: 1 + particle.delay },
              scale: { duration: 0.6, delay: 1 + particle.delay },
              x: {
                duration: particle.duration,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: 2 + particle.delay
              },
              y: {
                duration: particle.duration + 8,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: 2 + particle.delay
              }
            }}
          />
        ))}
      </motion.div>
    );
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center z-50 overflow-hidden"
        data-component="FirstVisitVerification"
        data-page="FirstVisitVerification"
        data-view="FirstVisitVerification"
        style={{
          minHeight: '100dvh',
          padding: isMobile ? '1rem' : '1.5rem',
        }}
      >
        {/* 背景粒子 */}
        {showParticles && <BackgroundParticles />}

        {/* 主容器 */}
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -30, opacity: 0, scale: 0.95 }}
          transition={{
            duration: 0.6,
            ease: "easeOut",
            delay: 0.1
          }}
          className={`relative bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/30 ${deviceInfo.isMobile
            ? 'w-full max-w-sm mx-2 p-4'
            : 'max-w-md w-full mx-4 p-8'
          } before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-br before:from-white/20 before:to-transparent before:pointer-events-none`}
          style={{
            maxHeight: deviceInfo.isMobile ? '90vh' : '80vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            willChange: 'transform', // 优化动画性能
          }}
        >
          {/* 顶部装饰线 */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-24 h-1.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full shadow-sm"></div>
          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-16 h-0.5 bg-gradient-to-r from-transparent via-purple-400/50 to-transparent rounded-full"></div>

          {/* Logo */}
          <Logo />

          {/* 标题 */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className={`text-center text-gray-800 mb-3 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent font-bold ${isMobile ? 'text-2xl' : 'text-3xl'
              }`}
          >
            欢迎访问
          </motion.h1>

          {/* 副标题 */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className={`text-center text-gray-600 mb-2 font-medium ${isMobile ? 'text-sm' : 'text-base'
              }`}
          >
            Synapse
          </motion.p>

          {/* 说明文字 */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className={`text-center text-gray-600 leading-relaxed mb-6 ${isMobile ? 'text-sm' : 'text-base'
              }`}
          >
            为了确保您是人类用户
            <br />
            请完成下方人机验证
          </motion.p>

          {/* 加载状态显示 - 美化的骨架屏 */}
          {(turnstileConfigLoading || hcaptchaConfigLoading) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center py-8 mb-6"
            >
              {/* 美化的加载动画 */}
              <div className="relative mb-4">
                <motion.div
                  className="w-12 h-12 border-4 border-indigo-100 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-indigo-600 border-r-purple-600 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-2 w-8 h-8 border-2 border-transparent border-b-indigo-400 rounded-full"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </div>
              
              {/* 加载文字 */}
              <motion.p
                className={`text-gray-600 font-medium ${isMobile ? 'text-sm' : 'text-base'}`}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                正在加载验证组件...
              </motion.p>
              
              {/* 骨架屏 */}
              <div className="mt-6 w-full max-w-xs">
                <div className="animate-pulse">
                  <div className="h-20 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-xl mb-4"></div>
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-full w-3/4 mx-auto mb-2"></div>
                  <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-full w-1/2 mx-auto"></div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 验证方式选择 */}
          {!turnstileConfigLoading && !hcaptchaConfigLoading && 
           ((turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string') || 
            (hcaptchaConfig.enabled && hcaptchaConfig.siteKey)) && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className={`mb-4 ${isMobile ? 'mb-3' : 'mb-4'}`}
            >
              {/* 只有当两种验证方式都可用时才显示选择器 */}
              {secureCaptchaConfig && (
                <div className="flex justify-center mb-4">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg px-4 py-2 border border-blue-200">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-700">
                        使用 {verificationMode === 'turnstile' ? 'Cloudflare Turnstile' : 'hCaptcha'} 验证
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 验证组件 */}
          {secureCaptchaConfig && secureEnabled && secureSiteKey && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`mb-6 ${isMobile ? 'mb-4' : 'mb-6'}`}
            >
              <div className="flex justify-center mb-4">
                <div
                  className={`p-4 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl border border-gray-200/60 shadow-sm transition-all duration-300 hover:border-indigo-300 hover:bg-gradient-to-br hover:from-indigo-50/30 hover:to-purple-50/30 hover:shadow-md ${isMobile ? 'w-full' : ''
                  }`}
                  role="region"
                  aria-label="人机验证区域"
                >
                  <Suspense fallback={
                    <div className="flex flex-col items-center justify-center py-8">
                      <motion.div
                        className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full mb-3"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <p className={`text-gray-500 ${isMobile ? 'text-sm' : 'text-base'}`}>
                        正在加载验证组件...
                      </p>
                    </div>
                  }>
                    {verificationMode === 'turnstile' ? (
                      <TurnstileWidget
                        key={turnstileKey}
                        siteKey={secureSiteKey}
                        onVerify={handleTurnstileVerify}
                        onError={handleTurnstileError}
                        onExpire={handleTurnstileExpire}
                        theme="light"
                        size={isMobile ? 'compact' : 'normal'}
                      />
                    ) : (
                      <HCaptchaWidget
                        key={hcaptchaKey}
                        siteKey={secureSiteKey}
                        onVerify={handleHCaptchaVerify}
                        onError={handleHCaptchaError}
                        onExpire={handleHCaptchaExpire}
                        theme="light"
                        size={isMobile ? 'compact' : 'normal'}
                      />
                    )}
                  </Suspense>
                </div>
              </div>

          {/* 验证状态 */}
          {/* 无障碍：用于向屏幕阅读器通告验证状态变更 */}
          <div id="verification-status" aria-live="polite" className="sr-only" />
              <motion.div
                className="text-center mb-4"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <AnimatePresence mode="wait">
                  {isVerified ? (
                    <motion.div
                      key="verified"
                      className={`flex items-center justify-center gap-2 text-green-700 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-3 rounded-2xl border border-green-200/60 shadow-sm ${isMobile ? 'text-sm' : 'text-base'
                        }`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <motion.div
                        className="relative"
                        initial={{ rotate: -180, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ duration: 0.5, type: "spring" }}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <motion.div
                          className="absolute inset-0 w-5 h-5 bg-green-400 rounded-full opacity-30"
                          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </motion.div>
                      <span className="font-semibold">验证通过</span>
                    </motion.div>
                  ) : (verificationMode === 'turnstile' ? turnstileError : hcaptchaError) ? (
                    <motion.div
                      key="error"
                      className={`flex items-center justify-center gap-2 text-red-700 bg-gradient-to-r from-red-50 to-rose-50 px-6 py-3 rounded-2xl border border-red-200/60 shadow-sm ${isMobile ? 'text-sm' : 'text-base'
                        }`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <motion.div
                        className="relative"
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 0.5, repeat: 2 }}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <motion.div
                          className="absolute inset-0 w-5 h-5 bg-red-400 rounded-full opacity-30"
                          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      </motion.div>
                      <span className="font-semibold">验证失败</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="pending"
                      className={`flex items-center justify-center gap-2 text-gray-600 bg-gradient-to-r from-gray-50 to-slate-50 px-6 py-3 rounded-2xl border border-gray-200/60 shadow-sm ${isMobile ? 'text-sm' : 'text-base'
                        }`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                    >
                      <motion.div
                        className="relative"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <motion.div
                          className="absolute inset-0 w-5 h-5 bg-gray-400 rounded-full opacity-20"
                          animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0, 0.2] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        />
                      </motion.div>
                      <span className="font-medium">请完成验证</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}

          {/* 错误信息 - 美化设计 */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className={`mb-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/60 rounded-2xl shadow-sm ${isMobile ? 'text-sm' : 'text-base'
                  }`}
              >
                <div className="flex items-start gap-3 text-red-700">
                  <motion.div
                    className="relative mt-0.5"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.5, repeat: 2 }}
                  >
                    <svg
                      className="w-5 h-5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <motion.div
                      className="absolute inset-0 w-5 h-5 bg-red-400 rounded-full opacity-20"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0, 0.2] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </motion.div>
                  <div className="flex-1">
                    <div className="font-semibold text-red-800 mb-1">验证失败</div>
                    <span className={`text-red-700 leading-relaxed ${isMobile ? 'text-sm' : 'text-base'}`}>{error}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 验证按钮 */}
          <motion.button
            onClick={handleVerify}
            disabled={!isVerified || verifying}
            className={[
              'w-full',
              'rounded-2xl',
              'font-semibold',
              'transition-all',
              'duration-300',
              'shadow-lg',
              'relative',
              'overflow-hidden',
              // 水平/垂直居中内容
              'flex',
              'items-center',
              'justify-center',
              'group',
              (!isVerified || verifying)
                ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-500 cursor-not-allowed border-2 border-gray-200/50'
                : 'text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:via-purple-700 hover:to-indigo-800 hover:shadow-2xl hover:shadow-indigo-500/25 border-2 border-transparent active:scale-[0.98]',
              // 使用 tailwind.config.js 中的自定义最小高度
              isMobile ? 'py-3 px-4 text-base min-h-btn-mobile' : 'py-4 px-6 text-lg min-h-btn-desktop'
            ].join(' ')}
            whileHover={isVerified && !verifying ? { scale: 1.02 } : {}}
            whileTap={isVerified && !verifying ? { scale: 0.98 } : {}}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            title={!isVerified ? '请先完成人机验证后才能继续' : verifying ? '正在验证中...' : '点击继续访问'}
            aria-label={!isVerified ? '请先完成人机验证后才能继续' : verifying ? '正在验证中，请稍候' : '继续访问网站'}
            aria-describedby="verification-status"
            ref={mainButtonRef}
          >
            {/* 禁用状态遮罩 - 美化设计 */}
            {!isVerified && !verifying && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-gray-100/80 to-gray-200/80 backdrop-blur-[1px] flex items-center justify-center rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="flex items-center gap-2 text-gray-600"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <motion.div
                    className="relative"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <motion.div
                      className="absolute inset-0 w-4 h-4 bg-gray-400 rounded-full opacity-20"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0, 0.2] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    />
                  </motion.div>
                  <span className={`font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}>需要验证</span>
                </motion.div>
              </motion.div>
            )}
            
            <AnimatePresence mode="wait">
              {verifying ? (
                <motion.div
                  key="verifying"
                  className="flex items-center justify-center gap-3"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative">
                    <motion.svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </motion.svg>
                    <motion.div
                      className="absolute inset-0 w-5 h-5 bg-white rounded-full opacity-30"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                  <motion.span
                    className="font-semibold"
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    验证中...
                  </motion.span>
                </motion.div>
              ) : isVerified ? (
                <motion.div
                  key="ready"
                  className="flex items-center justify-center gap-2"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, type: "spring" }}
                  >
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </motion.svg>
                  <span className="font-semibold">继续访问</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.button>

          {/* 底部说明 - 美化设计 */}
          <motion.div
            className={`text-center ${isMobile ? 'mt-4' : 'mt-8'}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            {/* 装饰性分隔线 */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <motion.div 
                className="w-1.5 h-1.5 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, delay: 0 }}
              />
              <motion.div 
                className="w-1 h-1 bg-gradient-to-r from-indigo-300 to-purple-300 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
              />
              <motion.div 
                className="w-1.5 h-1.5 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, delay: 1 }}
              />
            </div>
            
            {/* 隐私说明按钮 */}
            <motion.button
              className={`text-gray-500 leading-relaxed cursor-help hover:text-indigo-600 transition-all duration-300 bg-transparent border-none group ${isMobile ? 'text-xs' : 'text-sm'
                }`}
              onClick={() => {
                setShowPrivacyModal(true);
              }}
              title="点击查看详细的隐私保护说明"
              aria-label="查看隐私保护详情"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="relative inline-block">
                <span className="relative z-10">
                  此验证仅用于防止自动化访问
                  <br />
                  您的隐私将得到充分保护
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ margin: '-4px' }}
                />
              </div>
            </motion.button>

            {/* 添加帮助按钮 */}
            <motion.button
              className={`mt-3 text-gray-400 hover:text-indigo-500 transition-colors duration-200 ${isMobile ? 'text-xs' : 'text-sm'
                }`}
              onClick={() => {
                setNotification({
                  message: '如遇验证问题，请尝试刷新页面或检查网络连接',
                  type: 'info'
                });
              }}
              title="获取帮助信息"
              aria-label="获取验证帮助"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>遇到问题？</span>
              </div>
            </motion.button>

            {/* 开发模式下的豁免状态检查按钮 */}
            {process.env.NODE_ENV === 'development' && (
              <motion.button
                className={`mt-2 text-blue-400 hover:text-blue-600 transition-colors duration-200 ${
                  isMobile ? 'text-xs' : 'text-sm'
                }`}
                onClick={() => {
                  const status = integrityChecker.checkExemptStatus();
                  console.log('🛡️ 完整性检查豁免状态:', status);
                  setNotification({
                    message: status.isExempt 
                      ? `豁免生效: ${status.exemptReasons.join(', ')}` 
                      : '未被豁免，可能触发完整性检查',
                    type: status.isExempt ? 'success' : 'warning'
                  });
                }}
                aria-label="检查完整性豁免状态"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 12a1 1 0 102 0V7a1 1 0 10-2 0v5zm1-8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
                  </svg>
                  <span>检查豁免状态</span>
                </div>
              </motion.button>
            )}
          </motion.div>
        </motion.div>

        {/* 隐私保护详情模态框 */}
        <AnimatePresence>
          {showPrivacyModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
              onClick={() => setShowPrivacyModal(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="privacy-modal-title"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={`bg-white rounded-2xl shadow-2xl border border-gray-200 ${isMobile ? 'w-full max-w-sm max-h-[80vh]' : 'max-w-lg w-full max-h-[85vh]'} overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 模态框头部 */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <h3 id="privacy-modal-title" className={`font-bold ${isMobile ? 'text-lg' : 'text-xl'}`}>隐私保护说明</h3>
                    </div>
                    <button
                      onClick={() => setShowPrivacyModal(false)}
                      className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
                      aria-label="关闭隐私保护说明对话框"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 模态框内容 */}
                <div className={`overflow-y-auto ${isMobile ? 'p-4 max-h-[60vh]' : 'p-6 max-h-[70vh]'}`}>
                  {/* Cloudflare Turnstile 介绍 */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800">Cloudflare Turnstile 验证</h4>
                    </div>
                    <p className={`text-gray-600 leading-relaxed ${isMobile ? 'text-sm' : 'text-base'}`}>
                      我们使用 Cloudflare Turnstile 作为人机验证解决方案，这是一个注重隐私的验证系统，旨在替代传统的验证码。
                    </p>
                  </div>

                  {/* 隐私保护措施 */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800">隐私保护措施</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                        <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                          <strong>无个人信息收集：</strong>验证过程不会收集您的个人身份信息
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                        <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                          <strong>数据最小化：</strong>仅收集验证所需的最少技术信息
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                        <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                          <strong>临时存储：</strong>验证令牌仅在本地临时存储，5分钟后自动失效
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                        <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                          <strong>加密传输：</strong>所有数据传输均使用 HTTPS 加密保护
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 验证目的 */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800">验证目的</h4>
                    </div>
                    <div className="space-y-2">
                      <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                        • 防止恶意机器人和自动化攻击
                      </p>
                      <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                        • 保护服务器资源和用户体验
                      </p>
                      <p className={`text-gray-600 ${isMobile ? 'text-sm' : 'text-base'}`}>
                        • 确保服务的稳定性和安全性
                      </p>
                    </div>
                  </div>

                  {/* 用户权利 */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-800">您的权利</h4>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className={`text-purple-700 ${isMobile ? 'text-sm' : 'text-base'}`}>
                        您有权了解我们如何处理验证数据，如有任何隐私相关问题，
                        请通过页面底部的联系方式与我们取得联系。
                      </p>
                    </div>
                  </div>

                  {/* 技术说明 */}
                  <div className="border-t pt-4">
                    <p className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                      <strong>技术说明：</strong>Turnstile 通过分析浏览器行为模式来区分人类用户和机器人，
                      无需用户进行复杂的图像识别或文字输入操作。
                    </p>
                  </div>
                </div>

                {/* 模态框底部 */}
                <div className={`bg-gray-50 px-4 py-4 flex gap-3 ${
                  isMobile ? 'flex-col space-y-2' : 'flex-row justify-end'
                }`}>
                  <motion.button
                    onClick={() => setShowPrivacyModal(false)}
                    className={`px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium ${
                      isMobile ? 'order-2 w-full text-center' : 'flex-shrink-0'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    aria-label="我已了解隐私保护说明"
                  >
                    我已了解
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      setShowPrivacyModal(false);
                      // 滚动到验证区域
                      const turnstileElement = document.querySelector('.cf-turnstile');
                      if (turnstileElement) {
                        turnstileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium ${
                      isMobile ? 'order-1 w-full text-center' : 'flex-shrink-0'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    aria-label="了解隐私保护说明并开始验证"
                  >
                    {isMobile ? '开始验证' : '了解并开始验证'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};