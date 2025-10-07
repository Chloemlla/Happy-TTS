import React, { useState, useEffect } from 'react';
import OriginalLayout from '@theme-original/Layout';
import PolicyConsentModal from '../components/PolicyConsentModal';
import { policyVerification } from '../utils/policyVerification';

export default function Layout(props) {
  const [agreed, setAgreed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setLoaded(true);
      setIsChecking(false);
      return;
    }

    // 异步检查同意状态
    const checkConsent = async () => {
      try {
        // 清理旧版本的存储
        const oldConsent = localStorage.getItem('hapxtts_support_modal_shown');
        if (oldConsent) {
          localStorage.removeItem('hapxtts_support_modal_shown');
        }

        // 使用新的验证系统（现在是异步的）
        const hasValidConsent = await policyVerification.hasValidConsent();
        setAgreed(hasValidConsent);
        
        // 在开发环境下记录调试信息
        if (policyVerification.isDevelopment()) {
          console.log('Policy consent status:', hasValidConsent);
        }
      } catch (error) {
        console.error('Error checking policy consent:', error);
        setAgreed(false);
      } finally {
        setIsChecking(false);
        setLoaded(true);
      }
    };

    checkConsent();
  }, []);

  // 监听路径变化，重新检查同意状态
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && loaded) {
      const handleLocationChange = async () => {
        // 每次路径变化时重新验证（异步）
        try {
          const hasValidConsent = await policyVerification.hasValidConsent();
          if (!hasValidConsent && agreed) {
            setAgreed(false);
          }
        } catch (error) {
          console.error('Error re-validating consent on location change:', error);
          setAgreed(false);
        }
      };

      // 监听浏览器前进后退
      window.addEventListener('popstate', handleLocationChange);
      
      return () => {
        window.removeEventListener('popstate', handleLocationChange);
      };
    }
  }, [loaded, agreed]);

  const handleAgree = async () => {
    try {
      await policyVerification.recordConsent();
      setAgreed(true);
    } catch (error) {
      console.error('Error recording consent:', error);
      alert('同意记录失败，请重试');
    }
  };

  // 显示加载状态
  if (!loaded || isChecking) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '18px',
        fontWeight: 500
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid rgba(255,255,255,0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          正在加载...
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // 显示同意模态框
  if (!agreed) {
    return <PolicyConsentModal open={true} onAgree={handleAgree} />;
  }

  // 渲染正常布局
  return <OriginalLayout {...props} />;
} 