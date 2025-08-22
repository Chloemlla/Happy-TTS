import React from 'react';
import { FaMoon, FaSun } from 'react-icons/fa';
import { toggleTheme } from '../utils/theme';

export const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = React.useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const onClick = () => {
    const next = toggleTheme();
    setIsDark(next === 'dark');
  };

  return (
    <button
      onClick={onClick}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      className="fixed bottom-4 right-4 z-[1000] inline-flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border border-white/30 bg-white/80 backdrop-blur dark:bg-gray-800/80 dark:border-gray-700 text-gray-700 dark:text-gray-100 hover:shadow-xl transition-all"
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {isDark ? <FaSun className="w-4 h-4" /> : <FaMoon className="w-4 h-4" />}
      <span className="hidden sm:inline text-sm">{isDark ? '浅色' : '深色'}</span>
    </button>
  );
};

export default ThemeToggle;
