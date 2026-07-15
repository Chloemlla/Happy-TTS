import React from 'react';
import { motion } from 'framer-motion';

export type RevealPasswordMethod = 'password' | 'totp' | 'passkey';

export interface RevealPasswordTargetUser {
  id: string;
  username: string;
}

export interface RevealPasswordState {
  open: boolean;
  targetUser: RevealPasswordTargetUser | null;
  reason: string;
  method: RevealPasswordMethod;
  password: string;
  verificationCode: string;
  verificationToken: string;
  revealedPassword: string;
  loading: boolean;
}

interface RevealPasswordModalProps {
  state: RevealPasswordState;
  adminUsername?: string;
  hoverScale?: (scale: number, enabled?: boolean) => { scale: number } | undefined;
  tapScale?: (scale: number, enabled?: boolean) => { scale: number } | undefined;
  onClose: () => void;
  onChange: (patch: Partial<RevealPasswordState>) => void;
  onVerify: () => void;
}

export function RevealPasswordModal({
  state,
  adminUsername,
  hoverScale,
  tapScale,
  onClose,
  onChange,
  onVerify,
}: RevealPasswordModalProps) {
  if (!state.open || !state.targetUser) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            查看密码 - {state.targetUser.username}
          </h3>
          <motion.button
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
            whileHover={hoverScale?.(1.02)}
            whileTap={tapScale?.(0.95)}
          >
            ✕
          </motion.button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">查看原因</label>
            <textarea
              rows={3}
              value={state.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
              placeholder="请输入查看原因（4-200字符）"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">二次验证方式</label>
            <select
              value={state.method}
              onChange={(e) =>
                onChange({
                  method: e.target.value as RevealPasswordMethod,
                  password: '',
                  verificationCode: '',
                  verificationToken: '',
                  revealedPassword: '',
                })
              }
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
            >
              <option value="password">管理员密码</option>
              <option value="totp">TOTP 验证码</option>
              <option value="passkey">Passkey</option>
            </select>
          </div>

          {state.method === 'password' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">管理员密码</label>
              <input
                type="password"
                value={state.password}
                onChange={(e) => onChange({ password: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                placeholder="请输入当前管理员密码"
              />
            </div>
          ) : state.method === 'totp' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">TOTP 验证码</label>
              <input
                type="text"
                value={state.verificationCode}
                onChange={(e) => onChange({ verificationCode: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all text-sm"
                placeholder="请输入 6 位验证码"
              />
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
              Passkey 将使用当前管理员账号 {adminUsername || ''} 进行验证
            </div>
          )}

          {state.revealedPassword ? (
            <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50">
              <div className="text-sm font-semibold text-indigo-700 mb-1">明文密码</div>
              <div className="font-mono text-sm break-all text-gray-800">{state.revealedPassword}</div>
              <div className="mt-2 text-xs text-indigo-600">30 秒后自动隐藏</div>
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <motion.button
              type="button"
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition font-medium disabled:opacity-60"
              onClick={onVerify}
              disabled={state.loading}
              whileHover={hoverScale?.(1.02)}
              whileTap={tapScale?.(0.95)}
            >
              {state.loading ? '处理中...' : state.revealedPassword ? '重新验证并查看' : '验证并查看密码'}
            </motion.button>
            <motion.button
              type="button"
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
              onClick={onClose}
              whileHover={hoverScale?.(1.02)}
              whileTap={tapScale?.(0.95)}
            >
              关闭
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
