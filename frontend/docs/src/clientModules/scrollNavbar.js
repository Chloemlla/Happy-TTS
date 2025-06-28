/**
 * 监听页面滚动，为导航栏添加滚动效果
 */
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

// 控制导航栏滚动状态的函数
function updateNavbarOnScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  
  // 当页面滚动超过30px时添加navbar-scrolled类
  if (window.scrollY > 30) {
    if (!navbar.classList.contains('navbar-scrolled')) {
      navbar.classList.add('navbar-scrolled');
    }
  } else {
    if (navbar.classList.contains('navbar-scrolled')) {
      navbar.classList.remove('navbar-scrolled');
    }
  }
}

// 使用节流函数避免频繁调用，性能比防抖更好
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

if (ExecutionEnvironment.canUseDOM) {
  // 页面加载时初始化
  document.addEventListener('DOMContentLoaded', () => {
    // 初始检查滚动位置
    updateNavbarOnScroll();
    
    // 监听滚动事件，使用性能更好的节流版本
    const throttledUpdateNavbar = throttle(updateNavbarOnScroll, 10);
    window.addEventListener('scroll', throttledUpdateNavbar, { passive: true });
  });
}

// 导出模块，在路由更新后也检查导航栏状态
export function onRouteDidUpdate() {
  if (ExecutionEnvironment.canUseDOM) {
    // 路由更新后检查导航栏状态
    setTimeout(updateNavbarOnScroll, 100);
  }
} 