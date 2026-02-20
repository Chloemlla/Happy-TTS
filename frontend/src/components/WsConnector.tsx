import { useState, useRef, useCallback } from 'react';
import { FaPaperPlane } from 'react-icons/fa';
import { useWsNotifications } from '../hooks/useWsNotifications';

/**
 * WebSocket 连接组件，附带消息发送输入框。
 */
export default function WsConnector() {
  const { connected, send } = useWsNotifications();
  const [message, setMessage] = useState('');
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || !connected) return;

    try {
      const parsed = JSON.parse(trimmed);
      send(parsed);
    } catch {
      send({ type: 'message', data: trimmed });
    }

    setMessage('');
    inputRef.current?.focus();
  }, [message, connected, send]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 连接指示器（始终显示），点击展开/收起输入框
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-sm:bottom-2 max-sm:right-2">
      {showInput && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-80 max-sm:w-[calc(100vw-1rem)] max-sm:mr-0 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? '输入 WebSocket 消息...' : '未连接'}
              disabled={!connected}
              className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
              aria-label="WebSocket 消息输入"
            />
            <button
              onClick={handleSend}
              disabled={!connected || !message.trim()}
              className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              title="发送消息"
              aria-label="发送消息"
            >
              <FaPaperPlane className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setShowInput(!showInput)}
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          connected
            ? 'bg-green-500 hover:bg-green-600'
            : 'bg-gray-400 hover:bg-gray-500'
        }`}
        title={connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
        aria-label={showInput ? '收起消息面板' : '展开消息面板'}
      >
        <div className={`w-3 h-3 rounded-full ${connected ? 'bg-white animate-pulse' : 'bg-gray-200'}`} />
      </button>
    </div>
  );
}
