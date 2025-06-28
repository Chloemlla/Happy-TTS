/**
 * 修复导航栏在窗口大小变化时可能出现的错位问题
 */
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

function fixNavbarPosition() {
  // 重置导航栏样式
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    // 强制重新计算布局
    navbar.style.display = 'none';
    // 触发重绘
    void navbar.offsetHeight;
    navbar.style.display = '';
  }
  console.log('fixNavbarPosition called');
  console.log('Navbar element:', navbar);
}

// 使用防抖函数避免频繁调用
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

if (ExecutionEnvironment.canUseDOM) {
  // 在窗口大小变化时修复导航栏
  const debouncedFixNavbar = debounce(fixNavbarPosition, 250);
  window.addEventListener('resize', debouncedFixNavbar);
  
  // 在页面加载完成后执行一次修复
  document.addEventListener('DOMContentLoaded', fixNavbarPosition);
  
  // 在导航完成后也执行修复
  const observer = new MutationObserver(debouncedFixNavbar);
  
  // 在DOM加载后开始观察
  document.addEventListener('DOMContentLoaded', () => {
    const navbarElement = document.querySelector('.navbar');
    if (navbarElement) {
      observer.observe(navbarElement, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }
  });
}

// 导出模块
export function onRouteDidUpdate() {
  if (ExecutionEnvironment.canUseDOM) {
    // 路由更新后修复导航栏
    setTimeout(fixNavbarPosition, 100);
  }
} 