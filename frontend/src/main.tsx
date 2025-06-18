import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

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
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 