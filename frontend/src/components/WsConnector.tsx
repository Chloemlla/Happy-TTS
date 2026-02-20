import { useState, useRef, useCallback } from 'react';
import { FaPaperPlane, FaLock, FaLockOpen } from 'react-icons/fa';
import { useWsNotifications } from '../hooks/useWsNotifications';

/**
 * WebSocket 连接组件，附带消息发送输入框。
 * 支持"锁定输入"模式：发送后保留输入内容不清空。
 */
export default function WsConnector() {
  const { connected, send } = useWsNotifications();
  const [message, setMessage] = useState('');
  const [keepInput, setKeepInput] = useState(false);
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

    if (!keepInput) {
      setMessage('');
    }
    inputRef.current?.focus();
  }, [message, connected, send, keepInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 连接指示器（始终显示），点击展开/收起输入框
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {showInput && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-80 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? '输入 WebSocket 消息...' : '未连接'}
              disabled={!connected}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
              aria-label="WebSocket 消息输入"
            />
            <button
              onClick={() => setKeepInput(!keepInput)}
              className={`p-1.5 rounded-lg text-sm transition-colors ${
                keepInput
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={keepInput ? '发送后保留输入内容（点击切换）' : '发送后清空输入内容（点击切换）'}
              aria-label={keepInput ? '关闭保留输入' : '开启保留输入'}
            >
              {keepInput ? <FaLock className="w-3.5 h-3.5" /> : <FaLockOpen className="w-3.5 h-3.5" />}
            </button>
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
          {keepInput && (
            <p className="text-xs text-amber-600 mt-1.5 ml-1">🔒 发送后保留输入内容</p>
          )}
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
