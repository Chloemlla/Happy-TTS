import { useEffect, useRef } from 'react';
import { domProtector } from '../utils/domProtector';

export function useDomProtection(id: string) {
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (element) {
      // 开始监控
      domProtector.startMonitoring(element, id);

      // 组件卸载时停止监控
      return () => {
        domProtector.stopMonitoring();
      };
    }
  }, [id]);

  return elementRef;
} 