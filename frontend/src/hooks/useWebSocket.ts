import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiBaseUrl } from '../api/api';
import { buildWebSocketUrl } from '../utils/webSocketUrl';

// ========== 类型 ==========

export interface WsServerMessage {
  type: 'pong' | 'tts:progress' | 'tts:complete' | 'tts:error' | 'notification' | 'admin:broadcast' | 'fingerprint:require' | 'fingerprint:ack' | 'ticket:update' | 'ticket:process' | 'ticket:ai_response';
  data?: any;
  timestamp: number;
}

type WsEventHandler = (msg: WsServerMessage) => void;

interface UseWebSocketOptions {
  /** 是否自动连接，默认 true */
  autoConnect?: boolean;
  /** 重连间隔（毫秒），默认 3000 */
  reconnectInterval?: number;
  /** 最大重连次数，默认 10 */
  maxReconnects?: number;
  /** 消息处理器 */
  onMessage?: WsEventHandler;
}

export function getWsUrl(): string {
  return buildWebSocketUrl({
    configuredUrl: import.meta.env.VITE_WS_URL,
    apiBaseUrl: getApiBaseUrl(),
    browserOrigin: window.location.origin,
  });
}

// ========== Hook ==========

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectInterval = 3000,
    maxReconnects = 10,
    onMessage,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const [connected, setConnected] = useState(false);
  // G9-29：达到最大重连次数后置位，供 UI 展示离线提示/手动重连
  const [reconnectLimitReached, setReconnectLimitReached] = useState(false);

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    try {
      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectCountRef.current = 0;
        setReconnectLimitReached(false);

        // 心跳：每 25 秒发一次 ping
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsServerMessage = JSON.parse(event.data);
          onMessageRef.current?.(msg);
        } catch {
          // 忽略非法消息
        }
      };

      ws.onclose = () => {
        setConnected(false);
        cleanup();

        // G9-29：指数退避重连（3000 → 6000 → … 封顶 30s），后端抖动时不形成 3s 一次的重连风暴
        if (reconnectCountRef.current < maxReconnects) {
          reconnectCountRef.current++;
          const backoffDelay = Math.min(
            reconnectInterval * Math.pow(2, reconnectCountRef.current - 1),
            30000,
          );
          reconnectTimerRef.current = setTimeout(connect, backoffDelay);
        } else {
          setReconnectLimitReached(true);
        }
      };

      ws.onerror = () => {
        // onclose 会紧跟触发，重连逻辑在 onclose 里处理
      };
    } catch {
      // URL 构造失败等异常
    }
  }, [cleanup, reconnectInterval, maxReconnects]);

  const disconnect = useCallback(() => {
    reconnectCountRef.current = maxReconnects; // 阻止自动重连
    setReconnectLimitReached(false);
    cleanup();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, [cleanup, maxReconnects]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((channel: string) => {
    send({ type: 'subscribe', channel });
  }, [send]);

  const unsubscribe = useCallback((channel: string) => {
    send({ type: 'unsubscribe', channel });
  }, [send]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return { connected, reconnectLimitReached, connect, disconnect, send, subscribe, unsubscribe };
}
