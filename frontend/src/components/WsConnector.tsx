import { useWsNotifications } from '../hooks/useWsNotifications';

/**
 * WebSocket 连接指示器组件。
 * 在页面右下角显示连接状态圆点。
 */
export default function WsConnector() {
  const { connected } = useWsNotifications();

  return (
    <div className="fixed bottom-4 right-4 z-50 max-sm:bottom-2 max-sm:right-2">
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
