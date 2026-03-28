import React, { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import { policyVerification } from '@site/src/utils/policyVerification';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro">
            开始使用 - 5min ⏱️
          </Link>
        </div>
      </div>
    </header>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: 20, verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center' }} title={copied ? '已复制' : '复制到剪贴板'}>
      {copied ? (
        <span style={{ fontSize: 22, color: '#22c55e', transition: 'color 0.2s' }}>✓</span>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      )}
    </button>
  );
}

function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [visible, setVisible] = useState(open);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };
  if (!visible && !open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: open ? 'rgba(30,41,59,0.25)' : 'rgba(30,41,59,0)',
        backdropFilter: open ? 'blur(4px)' : 'none',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.25s',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(99,102,241,0.18)',
          padding: '2.5rem 2rem 2rem 2rem',
          minWidth: 320,
          maxWidth: '90vw',
          textAlign: 'center',
          position: 'relative',
          transform: open ? 'scale(1)' : 'scale(0.85)',
          opacity: open ? 1 : 0,
          transition: 'all 0.25s cubic-bezier(.4,2,.6,1)',
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 12, color: '#6366f1' }}>📧</div>
        <h3 style={{ margin: '0 0 8px 0', color: '#3730a3' }}>开发者联系方式</h3>
        <p style={{ margin: 0, fontSize: 18, color: '#475569' }}>如有问题或建议，请联系：</p>
        <a href="mailto:support@hapxs.com" style={{ color: '#6366f1', fontWeight: 700, fontSize: 20 }}>
          support@hapxs.com</a>
        <div style={{ marginTop: 24, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <input type="checkbox" id="policy-check" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
          <label htmlFor="policy-check" style={{ fontSize: 15, color: '#334155', userSelect: 'none' }}>
            我已同意
            <a href="/policy" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500, margin: '0 2px' }}>隐私政策与服务条款</a>
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={async () => {
              if (checked) {
                try {
                  await policyVerification.handleUserConsent();
                  handleClose();
                } catch (error) {
                  console.error('Failed to record consent:', error);
                  // 即使记录失败也关闭模态框，避免阻塞用户
                  handleClose();
                }
              }
            }}
            disabled={!checked}
            style={{
              padding: '10px 32px',
              background: checked ? '#6366f1' : '#c7d2fe',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 700,
              cursor: checked ? 'pointer' : 'not-allowed',
              boxShadow: '0 2px 8px rgba(99,102,241,0.08)',
              transition: 'background 0.2s',
            }}
          >
            我已知晓
          </button>
        </div>
        <div style={{ marginTop: 18, fontSize: 15 }}>
          <a href="/policy" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>
            隐私政策与服务条款
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // 注册模态框回调
    const handleModalChange = (show: boolean) => {
      setShowModal(show);
    };

    policyVerification.registerModalCallback(handleModalChange);

    // 初始化隐私政策检查
    policyVerification.initializePolicyCheck().catch(error => {
      console.error('Policy verification initialization failed:', error);
    });

    // 清理回调
    return () => {
      policyVerification.unregisterModalCallback(handleModalChange);
    };
  }, []);

  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Synapse 文本转语音服务 API 文档 - 快速集成、高质量语音合成、多语言支持">
      <SupportModal open={showModal} onClose={() => setShowModal(false)} />
      <HomepageHeader />
      <main>
        <HomepageFeatures />

        {/* 新增：特色功能展示 */}
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              <div className="col col--4">
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>🚀</div>
                  <h3>快速集成</h3>
                  <p>简单易用的 RESTful API，支持多种编程语言，快速集成到您的应用中。</p>
                </div>
              </div>
              <div className="col col--4">
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>🎯</div>
                  <h3>高质量语音</h3>
                  <p>基于先进的深度学习技术，提供自然流畅、情感丰富的语音合成效果。</p>
                </div>
              </div>
              <div className="col col--4">
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon}>🌍</div>
                  <h3>多语言支持</h3>
                  <p>支持中文、英文等多种语言，满足全球用户的多语言需求。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 新增：快速开始指南 */}
        <section className={styles.quickStart}>
          <div className="container">
            <div className="text--center margin-bottom--xl">
              <Heading as="h2">快速开始</Heading>
              <p>在几分钟内开始使用 Synapse API</p>
            </div>
            <div className="row">
              <div className="col col--6">
                <div className={styles.codeBlock} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>1. 获取 API Key</h4>
                    <CopyButton text={`curl -X POST https://tts-api.951100.xyz/api/auth/register \
  -H \"Content-Type: application/json\" \
  -d '{"username": "your_username", "password": "your_password"}'`} />
                  </div>
                  <pre><code>{`curl -X POST https://tts-api.951100.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'`}</code></pre>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.codeBlock} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>2. 调用 TTS 接口</h4>
                    <CopyButton text={`curl -X POST https://tts-api.951100.xyz/api/tts/generate \
  -H \"Authorization: Bearer YOUR_TOKEN\" \
  -H \"Content-Type: application/json\" \
  -d '{"text": "Hello, World!", "model": "tts-1", "voice": "alloy"}'`} />
                  </div>
                  <pre><code>{`curl -X POST https://tts-api.951100.xyz/api/tts/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "model": "tts-1", "voice": "alloy"}'`}</code></pre>
                </div>
              </div>
            </div>
            <div className="text--center margin-top--xl">
              <Link className="button button--primary button--lg" to="/docs/getting-started">
                查看完整文档 →
              </Link>
            </div>
          </div>
        </section>

        {/* 新增：技术栈展示 */}
        <section className={styles.techStack}>
          <div className="container">
            <div className="text--center margin-bottom--xl">
              <Heading as="h2">支持的技术栈</Heading>
              <p>我们提供多种编程语言的 SDK 和示例代码</p>
            </div>
            <div className="row">
              <div className="col col--2">
                <Link to="/docs/sdk/web-frontend" className={styles.techItem}>
                  <div className={styles.techIcon}>⚡</div>
                  <span>JavaScript</span>
                </Link>
              </div>
              <div className="col col--2">
                <Link to="/docs/sdk/python-sdk" className={styles.techItem}>
                  <div className={styles.techIcon}>🐍</div>
                  <span>Python</span>
                </Link>
              </div>
              <div className="col col--2">
                <Link to="/docs/sdk/java-sdk" className={styles.techItem}>
                  <div className={styles.techIcon}>☕</div>
                  <span>Java</span>
                </Link>
              </div>
              <div className="col col--2">
                <Link to="/docs/sdk/go-sdk" className={styles.techItem}>
                  <div className={styles.techIcon}>🐹</div>
                  <span>Go</span>
                </Link>
              </div>
              <div className="col col--2">
                <Link to="/docs/sdk/rest-api" className={styles.techItem}>
                  <div className={styles.techIcon}>🔧</div>
                  <span>REST API</span>
                </Link>
              </div>
              <div className="col col--2">
                <Link to="/docs/sdk/rust-sdk" className={styles.techItem}>
                  <div className={styles.techIcon}>🦀</div>
                  <span>Rust</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
