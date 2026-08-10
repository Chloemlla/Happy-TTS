import React, { useMemo, createContext, use, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaBullhorn, FaExclamationTriangle, FaInfoCircle, FaCheckCircle } from 'react-icons/fa';
import DOMPurify from 'dompurify';
import MarkdownRenderer from './MarkdownRenderer';
import { useNavigate } from 'react-router-dom';
import {
  type ConfigurationNoticeIssue,
  type ConfigurationNoticeWorkflow,
  readConfigurationWorkflow,
  writeConfigurationWorkflow,
} from './env-manager/configurationNotice';

// ========== 类型 ==========

export type BroadcastFormat = 'text' | 'html' | 'markdown';
export type BroadcastLevel = 'info' | 'warn' | 'error';

export interface BroadcastModalData {
  title?: string;
  content: string;
  format?: BroadcastFormat;
  level?: BroadcastLevel;
  issueIds?: string[];
  issues?: ConfigurationNoticeIssue[];
}

interface BroadcastModalContextProps {
  showBroadcastModal: (data: BroadcastModalData) => void;
}

const BroadcastModalContext = createContext<BroadcastModalContextProps>({
  showBroadcastModal: () => {},
});

export const useBroadcastModal = () => use(BroadcastModalContext);

// ========== Provider ==========

export const BroadcastModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<(BroadcastModalData & { open: boolean }) | null>(null);

  const showBroadcastModal = useCallback((data: BroadcastModalData) => {
    setModal({ ...data, open: true });
  }, []);

  const handleClose = useCallback(() => {
    setModal(null);
  }, []);

  return (
    <BroadcastModalContext.Provider value={{ showBroadcastModal }}>
      {children}
      {modal?.open && (
        <BroadcastModalView
          title={modal.title}
          content={modal.content}
          format={modal.format}
          level={modal.level}
          issueIds={modal.issueIds}
          issues={modal.issues}
          onClose={handleClose}
        />
      )}
    </BroadcastModalContext.Provider>
  );
};

// ========== 弹窗视图 ==========

interface BroadcastModalViewProps {
  title?: string;
  content: string;
  format?: BroadcastFormat;
  level?: BroadcastLevel;
  issueIds?: string[];
  issues?: ConfigurationNoticeIssue[];
  onClose: () => void;
}

const LEVEL_CONFIG = {
  info: {
    icon: <FaInfoCircle className="w-6 h-6 text-blue-500" />,
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    btn: 'bg-blue-500 hover:bg-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  warn: {
    icon: <FaExclamationTriangle className="w-6 h-6 text-amber-500" />,
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    btn: 'bg-amber-500 hover:bg-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  error: {
    icon: <FaExclamationTriangle className="w-6 h-6 text-red-500" />,
    border: 'border-red-200',
    bg: 'bg-red-50',
    btn: 'bg-red-500 hover:bg-red-600',
    badge: 'bg-red-100 text-red-700',
  },
};

function BroadcastModalView({ title, content, format = 'text', level = 'info', issues = [], onClose }: BroadcastModalViewProps) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.info;
  const navigate = useNavigate();
  const isConfigurationNotice = title === '服务配置待完善' && issues.length > 0;
  const [ignoredIds, setIgnoredIds] = useState<string[]>(() => readConfigurationWorkflow()?.ignoredIds || []);
  const activeIssues = issues.filter((issue) => !ignoredIds.includes(issue.id));

  const handleConfigureIssue = useCallback((issue: ConfigurationNoticeIssue) => {
    const workflow: ConfigurationNoticeWorkflow = {
      issues,
      ignoredIds,
    };
    writeConfigurationWorkflow(workflow);
    onClose();
    navigate(`/admin/env?configIssue=${encodeURIComponent(issue.id)}`);
  }, [ignoredIds, issues, navigate, onClose]);

  const handleIgnoreIssue = useCallback((issueId: string) => {
    const nextIgnoredIds = Array.from(new Set([...ignoredIds, issueId]));
    setIgnoredIds(nextIgnoredIds);
    writeConfigurationWorkflow({ issues, ignoredIds: nextIgnoredIds });
  }, [ignoredIds, issues]);

  const renderedHtml = useMemo(() => {
    if (format === 'html') {
      return DOMPurify.sanitize(content, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
          'span', 'div', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'width', 'height'],
      });
    }
    return '';
  }, [content, format]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`bg-white rounded-2xl shadow-2xl border ${cfg.border} w-full max-w-lg mx-4 overflow-hidden max-h-[90vh]`}
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 30 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
        >
          {/* 顶部横幅 */}
          <div className={`${cfg.bg} px-5 py-3 flex items-center justify-between border-b ${cfg.border}`}>
            <div className="flex items-center gap-2.5">
              <FaBullhorn className="w-4 h-4 text-gray-500" />
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {level === 'error' ? '紧急通知' : level === 'warn' ? '重要提醒' : '系统通知'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-black/10 transition"
              aria-label="关闭"
            >
              <FaTimes className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="px-6 py-5">
            {/* 图标 + 标题 */}
            <div className="flex items-center gap-3 mb-4">
              {cfg.icon}
              <h2 className="text-lg font-semibold text-gray-800">
                {title || '管理员通知'}
              </h2>
            </div>

            {isConfigurationNotice ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>待处理配置</span>
                  <span>{activeIssues.length} / {issues.length}</span>
                </div>
                {activeIssues.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <FaExclamationTriangle className="mt-0.5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-800">{activeIssues[0].label}</div>
                        <div className="mt-1 break-words font-mono text-xs text-gray-600">
                          {activeIssues[0].settingNames.join(' / ')}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-gray-700">{activeIssues[0].impact}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleIgnoreIssue(activeIssues[0].id)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:bg-white"
                      >
                        忽略此项
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfigureIssue(activeIssues[0])}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
                      >
                        <FaCheckCircle />
                        前往配置
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    <FaCheckCircle />
                    已忽略当前列表中的配置项。
                  </div>
                )}
              </div>
            ) : null}

            {/* 正文 */}
            {!isConfigurationNotice && (
            <div className="max-h-[50vh] overflow-y-auto">
              {format === 'text' && (
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
              )}
              {format === 'markdown' && (
                <MarkdownRenderer content={content} density="compact" />
              )}
              {format === 'html' && (
                <div
                  className="prose prose-sm max-w-none text-gray-700"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              )}
            </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="px-6 pb-5 flex justify-center">
            <motion.button
              onClick={onClose}
              className={`px-8 py-2.5 rounded-lg text-white font-medium transition ${cfg.btn}`}
              whileTap={{ scale: 0.96 }}
            >
              {isConfigurationNotice && activeIssues.length > 0 ? '稍后处理' : '知道了'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
