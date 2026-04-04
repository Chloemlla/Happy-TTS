import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPaperPlane, FaTimes, FaUser, FaRobot } from 'react-icons/fa';
import { useLibreChat } from './LibreChatContext';
import { ReadOnlyMarkdownRenderer } from './LibreChatPage';
import { TurnstileWidget } from './TurnstileWidget';

export function LibreChatRealtimeDialog() {
    const { state, actions } = useLibreChat();

    return (
        <AnimatePresence>
            {state.rtOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-full max-w-2xl bg-white rounded-xl p-6 shadow-sm border border-gray-200 relative"
                    >
                        <div className="flex items-center mb-4 pr-10">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <FaPaperPlane className="text-blue-500" />
                                实时对话（支持上下文）
                            </h3>
                            <button
                                onClick={actions.closeRealtimeDialog}
                                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 bg-white transition-colors"
                                aria-label="关闭"
                                title="关闭"
                            >
                                <FaTimes className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <input
                                    className="border-2 border-gray-200 rounded-lg px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                                    placeholder="请输入 Token"
                                    value={state.token}
                                    onChange={(e) => actions.setToken(e.target.value)}
                                />
                                <input
                                    className="border-2 border-gray-200 rounded-lg px-4 py-3 w-full sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                                    placeholder="请输入消息（支持上下文）"
                                    value={state.rtMessage}
                                    maxLength={state.MAX_MESSAGE_LEN}
                                    onChange={(e) => actions.onChangeRtMessage(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !state.rtSending && !state.rtStreaming) actions.handleRealtimeSend(); }}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-400">{state.rtMessage.length}/{state.MAX_MESSAGE_LEN}</div>
                                {state.rtError && <div className="text-red-500 text-sm">{state.rtError}</div>}
                            </div>

                            {/* Turnstile 人机验证（非管理员用户） */}
                            {!state.isAdmin && !state.turnstileConfigLoading && state.turnstileConfig?.siteKey && typeof state.turnstileConfig.siteKey === 'string' && (
                                <motion.div
                                    className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <div className="text-sm text-gray-700 mb-3 text-center">
                                        人机验证
                                        {state.turnstileVerified && (
                                            <span className="ml-2 text-green-600 font-medium">✓ 验证通过</span>
                                        )}
                                    </div>

                                    <TurnstileWidget
                                        key={state.turnstileKey}
                                        siteKey={state.turnstileConfig.siteKey}
                                        onVerify={actions.handleTurnstileVerify}
                                        onExpire={actions.handleTurnstileExpire}
                                        onError={actions.handleTurnstileError}
                                        theme="light"
                                        size="normal"
                                    />

                                    {state.rtError && !state.turnstileVerified && (
                                        <div className="mt-2 text-sm text-red-500 text-center">
                                            验证失败，请重新验证
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            <div className="flex items-center justify-end gap-2">
                                <motion.button
                                    onClick={actions.handleRealtimeSend}
                                    disabled={state.rtSending || (!state.isAdmin && !!state.turnstileConfig?.siteKey && !state.turnstileVerified)}
                                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <FaPaperPlane className="w-4 h-4" />
                                    {state.rtSending ? '发送中...' : '发送'}
                                </motion.button>
                            </div>

                            <div className="mt-4">
                                {state.rtHistory.length > 0 ? (
                                    <div className="space-y-3 max-h-[45vh] overflow-auto pr-1">
                                        {state.rtHistory.map((m: any, idx: number) => (
                                            <motion.div
                                                key={idx}
                                                className="p-4 border border-gray-200 rounded-lg bg-white"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.role === 'user'
                                                        ? 'bg-blue-500'
                                                        : 'bg-green-500'
                                                        }`}>
                                                        {m.role === 'user' ? (
                                                            <FaUser className="w-4 h-4 text-white" />
                                                        ) : (
                                                            <FaRobot className="w-4 h-4 text-white" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-medium ${m.role === 'user'
                                                            ? 'text-blue-700'
                                                            : 'text-green-700'
                                                            }`}>
                                                            {m.role === 'user' ? '用户' : '助手'}
                                                            {state.rtStreaming && idx === state.rtHistory.length - 1 ? '（生成中...）' : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <ReadOnlyMarkdownRenderer
                                                    content={m.role === 'user' ? m.content : actions.sanitizeAssistantText(m.content)}
                                                    onCodeCopy={(success) => {
                                                        if (success) {
                                                            actions.setNotification({ type: 'success', message: '代码已复制' });
                                                        } else {
                                                            actions.setNotification({ type: 'error', message: '复制失败' });
                                                        }
                                                    }}
                                                />
                                            </motion.div>
                                        ))}
                                    </div>
                                ) : state.rtStreaming || state.rtStreamContent ? (
                                    <motion.div
                                        className="p-4 border border-gray-200 rounded-lg bg-white"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                                                <FaRobot className="w-4 h-4 text-white" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-green-700">
                                                    助手{state.rtStreaming ? '（生成中...）' : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <ReadOnlyMarkdownRenderer
                                            content={actions.sanitizeAssistantText(state.rtStreamContent || '')}
                                            onCodeCopy={(success) => {
                                                if (success) {
                                                    actions.setNotification({ type: 'success', message: '代码已复制' });
                                                } else {
                                                    actions.setNotification({ type: 'error', message: '复制失败' });
                                                }
                                            }}
                                        />
                                    </motion.div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <FaPaperPlane className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                        输入内容并点击发送以开始单次对话
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
