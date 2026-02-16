import { useWsNotifications } from '../hooks/useWsNotifications';

/**
 * 无 UI 组件，仅负责建立 WebSocket 连接并将消息转发到通知系统。
 * 放在 NotificationProvider 内部、路由组件旁边即可。
 */
export default function WsConnector() {
  useWsNotifications();
  return null;
}
