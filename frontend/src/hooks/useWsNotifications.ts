import { useCallback } from 'react';
import { useWebSocket, WsServerMessage } from './useWebSocket';
import { useNotification } from '../components/Notification';

/**
 * 将 WebSocket 消息接入应用通知系统
 * 在 App 顶层调用一次即可
 */
export function useWsNotifications() {
  const { setNotification } = useNotification();

  const onMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'tts:progress':
        // TTS 进度不弹通知，由 TTS 页面自行处理
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
        setNotification({
          message: msg.data?.message || '系统通知',
          type: msg.data?.level === 'error' ? 'error'
            : msg.data?.level === 'warn' ? 'warning'
            : 'info',
          duration: msg.data?.duration ?? 5000,
        });
        break;

      case 'admin:broadcast':
        setNotification({
          message: msg.data?.message || '管理员消息',
          type: msg.data?.level === 'error' ? 'error'
            : msg.data?.level === 'warn' ? 'warning'
            : 'info',
          duration: msg.data?.duration ?? 8000,
        });
        break;
    }
  }, [setNotification]);

  return useWebSocket({ onMessage });
}
