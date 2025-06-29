import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { integrityChecker } from './utils/integrityCheck'
import { disableSelection } from './utils/disableSelection'

// 统一危险关键字
const DANGEROUS_KEYWORDS = [
  'supercopy', 'copy', 'fatkun', 'downloader', 'ocr', 'scraper', 'image', 'clip', 'capture'
];

function hasDangerousExtension() {
  // 1. 检查所有 script 标签（src 和内容，模糊匹配）
  const scripts = Array.from(document.querySelectorAll('script'));
  for (const s of scripts) {
    const src = (s.src || '').toLowerCase();
    const content = (s.textContent || '').toLowerCase();
    for (const kw of DANGEROUS_KEYWORDS) {
      if (src.includes(kw) || content.includes(kw)) return true;
    }
  }
  // 2. 检查已知扩展注入的 DOM
  for (const kw of DANGEROUS_KEYWORDS) {
    if (document.querySelector(`[id*="${kw}"], [class*="${kw}"], ${kw}-drop-panel`)) return true;
  }
  // 3. 检查 body/head 属性
  const allAttrs = [
    ...Array.from(document.body.attributes),
    ...Array.from(document.head ? document.head.attributes : [])
  ].map(a => a.name + '=' + a.value.toLowerCase());
  for (const attr of allAttrs) {
    for (const kw of DANGEROUS_KEYWORDS) {
      if (attr.includes(kw)) return true;
    }
  }
  // 4. 检查全局变量
  for (const kw of DANGEROUS_KEYWORDS) {
    if ((window as any)[kw]) return true;
  }
  return false;
}

function blockDangerousExtension() {
  // 响应式动画样式
  const animationStyles = `
      .danger-modal-main {
      scrollbar-width: thin;
      scrollbar-color: #e57373 #fff;
    }
    .danger-modal-main::-webkit-scrollbar {
      width: 8px;
      background: #fff;
      border-radius: 8px;
    }
    .danger-modal-main::-webkit-scrollbar-thumb {
      background: #e57373;
      border-radius: 8px;
      min-height: 40px;
    }
    .danger-modal-main::-webkit-scrollbar-thumb:hover {
      background: #d32f2f;
    }
    @keyframes fadeInScale {
      0% { opacity: 0; transform: scale(0.8) translateY(5vh); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-2vw); }
      20%, 40%, 60%, 80% { transform: translateX(2vw); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2vh); }
    }
    @keyframes slideInFromTop {
      0% { opacity: 0; transform: translateY(-5vh); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideInFromBottom {
      0% { opacity: 0; transform: translateY(5vh); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 600px) {
      .danger-modal-main { padding: 1.2rem !important; }
      .danger-modal-title { font-size: 1.5rem !important; }
      .danger-modal-btn { font-size: 1rem !important; padding: 0.7rem 1.2rem !important; }
      .danger-modal-list { font-size: 0.95rem !important; }
    }
  `;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = animationStyles;
  document.head.appendChild(styleSheet);

  // 让 body 可滚动
  document.body.style.overflow = 'auto';

  document.body.innerHTML = `
    <div style="position:fixed;z-index:99999;top:0;left:0;width:100vw;height:100vh;background:linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;min-height:100vh;min-width:100vw;">
      <!-- 主警告容器 -->
      <div class="danger-modal-main" style="background:rgba(255,255,255,0.97);backdrop-filter:blur(10px);border-radius:2.5rem;padding:2.5rem 2.5rem 2rem 2.5rem;text-align:center;max-width:90vw;width:32rem;box-shadow:0 10px 40px rgba(0,0,0,0.10);border:2px solid rgba(255,255,255,0.2);animation:fadeInScale 0.7s cubic-bezier(.4,2,.6,1) both;overflow-y:auto;max-height:90vh;">
        <div style="width:4.5rem;height:4.5rem;background:linear-gradient(135deg, #d32f2f, #f44336);border-radius:50%;margin:0 auto 1.5rem;display:flex;align-items:center;justify-content:center;animation:pulse 1.8s ease-in-out infinite;box-shadow:0 6px 18px rgba(211, 47, 47, 0.18);">
          <svg style="width:2.2rem;height:2.2rem;color:white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
        <h1 class="danger-modal-title" style="color:#d32f2f;font-size:2.1rem;margin-bottom:1.2rem;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.08);animation:slideInFromTop 0.7s cubic-bezier(.4,2,.6,1) 0.1s both;">
          ⚠️ 检测到非法脚本/扩展
        </h1>
        <div style="animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.2s both;">
          <p style="color:#333;font-size:1.15rem;margin-bottom:1.2rem;line-height:1.6;font-weight:500;">
            为了确保您的账户安全和系统稳定，我们检测到您的浏览器中运行了可能影响服务正常使用的扩展程序。
          </p>
          <div style="background:linear-gradient(135deg, #fff3cd, #ffeaa7);border:1px solid #ffc107;border-radius:0.9rem;padding:1.1rem;margin:1.1rem 0;animation:shake 0.5s cubic-bezier(.4,2,.6,1) 0.5s 1 both;">
            <p style="color:#856404;font-size:1.05rem;margin:0;font-weight:600;">
              🔒 <strong>安全提示：</strong>请关闭以下扩展后刷新页面：
            </p>
            <ul class="danger-modal-list" style="color:#856404;font-size:1rem;margin:0.7rem 0 0 0;text-align:left;padding-left:2rem;">
              <li style="margin:0.4rem 0;">• 超级复制 (SuperCopy)</li>
              <li style="margin:0.4rem 0;">• Fatkun批量图片下载</li>
              <li style="margin:0.4rem 0;">• 其他OCR识别扩展</li>
              <li style="margin:0.4rem 0;">• 网页内容抓取工具</li>
            </ul>
          </div>
          <p style="color:#666;font-size:0.98rem;margin-top:1.5rem;font-style:italic;">
            💡 <strong>操作步骤：</strong>关闭扩展 → 刷新页面 → 重新访问服务
          </p>
        </div>
        <div style="margin-top:1.5rem;animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.3s both;display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;">
          <button class="danger-modal-btn" onclick="window.location.reload()" style="background:linear-gradient(135deg, #4caf50, #45a049);color:white;border:none;padding:0.9rem 1.7rem;border-radius:0.8rem;font-size:1.08rem;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(76, 175, 80, 0.18);">
            🔄 刷新页面
          </button>
          <button class="danger-modal-btn" onclick="window.history.back()" style="background:linear-gradient(135deg, #2196f3, #1976d2);color:white;border:none;padding:0.9rem 1.7rem;border-radius:0.8rem;font-size:1.08rem;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(33, 150, 243, 0.18);">
            ⬅️ 返回上页
          </button>
        </div>
        <div style="margin-top:1.2rem;padding:0.7rem;background:rgba(255,255,255,0.5);border-radius:0.6rem;animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.4s both;">
          <p style="color:#666;font-size:0.92rem;margin:0;">
            🛡️ 此安全措施旨在保护您的账户和系统安全
          </p>
        </div>
      </div>
    </div>
  `;
  throw new Error('检测到危险扩展，已阻止渲染');
}

// 检测执行时机和多重保险
function runDangerousExtensionCheck() {
  if (hasDangerousExtension()) {
    blockDangerousExtension();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  runDangerousExtensionCheck();
  setTimeout(runDangerousExtensionCheck, 500);
  setTimeout(runDangerousExtensionCheck, 1500);
  setTimeout(runDangerousExtensionCheck, 3000);

  // MutationObserver 监听整个 document
  const observer = new MutationObserver(runDangerousExtensionCheck);
  observer.observe(document, { childList: true, subtree: true, attributes: true });

  // setInterval 定时检测，防止极端延迟注入
  setInterval(runDangerousExtensionCheck, 2000);
});

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
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 