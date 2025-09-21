import { useEffect, useState } from 'react';

// Hook: 检测用户的 prefers-reduced-motion 偏好并返回布尔值
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(!!(mq && mq.matches));

    handler();

    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(handler as any);
      }
    }

    return () => {
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', handler);
        } else if (typeof mq.removeListener === 'function') {
          mq.removeListener(handler as any);
        }
      }
    };
  }, []);

  return reduced;
}

export default useReducedMotion;


