import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiBaseUrl } from '../api/api';
import { getAuthToken } from '../utils/authSession';


// ========== 类型 ==========

export interface WsServerMessage {
  type: 'pong' | 'tts:progress' | 'tts:complete' | 'tts:error' | 'notification' | 'admin:broadcast' | 'fingerprint:require' | 'fingerprint:ack' | 'ticket:update' | 'ticket:process' | 'ticket:ai_response' | 'rust-benchmark:update';
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

// ========== WebSocket URL ==========

function normalizeWsUrl(rawUrl: string, token: string | null): string {
  const url = new URL(rawUrl, window.location.origin);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.pathname === '/' || !url.pathname) url.pathname = '/ws';
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function getWsUrl(): string {
  const token = getAuthToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

  const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (configuredWsUrl) {
    return normalizeWsUrl(configuredWsUrl, token);
  }

  const apiBaseUrl = getApiBaseUrl();
  const baseUrl = apiBaseUrl || window.location.origin;
  const wsBase = baseUrl
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');

  return `${wsBase.replace(/\/+$/, '')}/ws${tokenParam}`;
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

        // 自动重连
        if (reconnectCountRef.current < maxReconnects) {
          reconnectCountRef.current++;
          reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
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

  return { connected, connect, disconnect, send, subscribe, unsubscribe };
}
