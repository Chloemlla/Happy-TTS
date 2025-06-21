import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { integrityChecker } from './utils/integrityCheck'
import { disableSelection } from './utils/disableSelection'
import { domProtector } from './utils/domProtector'

// 禁止右键和常见调试快捷键
if (typeof window !== 'undefined') {
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    // F12
    if (e.key === 'F12') e.preventDefault();
    // Ctrl+Shift+I/C/U/J
    if ((e.ctrlKey && e.shiftKey && ['I', 'C', 'J'].includes(e.key)) ||
        (e.ctrlKey && e.key === 'U')) {
      e.preventDefault();
    }
  });

  // 初始化禁用选择功能
  disableSelection();
}

// 初始化完整性检查
document.addEventListener('DOMContentLoaded', () => {
  // 记录初始状态
  const criticalElements = [
    'app-header',
    'app-footer',
    'tts-form',
    'legal-notice'
  ];

  criticalElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      integrityChecker.setIntegrity(id, element.innerHTML);
    }
  });

  // 启动title监控
  domProtector.startTitleMonitoring();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 