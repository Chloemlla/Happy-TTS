import React, { useState, useEffect } from 'react';
import OriginalLayout from '@theme-original/Layout';

function PolicyConsentModal({ open, onAgree, checked, setChecked }: { open: boolean; onAgree: () => void; checked: boolean; setChecked: (v: boolean) => void }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(30,41,59,0.25)',
        backdropFilter: 'blur(4px)',
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
          maxHeight: '90vh',
          overflowY: 'auto',
          textAlign: 'center',
          position: 'relative',
          transform: 'scale(1)',
          opacity: 1,
          transition: 'all 0.25s cubic-bezier(.4,2,.6,1)',
        }}
      >
        <div style={{fontSize: 38, marginBottom: 12, color: '#6366f1'}}>📧</div>
        <h3 style={{margin: '0 0 8px 0', color: '#3730a3'}}>开发者联系方式</h3>
        <p style={{margin: 0, fontSize: 18, color: '#475569'}}>如有问题或建议，请联系：</p>
        <a href="mailto:support@hapxs.com" style={{color: '#6366f1', fontWeight: 700, fontSize: 20}}>
          support@hapxs.com</a>
        <div style={{marginTop: 24, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
          <input type="checkbox" id="policy-check" checked={checked} onChange={e => setChecked(e.target.checked)} style={{width: 18, height: 18}} />
          <label htmlFor="policy-check" style={{fontSize: 15, color: '#334155', userSelect: 'none'}}>
            我已同意
            <a href="/policy" target="_blank" rel="noopener noreferrer" style={{color: '#6366f1', textDecoration: 'none', fontWeight: 500, margin: '0 2px'}}>隐私政策与服务条款</a>
          </label>
        </div>
        <div style={{marginTop: 16}}>
          <button
            onClick={onAgree}
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
        <div style={{marginTop: 18, fontSize: 15}}>
          <a href="/policy" target="_blank" rel="noopener noreferrer" style={{color: '#6366f1', textDecoration: 'none', fontWeight: 500}}>
            隐私政策与服务条款
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Layout(props) {
  const [agreed, setAgreed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasAgreed = localStorage.getItem('hapxtts_support_modal_shown');
      setAgreed(hasAgreed === '1');
      setLoaded(true);
    }
  }, [typeof window !== 'undefined' ? window.location.pathname : '']);

  const handleAgree = () => {
    localStorage.setItem('hapxtts_support_modal_shown', '1');
    setAgreed(true);
  };

  if (!loaded) return null;
  if (!agreed) {
    return <PolicyConsentModal open={true} onAgree={handleAgree} checked={checked} setChecked={setChecked} />;
  }
  return <OriginalLayout {...props} />;
} 