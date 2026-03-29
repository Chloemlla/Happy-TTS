import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import useReducedMotion from '../hooks/useReducedMotion';
import { motion, AnimatePresence, m } from 'framer-motion';
import { CaptchaType } from '../utils/captchaSelection';
import { verifyTempFingerprint, storeAccessToken } from '../utils/fingerprint';
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

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
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
        setNotification({
          title: '验证服务配置加载失败',
          message: '无法继续访问，请尝试刷新页面重试',
          type: 'error'
        });
      }
    }
  }, [turnstileConfigLoading, turnstileConfig.siteKey, hcaptchaConfigLoading, hcaptchaConfig.enabled, hcaptchaConfig.siteKey, setNotification]);

  // 优化的 Turnstile 事件处理器
  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
    setError('');
    setNotification({
      message: '人机验证通过！',
      type: 'success'
    });
  }, [setNotification]);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setNotification({
      message: '验证已过期，请重新验证',
      type: 'warning'
    });
  }, [setNotification]);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(true);
    setError('人机验证失败，请重试');
    setNotification({
      message: '人机验证失败，请重试',
      type: 'error'
    });
  }, [setNotification]);

  // hCaptcha 事件处理器
  const handleHCaptchaVerify = useCallback((token: string) => {
    setHCaptchaToken(token);
    setHCaptchaVerified(true);
    setHCaptchaError(false);
    setError('');
    setNotification({
      message: 'hCaptcha验证通过！',
      type: 'success'
    });
  }, [setNotification]);

  const handleHCaptchaExpire = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setNotification({
      message: 'hCaptcha验证已过期，请重新验证',
      type: 'warning'
    });
  }, [setNotification]);

  const handleHCaptchaError = useCallback(() => {
    setHCaptchaToken('');
    setHCaptchaVerified(false);
    setHCaptchaError(true);
    setError('hCaptcha验证失败，请重试');
    setNotification({
      message: 'hCaptcha验证失败，请重试',
      type: 'error'
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

  const handleVerify = useCallback(async () => {
    if (!isVerified) return;

    const token = getCurrentToken();
    if (!token) return;

    setVerifying(true);
    setError('');

    try {
      const result = await verifyTempFingerprint(fingerprint, token, secureCaptchaConfig?.captchaType === CaptchaType.HCAPTCHA ? 'hcaptcha' : 'turnstile');
      if (result.success) {
        if (result.accessToken) {
          storeAccessToken(fingerprint, result.accessToken);
        }
        setNotification({
          message: '验证成功！正在跳转...',
          type: 'success'
        });
        setTimeout(() => {
          onVerificationComplete();
        }, 1500);
      } else {
        setError('验证失败，请重试');
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
      console.error('验证异常:', err);
      setError('服务器验证异常，请重试');
    } finally {
      setVerifying(false);
    }
  }, [isVerified, getCurrentToken, fingerprint, onVerificationComplete, setNotification, verificationMode, secureCaptchaConfig]);

  // 优化的Logo组件
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
        <div
          className={`mx-auto ${isMobile ? 'mb-4' : 'mb-8'} relative flex items-center justify-center`}
          style={{ width: logoSize, height: logoSize }}
        >
          {/* 装饰圈 */}
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-pulse" />
          
          <m.img
            src="https://picui.ogmua.cn/s1/2026/03/29/69c8f6226a17c.webp"
            alt="Synapse Logo"
            className="w-4/5 h-4/5 rounded-2xl shadow-2xl z-10"
            animate={prefersReducedMotion ? undefined : { 
              y: [0, -5, 0],
              filter: ["drop-shadow(0 0 0px rgba(79, 70, 229, 0))", "drop-shadow(0 0 15px rgba(79, 70, 229, 0.4))", "drop-shadow(0 0 0px rgba(79, 70, 229, 0))"]
            }}
            transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    );
  });

  // 背景粒子
  const BackgroundParticles = React.memo(() => {
    const particleData = useMemo(() => {
      const count = deviceInfo.isMobile ? 8 : 16;
      const width = deviceInfo.screenWidth;
      const height = typeof window !== 'undefined' ? window.innerHeight : 800;
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        initialX: (i * 137) % width,
        initialY: (i * 193) % height,
        duration: 20 + (i % 4) * 8,
        size: 4 + (i % 3) * 2,
        opacity: 0.1 + (i % 3) * 0.05
      }));
    }, [deviceInfo.isMobile, deviceInfo.screenWidth]);

    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particleData.map((p) => (
          <motion.div
            key={p.id}
            className="absolute bg-indigo-300/40 rounded-full blur-[1px]"
            style={{ width: p.size, height: p.size, left: p.initialX, top: p.initialY }}
            animate={prefersReducedMotion ? undefined : {
              y: [0, -100, 0],
              opacity: [p.opacity, p.opacity * 2, p.opacity]
            }}
            transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
    );
  });

  if (isIpBanned) {
    return (
      <div className="fixed inset-0 bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">IP地址已被封禁</h1>
          <p className="text-gray-600 mb-6">{banReason || '您的访问已被拒绝'}</p>
          {banExpiresAt && <p className="text-sm text-gray-400">到期时间: {banExpiresAt.toLocaleString()}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center z-50 p-4">
      {showParticles && <BackgroundParticles />}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/30 w-full max-w-md p-8"
      >
        <Logo />
        <h1 className="text-center text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">欢迎访问</h1>
        <p className="text-center text-gray-600 font-medium mb-6">Synapse</p>
        <p className="text-center text-gray-500 mb-8">为了确保安全性，请完成验证后继续访问</p>

        <div className="mb-8 flex justify-center">
          <Suspense fallback={<div className="h-16 w-full bg-gray-100 animate-pulse rounded-xl" />}>
            {verificationMode === 'turnstile' ? (
              <TurnstileWidget
                key={turnstileKey}
                siteKey={secureSiteKey || ''}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
              />
            ) : (
              <HCaptchaWidget
                key={hcaptchaKey}
                siteKey={secureSiteKey || ''}
                onVerify={handleHCaptchaVerify}
                onError={handleHCaptchaError}
                onExpire={handleHCaptchaExpire}
              />
            )}
          </Suspense>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-50 text-red-700 rounded-2xl text-sm text-center">
            {error}
          </motion.div>
        )}

        <motion.button
          onClick={handleVerify}
          disabled={!isVerified || verifying}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
            !isVerified || verifying
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 shadow-indigo-200'
          }`}
        >
          {verifying ? '验证中...' : '继续访问'}
        </motion.button>

        <div className="mt-8 text-center text-xs text-gray-400">
          此验证旨在保护您的账户和系统安全
        </div>
      </motion.div>

      {/* 隐私说明对话框 (精简版) */}
      <AnimatePresence>
        {showPrivacyModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            onClick={() => setShowPrivacyModal(false)}
          >
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">隐私说明</h3>
              <p className="text-gray-600 text-sm mb-6 leading-relaxed">我们使用先进的验证技术来识别恶意访问，此过程仅收集必要的技术信息，不涉及个人敏感数据。</p>
              <button className="w-full py-3 bg-gray-100 rounded-xl font-medium" onClick={() => setShowPrivacyModal(false)}>知道了</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
