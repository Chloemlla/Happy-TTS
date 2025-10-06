import React, { useState, useEffect, useCallback } from 'react';
import { policyVerification } from '../utils/policyVerification';

// 检测暗黑模式
const isDarkMode = () => {
  if (typeof window === 'undefined') return false;
  
  // 检查 Docusaurus 暗黑模式
  const htmlElement = document.documentElement;
  const hasDataTheme = htmlElement.getAttribute('data-theme') === 'dark';
  const hasDarkClass = htmlElement.classList.contains('dark');
  
  // 检查系统偏好
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  return hasDataTheme || hasDarkClass || prefersDark;
};

interface PolicyConsentModalProps {
  open: boolean;
  onAgree: () => void;
}

export default function PolicyConsentModal({ open, onAgree }: PolicyConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  // 防止快速点击绕过
  const [lastClickTime, setLastClickTime] = useState(0);
  const MIN_CLICK_INTERVAL = 1000; // 1秒最小间隔

  // 阅读时间验证
  const [readingStartTime, setReadingStartTime] = useState(0);
  const MIN_READING_TIME = 10000; // 最少阅读10秒

  useEffect(() => {
    if (open) {
      setReadingStartTime(Date.now());
      
      // 检测暗黑模式
      setDarkMode(isDarkMode());
      
      // 完整性检查
      const integrityCheck = policyVerification.performIntegrityCheck();
      if (!integrityCheck) {
        setShowWarning(true);
      }
      
      // 监听主题变化
      const observer = new MutationObserver(() => {
        setDarkMode(isDarkMode());
      });
      
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme', 'class']
        });
      }
      
      // 监听系统主题变化
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => setDarkMode(isDarkMode());
      mediaQuery.addListener(handleChange);
      
      return () => {
        observer.disconnect();
        mediaQuery.removeListener(handleChange);
      };
    }
  }, [open]);

  // 倒计时效果
  useEffect(() => {
    if (open && readingStartTime > 0) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - readingStartTime;
        const remaining = Math.max(0, MIN_READING_TIME - elapsed);
        setTimeRemaining(remaining);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [open, readingStartTime]);

  const handleAgree = useCallback(async () => {
    const now = Date.now();
    
    // 防止快速点击
    if (now - lastClickTime < MIN_CLICK_INTERVAL) {
      console.warn('Click too fast, please wait');
      return;
    }
    setLastClickTime(now);

    // 检查是否已勾选
    if (!checked) {
      setShowWarning(true);
      return;
    }

    // 检查阅读时间
    const readingTime = now - readingStartTime;
    if (readingTime < MIN_READING_TIME) {
      setShowWarning(true);
      setAttempts(prev => prev + 1);
      return;
    }

    // 检查尝试次数（防止暴力绕过）
    if (attempts >= 3) {
      alert('检测到异常行为，请刷新页面重试');
      window.location.reload();
      return;
    }

    setIsLoading(true);
    
    try {
      // 记录同意
      policyVerification.recordConsent();
      
      // 模拟网络延迟（防止脚本绕过）
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      onAgree();
    } catch (error) {
      console.error('Error recording consent:', error);
      alert('同意记录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [checked, readingStartTime, lastClickTime, attempts, onAgree]);

  const handlePolicyClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // 在新窗口打开政策页面，防止绕过当前页面
    const policyWindow = window.open('/policy', '_blank', 'noopener,noreferrer');
    if (!policyWindow) {
      alert('请允许弹出窗口以查看隐私政策');
    }
  }, []);

  if (!open) return null;

  const canAgree = checked && timeRemaining === 0 && !isLoading;
  const readingProgress = Math.min(100, ((Date.now() - readingStartTime) / MIN_READING_TIME) * 100);

  // 主题配置
  const themeConfig = {
    light: {
      modalBackground: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      textPrimary: '#1e293b',
      textSecondary: '#64748b',
      textMuted: '#94a3b8',
      border: 'rgba(99,102,241,0.1)',
      progressBackground: '#e2e8f0',
      warningBackground: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
      warningBorder: '#fecaca',
      warningText: '#dc2626',
      versionBackground: '#f8fafc',
      versionText: '#64748b',
      checkboxBackground: '#ffffff',
      buttonDisabledBackground: '#e2e8f0',
      buttonDisabledText: '#64748b'
    },
    dark: {
      modalBackground: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      border: 'rgba(99,102,241,0.3)',
      progressBackground: '#475569',
      warningBackground: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
      warningBorder: '#dc2626',
      warningText: '#fecaca',
      versionBackground: '#334155',
      versionText: '#cbd5e1',
      checkboxBackground: '#475569',
      buttonDisabledBackground: '#475569',
      buttonDisabledText: '#94a3b8'
    }
  };

  const theme = darkMode ? themeConfig.dark : themeConfig.light;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(30,41,59,0.35)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        userSelect: 'none', // 防止文本选择
      }}
      onContextMenu={(e) => e.preventDefault()} // 禁用右键菜单
    >
      <div
        style={{
          background: theme.modalBackground,
          borderRadius: 20,
          boxShadow: darkMode 
            ? '0 20px 60px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.2)' 
            : '0 20px 60px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.1)',
          padding: '2.5rem 2rem 2rem 2rem',
          minWidth: 380,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          textAlign: 'center',
          position: 'relative',
          border: `1px solid ${theme.border}`,
          transform: 'scale(1)',
          opacity: 1,
          transition: 'all 0.3s cubic-bezier(.4,0,.6,1)',
        }}
      >
        {/* 顶部装饰 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60px',
          height: '4px',
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
          borderRadius: '0 0 4px 4px'
        }} />

        {/* 图标 */}
        <div style={{
          fontSize: 48,
          marginBottom: 16,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          🛡️
        </div>

        {/* 标题 */}
        <h3 style={{
          margin: '0 0 12px 0',
          color: theme.textPrimary,
          fontSize: '1.5rem',
          fontWeight: 700
        }}>
          隐私政策与服务条款
        </h3>

        {/* 说明文字 */}
        <p style={{
          margin: '0 0 20px 0',
          fontSize: 16,
          color: theme.textSecondary,
          lineHeight: 1.6
        }}>
          为了保护您的隐私和权益，请仔细阅读我们的隐私政策与服务条款
        </p>

        {/* 阅读进度条 */}
        {timeRemaining > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: '100%',
              height: 8,
              background: theme.progressBackground,
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 8
            }}>
              <div style={{
                width: `${readingProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                transition: 'width 0.1s ease'
              }} />
            </div>
            <p style={{
              fontSize: 14,
              color: theme.textSecondary,
              margin: 0
            }}>
              请等待 {Math.ceil(timeRemaining / 1000)} 秒后继续...
            </p>
          </div>
        )}

        {/* 警告信息 */}
        {showWarning && (
          <div style={{
            background: theme.warningBackground,
            border: `1px solid ${theme.warningBorder}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            color: theme.warningText
          }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
            <p style={{ margin: 0, fontSize: 14 }}>
              {attempts > 0 
                ? `请仔细阅读政策内容（尝试 ${attempts}/3）`
                : '请先勾选同意选项并确保已充分阅读政策内容'
              }
            </p>
          </div>
        )}

        {/* 同意选项 */}
        <div style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 12,
          textAlign: 'left'
        }}>
          <input
            type="checkbox"
            id="policy-check"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              setShowWarning(false);
            }}
            style={{
              width: 20,
              height: 20,
              marginTop: 2,
              accentColor: '#6366f1'
            }}
            disabled={timeRemaining > 0}
          />
          <label
            htmlFor="policy-check"
            style={{
              fontSize: 15,
              color: theme.textPrimary,
              cursor: timeRemaining > 0 ? 'not-allowed' : 'pointer',
              lineHeight: 1.5,
              opacity: timeRemaining > 0 ? 0.6 : 1
            }}
          >
            我已仔细阅读并同意
            <button
              onClick={handlePolicyClick}
              style={{
                color: '#6366f1',
                textDecoration: 'none',
                fontWeight: 600,
                margin: '0 4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = '#6366f1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'transparent';
              }}
            >
              《隐私政策与服务条款》
            </button>
            的全部内容
          </label>
        </div>

        {/* 同意按钮 */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={handleAgree}
            disabled={!canAgree}
            style={{
              padding: '14px 40px',
              background: canAgree 
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' 
                : theme.buttonDisabledBackground,
              color: canAgree ? '#ffffff' : theme.buttonDisabledText,
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: canAgree ? 'pointer' : 'not-allowed',
              boxShadow: canAgree 
                ? '0 4px 16px rgba(99,102,241,0.3)' 
                : 'none',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              if (canAgree) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (canAgree) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.3)';
              }
            }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                <div style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid rgba(255,255,255,0.9)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ color: '#fff' }}>处理中...</span>
              </span>
            ) : (
              <span style={{ color: canAgree ? '#fff' : '#94a3b8' }}>我已知晓并同意</span>
            )}
          </button>
        </div>

        {/* 底部链接 */}
        <div style={{ fontSize: 14 }}>
          <button
            onClick={handlePolicyClick}
            style={{
              color: '#6366f1',
              textDecoration: 'none',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: '1px solid transparent',
              transition: 'border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderBottomColor = '#6366f1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderBottomColor = 'transparent';
            }}
          >
            查看完整的隐私政策与服务条款 →
          </button>
        </div>

        {/* 版本信息 */}
        <div style={{
          marginTop: 20,
          padding: 12,
          background: theme.versionBackground,
          borderRadius: 8,
          fontSize: 12,
          color: theme.versionText
        }}>
          政策版本: {policyVerification.getPolicyVersion()} | 
          更新时间: 2025年10月6日
        </div>
      </div>

      {/* CSS动画 */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
