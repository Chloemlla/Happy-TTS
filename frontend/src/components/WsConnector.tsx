import { useCallback, useEffect, useRef, useState } from 'react';
import { useWsNotifications } from '../hooks/useWsNotifications';

const COLLISION_INSET = 4;
const MOBILE_VIEWPORT_WIDTH = 640;

function isHiddenByStyle(element: Element) {
  const style = window.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
}

function isImportantPageControl(element: Element) {
  if (element instanceof HTMLHtmlElement || element instanceof HTMLBodyElement) return false;
  if (isHiddenByStyle(element)) return false;

  const candidate = element.closest(
    [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="dialog"]',
      '[role="menu"]',
      '[role="navigation"]',
      '[role="tablist"]',
      '[role="toolbar"]',
      '.Toastify',
      '.Toastify__toast',
    ].join(','),
  ) ?? element;

  if (candidate instanceof HTMLHtmlElement || candidate instanceof HTMLBodyElement) return false;
  if (isHiddenByStyle(candidate)) return false;

  const rect = candidate.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;

  const style = window.getComputedStyle(candidate);
  const isFloatingLayer = style.position === 'fixed' || style.position === 'sticky';
  const isInteractive = candidate.matches(
    'button,a[href],input,select,textarea,[role="button"],[role="link"],[role="menu"],[role="navigation"],[role="tablist"],[role="toolbar"]',
  );
  const isDialogOrToast = candidate.matches('[role="dialog"],.Toastify,.Toastify__toast');
  const isNarrowScreenBottomControl =
    window.innerWidth <= MOBILE_VIEWPORT_WIDTH &&
    rect.bottom > window.innerHeight - 96 &&
    rect.right > window.innerWidth - 96;

  return isFloatingLayer || isInteractive || isDialogOrToast || isNarrowScreenBottomControl;
}

function getSamplePoints(rect: DOMRect) {
  const left = rect.left + COLLISION_INSET;
  const right = rect.right - COLLISION_INSET;
  const top = rect.top + COLLISION_INSET;
  const bottom = rect.bottom - COLLISION_INSET;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return [
    [centerX, centerY],
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ] as const;
}

/**
 * WebSocket 连接指示器组件。
 * 在页面右下角显示连接状态圆点。
 */
export default function WsConnector() {
  const { connected } = useWsNotifications();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [shouldFadeOut, setShouldFadeOut] = useState(false);

  const checkIfCoveringPageControl = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const previousPointerEvents = root.style.pointerEvents;
    root.style.pointerEvents = 'none';

    const coveringPageControl = getSamplePoints(rect).some(([x, y]) => {
      const stack = document.elementsFromPoint(x, y);
      return stack.some((element) => {
        if (root.contains(element)) return false;
        return isImportantPageControl(element);
      });
    });

    root.style.pointerEvents = previousPointerEvents;
    setShouldFadeOut((current) => (current === coveringPageControl ? current : coveringPageControl));
  }, []);

  const scheduleCheck = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      checkIfCoveringPageControl();
    });
  }, [checkIfCoveringPageControl]);

  useEffect(() => {
    scheduleCheck();

    const viewport = window.visualViewport;
    const observer = new MutationObserver(scheduleCheck);
    const resizeObserver = new ResizeObserver(scheduleCheck);

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
    if (rootRef.current) resizeObserver.observe(rootRef.current);

    window.addEventListener('resize', scheduleCheck);
    window.addEventListener('scroll', scheduleCheck, true);
    viewport?.addEventListener('resize', scheduleCheck);
    viewport?.addEventListener('scroll', scheduleCheck);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleCheck);
      window.removeEventListener('scroll', scheduleCheck, true);
      viewport?.removeEventListener('resize', scheduleCheck);
      viewport?.removeEventListener('scroll', scheduleCheck);
    };
  }, [scheduleCheck]);

  return (
    <div
      ref={rootRef}
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 max-sm:bottom-2 max-sm:right-2 ${
        shouldFadeOut ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100'
      }`}
      aria-hidden={shouldFadeOut}
    >
      <div
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          connected
            ? 'bg-green-500'
            : 'bg-gray-400'
        }`}
        title={connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
        aria-label={connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
      >
        <div className={`w-3 h-3 rounded-full ${connected ? 'bg-white animate-pulse' : 'bg-gray-200'}`} />
      </div>
    </div>
  );
}
