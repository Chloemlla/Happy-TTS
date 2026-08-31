import { useEffect, useRef } from 'react';
import { domProtector } from '../utils/domProtector';

export function useDomProtection(id: string) {
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (element) {
      // 开始监控
      domProtector.startMonitoring(element, id);

      // 组件卸载时只停止当前 id 的监控（G9-15：Map 管理多元素，避免互相干扰）
      return () => {
        domProtector.stopMonitoring(id);
      };
    }
  }, [id]);

  return elementRef;
} 