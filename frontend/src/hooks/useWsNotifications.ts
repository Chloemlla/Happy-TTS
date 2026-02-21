import { useCallback } from 'react';
import { useWebSocket, WsServerMessage } from './useWebSocket';
import { useNotification } from '../components/Notification';
import { useBroadcastModal } from '../components/BroadcastModal';

/**
 * 将 WebSocket 消息接入应用通知系统
 * 在 App 顶层调用一次即可
 */
export function useWsNotifications() {
  const { setNotification } = useNotification();
  const { showBroadcastModal } = useBroadcastModal();

  const mapLevel = (level?: string) =>
    level === 'error' ? 'error' as const
    : level === 'warn' ? 'warning' as const
    : 'info' as const;

  const onMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'tts:progress':
        break;

      case 'tts:complete':
        setNotification({
          message: '语音生成完成',
          type: 'success',
        });
        break;

      case 'tts:error':
        setNotification({
          message: msg.data?.error || '语音生成失败',
          type: 'error',
        });
        break;

      case 'notification':
      case 'admin:broadcast':
        if (msg.data?.display === 'modal') {
          showBroadcastModal({
            title: msg.data?.title,
            content: msg.data?.message || '系统通知',
            format: msg.data?.format || 'text',
            level: msg.data?.level === 'error' ? 'error'
              : msg.data?.level === 'warn' ? 'warn'
              : 'info',
          });
        } else {
          setNotification({
            message: msg.data?.message || (msg.type === 'admin:broadcast' ? '管理员消息' : '系统通知'),
            type: mapLevel(msg.data?.level),
            duration: msg.data?.duration ?? (msg.type === 'admin:broadcast' ? 8000 : 5000),
          });
        }
        break;
    }
  }, [setNotification, showBroadcastModal]);

  return useWebSocket({ onMessage });
}
