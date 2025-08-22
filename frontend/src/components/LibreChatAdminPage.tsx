import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listUsers, getUserHistory, deleteUser, batchDeleteUsers, deleteAllUsers, AdminUserSummary, AdminUserHistoryItem } from '../api/librechatAdmin';
import { useNotification } from './Notification';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import {
  FaUsers,
  FaSearch,
  FaEye,
  FaTrash,
  FaChevronLeft,
  FaChevronRight,
  FaHistory,
  FaUser,
  FaComments,
  FaClock,
  FaEnvelope,
  FaCode,
  FaEyeSlash,
  FaCopy
} from 'react-icons/fa';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsLang from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import mermaid from 'mermaid';

SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);

const PAGE_SIZES = [10, 20, 50];

const formatTs = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : '';

// Markdown渲染组件
const MarkdownRenderer: React.FC<{ content: string; className?: string; onCopy?: (success: boolean) => void }> = ({ content, className = '', onCopy }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mermaid 初始化（轻量版，不自动修复）
  const initializeMermaid = () => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
        maxTextSize: 50000,
        logLevel: 0,
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
      });
    } catch {}
  };

  // 静默 Mermaid 相关告警/错误日志（确保早于渲染useEffect执行）
  useEffect(() => {
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = (...args: any[]) => {
      const msg = args.join(' ');
      if (
        msg.includes('mermaid') || msg.includes('Mermaid') ||
        msg.includes('No theme found for error') ||
        msg.includes('Graph at first') || msg.includes('Extract') ||
        msg.includes('dagre') || msg.includes('WARN :')
      ) return;
      originalWarn.apply(console, args as any);
    };
    console.error = (...args: any[]) => {
      const msg = args.join(' ');
      if (
        msg.includes('Error parsing') ||
        msg.includes('Parse error on line') ||
        msg.includes('Error executing queue') ||
        msg.includes('Syntax error in text')
      ) return;
      originalError.apply(console, args as any);
    };
    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);
  const [isRendered, setIsRendered] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // 渲染后查找 Mermaid 代码并渲染（失败显示复制按钮）
  useEffect(() => {
    if (showRaw) return;
    const root = containerRef.current;
    if (!root) return;

    const codeBlocks = root.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid, code.language-mermaid');
    if (codeBlocks.length === 0) return;

    initializeMermaid();

    codeBlocks.forEach(async (codeEl, idx) => {
      const parentPre = codeEl.closest('pre');
      const raw = codeEl.textContent || '';
      // 仅修复 Mermaid 断行箭头：将行首 "-->" 合并到上一行，避免解析错误
              const normalizedRaw = raw.replace(/\n\s*--[!>]*>/g, ' -->');
      const id = `admin-mermaid-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const { svg } = await mermaid.render(id, normalizedRaw);
        if (!svg || !svg.includes('<svg')) throw new Error('Empty SVG');

        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram my-2';
        wrapper.setAttribute('data-mermaid-id', id);
        const img = document.createElement('img');
        img.alt = 'mermaid diagram';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        wrapper.appendChild(img);

        if (parentPre && parentPre.parentNode) parentPre.parentNode.replaceChild(wrapper, parentPre);
        else if (codeEl.parentNode) codeEl.parentNode.replaceChild(wrapper, codeEl);
      } catch (err) {
        const fallback = document.createElement('div');
        fallback.className = 'bg-yellow-50 border border-yellow-200 rounded p-3 text-xs';
        const btn = document.createElement('button');
        btn.className = 'px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 mb-2';
        btn.textContent = '复制可渲染代码';
        btn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(raw);
            btn.textContent = '已复制';
            setTimeout(() => (btn.textContent = '复制可渲染代码'), 1200);
          } catch {}
        };
        const pre = document.createElement('pre');
        pre.className = 'bg-white border border-gray-200 rounded p-2 overflow-x-auto';
        pre.textContent = raw;
        fallback.appendChild(btn);
        fallback.appendChild(pre);
        if (parentPre && parentPre.parentNode) parentPre.parentNode.replaceChild(fallback, parentPre);
        else if (codeEl.parentNode) codeEl.parentNode.replaceChild(fallback, codeEl);
      }
    });
    }, [content, showRaw]);
  
  // 静默 Mermaid 相关告警/错误日志（仅本组件作用域）
  useEffect(() => {
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = (...args: any[]) => {
      const msg = args.join(' ');
      if (
        msg.includes('mermaid') || msg.includes('Mermaid') ||
        msg.includes('No theme found for error') ||
        msg.includes('Graph at first') || msg.includes('Extract') ||
        msg.includes('dagre') || msg.includes('WARN :')
      ) return;
      originalWarn.apply(console, args as any);
    };
    console.error = (...args: any[]) => {
      const msg = args.join(' ');
      if (
        msg.includes('Error parsing') ||
        msg.includes('Parse error on line') ||
        msg.includes('Error executing queue') ||
        msg.includes('Syntax error in text')
      ) return;
      originalError.apply(console, args as any);
    };
    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);
  
  const renderMarkdown = (text: string) => {
    try {
      // 配置marked选项
      marked.setOptions({
        breaks: true,
        gfm: true
      });

      // 预处理文本，防止 KaTeX 解析错误
      let processedText = text || '';
      
      // 保护数学公式，避免被误处理
      const mathBlocks: string[] = [];
      
      // 先保护块级数学公式
      processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        // 检查内容是否看起来像真正的数学公式
        const trimmedContent = content.trim();
        if (trimmedContent.length > 0 && 
            !content.includes('replace(') && 
            !content.includes('\\n{3,}') &&
            !content.includes('\\n') &&
            !/[\u4e00-\u9fff]/.test(content) && // 不包含中文字符
            !content.includes('\\\\') && // 不包含转义字符
            /^[a-zA-Z0-9\s+\-*/()\[\]{}=.,;:!@#$%^&|<>~`'"_\\]+$/.test(trimmedContent)) { // 只包含数学符号
          mathBlocks.push(match);
          return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
        }
        return match; // 如果不是真正的数学公式，保持原样
      });
      
      // 再保护行内数学公式
      processedText = processedText.replace(/\$([^$\n]*?)\$/g, (match, content) => {
        // 检查内容是否看起来像真正的数学公式
        const trimmedContent = content.trim();
        if (trimmedContent.length > 0 && 
            !content.includes('replace(') && 
            !content.includes('\\n{3,}') &&
            !content.includes('\\n') &&
            !/[\u4e00-\u9fff]/.test(content) && // 不包含中文字符
            !content.includes('\\\\') && // 不包含转义字符
            /^[a-zA-Z0-9\s+\-*/()\[\]{}=.,;:!@#$%^&|<>~`'"_\\]+$/.test(trimmedContent)) { // 只包含数学符号
          mathBlocks.push(match);
          return `__MATH_INLINE_${mathBlocks.length - 1}__`;
        }
        return match; // 如果不是真正的数学公式，保持原样
      });
      
      // 处理数学公式内容
      mathBlocks.forEach((block, index) => {
        let processedBlock = block;
        
        if (block.startsWith('$$') && block.endsWith('$$')) {
          // 块级数学公式
          const content = block.slice(2, -2);
          let processedContent = content;
          
          // 1. 处理换行符
          processedContent = processedContent.replace(/\n/g, '\\\\');
          
          // 2. 处理中文字符
          if (/[\u4e00-\u9fff]/.test(processedContent)) {
            processedContent = processedContent.replace(/([\u4e00-\u9fff]+)/g, '\\text{$1}');
          }
          
          processedBlock = `$$${processedContent}$$`;
        } else if (block.startsWith('$') && block.endsWith('$')) {
          // 行内数学公式
          const content = block.slice(1, -1);
          let processedContent = content;
          
          // 1. 处理换行符
          processedContent = processedContent.replace(/\n/g, '\\\\');
          
          // 2. 处理中文字符
          if (/[\u4e00-\u9fff]/.test(processedContent)) {
            processedContent = processedContent.replace(/([\u4e00-\u9fff]+)/g, '\\text{$1}');
          }
          
          processedBlock = `$${processedContent}$`;
        }
        
        // 替换回处理后的数学公式
        processedText = processedText.replace(`__MATH_BLOCK_${index}__`, processedBlock);
        processedText = processedText.replace(`__MATH_INLINE_${index}__`, processedBlock);
      });

      // 渲染markdown
      const html = marked.parse(processedText) as string;
      
      // 使用DOMPurify清理HTML
      const cleanHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'del', 's',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li',
          'blockquote', 'pre', 'code',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class', 'id'],
        ALLOW_DATA_ATTR: false
      });

      return cleanHtml;
    } catch (error) {
      console.error('Markdown渲染失败:', error);
      return DOMPurify.sanitize(content.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
  };

  // 处理代码块高亮的函数
  const processCodeBlocks = (htmlContent: string): React.ReactNode[] => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    let currentIndex = 0;
    
    // 将HTML字符串转换为React节点数组
    const walkNodes = (node: Node): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        
        if (child.nodeType === Node.ELEMENT_NODE) {
          const element = child as Element;
          
          if (element.tagName === 'PRE' && element.querySelector('code')) {
            // 这是一个代码块，使用 SyntaxHighlighter
            const codeElement = element.querySelector('code');
            if (codeElement) {
              const code = codeElement.textContent || '';
              const className = codeElement.className || '';
              const langMatch = className.match(/language-(\w+)/);
              const language = langMatch ? langMatch[1] : 'javascript';
              
              nodes.push(
                <div key={`code-wrapper-${currentIndex++}`} className="relative group">
                  <SyntaxHighlighter
                    language={language}
                    style={vscDarkPlus}
                    wrapLongLines
                    customStyle={{ 
                      background: '#1e1e1e', 
                      borderRadius: '0.5rem', 
                      margin: '0.5rem 0',
                      fontSize: '0.875rem'
                    }}
                  >
                    {code}
                  </SyntaxHighlighter>
                  <button
                    className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-all duration-200 touch-manipulation flex items-center justify-center min-w-[32px] min-h-[32px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(code);
                        onCopy?.(true);
                      } catch (err) {
                        onCopy?.(false);
                      }
                    }}
                    title="复制代码"
                    onTouchStart={(e) => {
                      // 在移动端触摸时显示按钮
                      e.currentTarget.style.opacity = '1';
                    }}
                    onTouchEnd={(e) => {
                      // 触摸结束后延迟隐藏按钮
                      setTimeout(() => {
                        e.currentTarget.style.opacity = '0';
                      }, 2000);
                    }}
                  >
                    <FaCopy className="w-3 h-3" />
                  </button>
                </div>
              );
            }
          } else {
            // 普通元素，递归处理
            const childNodes = walkNodes(child);
            if (childNodes.length > 0) {
              // 处理属性，确保 style 属性是对象而不是字符串
              const attributes: Record<string, any> = {
                key: `element-${currentIndex++}`,
                className: element.className
              };
              
              Array.from(element.attributes).forEach(attr => {
                if (attr.name === 'style') {
                  // 将 style 字符串转换为对象
                  try {
                    const styleObj: Record<string, string> = {};
                    attr.value.split(';').forEach(rule => {
                      const [property, value] = rule.split(':').map(s => s.trim());
                      if (property && value) {
                        // 转换 CSS 属性名为 camelCase
                        const camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                        styleObj[camelProperty] = value;
                      }
                    });
                    attributes.style = styleObj;
                  } catch (e) {
                    // 如果解析失败，忽略 style 属性
                    console.warn('Failed to parse style attribute:', attr.value);
                  }
                } else if (attr.name === 'class') {
                  // 将 class 属性转换为 className
                  attributes.className = attr.value;
                } else if (attr.name !== 'key' && attr.name !== 'className') {
                  // 避免重复设置已处理的属性
                  attributes[attr.name] = attr.value;
                }
              });
              
              const ReactElement = React.createElement(
                element.tagName.toLowerCase(),
                attributes,
                ...childNodes
              );
              nodes.push(ReactElement);
            }
          }
        } else if (child.nodeType === Node.TEXT_NODE) {
          // 文本节点
          const text = child.textContent;
          if (text && text.trim()) {
            nodes.push(text);
          }
        }
      }
      
      return nodes;
    };
    
    return walkNodes(tempDiv);
  };

  // 检测是否包含markdown语法
  const hasMarkdown = /[#*`\[\]()>|~=]/.test(content) || 
                     /^[-*+]\s/.test(content) || 
                     /^\d+\.\s/.test(content) ||
                     /```[\s\S]*```/.test(content) ||
                     /`[^`]+`/.test(content);

  if (!hasMarkdown) {
    return (
      <div className={`whitespace-pre-wrap break-words text-sm ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 切换按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaCode className="text-xs text-gray-500" />
          <span className="text-xs text-gray-500">Markdown</span>
        </div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          title={showRaw ? '显示渲染结果' : '显示原始文本'}
        >
          {showRaw ? <FaEye className="text-xs" /> : <FaEyeSlash className="text-xs" />}
          {showRaw ? '渲染' : '原始'}
        </button>
      </div>

      {/* 内容显示 */}
      <div className={`${className} ${showRaw ? 'bg-gray-100' : 'bg-gray-50'}`}>
        {showRaw ? (
          <pre className="whitespace-pre-wrap break-words text-sm p-3 rounded border overflow-x-auto">
            {content}
          </pre>
        ) : (
          <div 
            className="prose prose-sm max-w-none p-3 rounded border overflow-x-auto prose-headings:text-gray-800 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-800 prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-gray-500 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>h1]:text-xl [&>h1]:font-bold [&>h1]:mb-3 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:mb-2 [&>h3]:text-base [&>h3]:font-medium [&>h3]:mb-2 [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>li]:mb-1 [&>code]:font-mono [&>blockquote]:border-l-4 [&>blockquote]:border-gray-300 [&>blockquote]:pl-4 [&>blockquote]:italic [&>a]:text-blue-600 [&>a]:underline [&>a]:hover:text-blue-800"
            ref={containerRef}
          >
            {processCodeBlocks(renderMarkdown(content))}
          </div>
        )}
      </div>
    </div>
  );
};

const LibreChatAdminPage: React.FC = () => {
  const { setNotification } = useNotification();
  
  // Users list state
  const [kw, setKw] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);
  // 是否显示已删除用户
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Selected user details
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [hPage, setHPage] = useState(1);
  const [hLimit, setHLimit] = useState(20);
  const [history, setHistory] = useState<AdminUserHistoryItem[]>([]);
  const [hTotal, setHTotal] = useState(0);
  const [hLoading, setHLoading] = useState(false);

  // 批量操作状态
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  // 操作中（禁用关键按钮）
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async (toPage = page, showTip = false) => {
    setLoading(true);
    try {
      const res = await listUsers({ kw, page: toPage, limit, includeDeleted });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setPage(toPage);
      if (showTip) setNotification({ type: 'success', message: `已获取 ${res.users?.length || 0} 个用户` });
    } catch (e: any) {
      console.error('加载用户列表失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '加载用户列表失败' });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (userId: string, toPage = 1, showTip = false) => {
    setHLoading(true);
    try {
      const res = await getUserHistory(userId, { page: toPage, limit: hLimit });
      setHistory(res.messages || []);
      setHTotal(res.total || 0);
      setHPage(toPage);
      if (showTip) setNotification({ type: 'success', message: `已获取 ${res.messages?.length || 0} 条历史记录` });
    } catch (e: any) {
      console.error('加载用户历史失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '加载用户历史失败' });
    } finally {
      setHLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, includeDeleted]);

  // 同步全选状态
  useEffect(() => {
    if (users.length > 0 && selectedUserIds.length === users.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedUserIds, users.length]);

  const onSearch = () => fetchUsers(1, true);

  const onSelectUser = (u: AdminUserSummary) => {
    setSelectedUser(u);
    setHPage(1);
    fetchHistory(u.userId, 1, true);
  };

  const onDeleteUser = async (u: AdminUserSummary) => {
    const yes = confirm(`确定删除用户 ${u.userId} 的全部聊天历史吗？该操作不可恢复。`);
    if (!yes) return;
    try {
      setActionLoading(true);
      await deleteUser(u.userId);
      // 如果在右侧被选中，清空
      if (selectedUser?.userId === u.userId) {
        setSelectedUser(null);
        setHistory([]);
        setHTotal(0);
      }
      await fetchUsers(page);
      setNotification({ type: 'success', message: '删除成功' });
    } catch (e: any) {
      console.error('删除用户历史失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除失败' });
    } finally {
      setActionLoading(false);
    }
  };

  const hTotalPages = useMemo(() => Math.max(1, Math.ceil(hTotal / hLimit)), [hTotal, hLimit]);

  // 批量操作功能
  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedUserIds([]);
      setSelectAll(false);
    } else {
      setSelectedUserIds(users.map(u => u.userId));
      setSelectAll(true);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedUserIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择要删除的用户' });
      return;
    }
    const yes = confirm(`确定删除选中的 ${selectedUserIds.length} 个用户的全部聊天历史吗？该操作不可恢复。`);
    if (!yes) return;
    try {
      setActionLoading(true);
      const res = await batchDeleteUsers(selectedUserIds);
      setSelectedUserIds([]);
      setSelectAll(false);
      // 如果当前选中的用户被删除，清空右侧详情
      if (selectedUser && selectedUserIds.includes(selectedUser.userId)) {
        setSelectedUser(null);
        setHistory([]);
        setHTotal(0);
      }
      await fetchUsers(page);
      setNotification({ type: 'success', message: res.message || `已删除 ${res.deleted} 个用户历史` });
    } catch (e: any) {
      console.error('批量删除失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '批量删除失败' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    const yes = confirm('确定删除所有用户的聊天历史吗？这是一个危险操作，不可恢复！');
    if (!yes) return;
    const confirmAgain = confirm('再次确认：这将删除所有用户的聊天历史（无需选择任何用户）。确定继续吗？');
    if (!confirmAgain) return;
    try {
      setActionLoading(true);
      const res = await deleteAllUsers();
      setSelectedUserIds([]);
      setSelectAll(false);
      setSelectedUser(null);
      setHistory([]);
      setHTotal(0);
      await fetchUsers(1);
      setNotification({ type: 'success', message: res.message || '已删除全部历史' });
    } catch (e: any) {
      console.error('删除所有用户失败', e);
      setNotification({ type: 'error', message: e?.response?.data?.error || e?.message || '删除所有用户失败' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          <FaEnvelope className="text-blue-500" />
          LibreChat 管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理 LibreChat 用户聊天历史，包括查看、搜索和删除用户对话记录。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>查看所有 LibreChat 用户列表</li>
                <li>搜索特定用户</li>
                <li>查看用户聊天历史</li>
                <li>删除用户全部聊天记录</li>
                <li>响应式设计，支持移动端</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Users list */}
        <motion.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 危险操作提示 */}
          <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            危险操作提示：点击 “删除全部” 将清空所有用户的聊天历史（无需选择）。
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaUsers className="text-lg text-blue-500" />
              用户列表
            </h3>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">共 {total} 条</div>
              <motion.button
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 border rounded text-sm transition"
                onClick={() => { fetchUsers(page, true); setNotification({ type: 'info', message: '已刷新列表' }); }}
                disabled={loading || actionLoading}
                whileTap={{ scale: 0.95 }}
              >
                刷新
              </motion.button>
              {users.length > 0 && (
                <motion.button
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition flex items-center gap-1"
                  onClick={async () => {
                    try {
                      const allUserIds = users.map(u => u.userId).join('\n');
                      await navigator.clipboard.writeText(allUserIds);
                      setNotification({ type: 'success', message: `已复制当前页面 ${users.length} 个用户ID` });
                    } catch (err) {
                      setNotification({ type: 'error', message: '复制失败' });
                    }
                  }}
                  disabled={actionLoading}
                  whileTap={{ scale: 0.95 }}
                  title="复制当前页面所有用户ID"
                >
                  <FaCopy className="text-xs" />
                  复制全部
                </motion.button>
              )}
              {selectedUserIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-blue-600">已选择 {selectedUserIds.length} 个用户</span>
                  <motion.button
                    className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                    onClick={handleBatchDelete}
                    disabled={actionLoading}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaTrash className="text-xs" />
                    批量删除
                  </motion.button>
                </div>
              )}
            </div>
          </div>

          {/* 搜索和分页控制 */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="relative">
                  <input
                    className="w-full px-4 py-2 pl-10 pr-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="搜索 userId (支持模糊)"
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
                    onBlur={() => kw.trim() && onSearch()}
                  />
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  {kw && (
                    <button
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(kw);
                          setNotification({ type: 'success', message: '搜索关键词已复制' });
                        } catch (err) {
                          setNotification({ type: 'error', message: '复制失败' });
                        }
                      }}
                      title="复制搜索关键词"
                    >
                      <FaCopy className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <motion.button
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2"
                onClick={onSearch}
                disabled={loading || actionLoading}
                whileTap={{ scale: 0.95 }}
              >
                {loading ? '搜索中...' : '搜索'}
              </motion.button>
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                  disabled={loading || actionLoading}
                />
                显示已删除
              </label>
              <motion.button
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-2"
                onClick={handleDeleteAll}
                disabled={loading || actionLoading}
                title="删除所有用户历史（无需选择）"
                whileTap={{ scale: 0.95 }}
              >
                <FaTrash className="text-xs" />
                {actionLoading ? '处理中...' : '删除全部'}
                <span className="text-[10px] opacity-80">(无需选择)</span>
              </motion.button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">每页</span>
                <select
                  className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={limit}
                  onChange={(e) => { setLimit(parseInt(e.target.value)); setNotification({ type: 'info', message: `每页 ${e.target.value} 条` }); }}
                  disabled={loading || actionLoading}
                >
                  {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                </select>
              </div>
              <div className="text-sm text-gray-500">
                第 {page}/{totalPages} 页
              </div>
            </div>
          </div>

          {/* 用户列表 */}
          {loading ? (
            <UnifiedLoadingSpinner 
              size="md" 
              text="正在加载用户列表..." 
              className="py-8"
            />
          ) : (
            <div className="space-y-3">
              {users.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FaUsers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  暂无用户数据
                </div>
              ) : (
                <>
                  {/* 全选和批量删除 */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={selectAll}
                          onChange={toggleSelectAll}
                          disabled={actionLoading}
                        />
                        <span className="text-sm font-medium text-gray-700">全选</span>
                      </label>
                      {selectedUserIds.length > 0 && (
                        <span className="text-sm text-blue-600">已选择 {selectedUserIds.length} 个用户</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <motion.button
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition flex items-center gap-1"
                        onClick={async () => {
                          try {
                            const userIdsText = selectedUserIds.join('\n');
                            await navigator.clipboard.writeText(userIdsText);
                            setNotification({ type: 'success', message: `已复制 ${selectedUserIds.length} 个用户ID` });
                          } catch (err) {
                            setNotification({ type: 'error', message: '复制失败' });
                          }
                        }}
                        disabled={selectedUserIds.length === 0 || actionLoading}
                        whileTap={{ scale: 0.95 }}
                        title="复制选中的用户ID列表"
                      >
                        <FaCopy className="text-xs" />
                        复制ID
                      </motion.button>
                      <motion.button
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                        onClick={handleBatchDelete}
                        disabled={selectedUserIds.length === 0 || actionLoading}
                        whileTap={{ scale: 0.95 }}
                      >
                        <FaTrash className="text-xs" />
                        批量删除
                      </motion.button>
                    </div>
                  </div>
                  {users.map((u, idx) => (
                    <motion.div
                      key={u.userId}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 * idx }}
                      whileHover={{ backgroundColor: '#f0f9ff' }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={selectedUserIds.includes(u.userId)}
                            onChange={() => toggleSelectUser(u.userId)}
                            disabled={actionLoading}
                          />
                          <div className="flex-1 min-w-0 max-w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <FaUser className="text-blue-500 flex-shrink-0" />
                              <span className="font-medium text-gray-800 truncate max-w-32" title={u.userId}>
                                {u.userId.length > 24 ? `${u.userId.slice(0, 20)}...${u.userId.slice(-4)}` : u.userId}
                              </span>
                              <button
                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(u.userId);
                                    setNotification({ type: 'success', message: '用户ID已复制' });
                                  } catch (err) {
                                    setNotification({ type: 'error', message: '复制失败' });
                                  }
                                }}
                                title="复制用户ID"
                              >
                                <FaCopy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <FaComments className="text-green-500" />
                                <span>{u.total} 条消息</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <FaClock className="text-orange-500" />
                                <span>{formatTs(u.updatedAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <motion.button
                            className="px-3 py-1 bg-sky-500 text-white rounded text-sm hover:bg-sky-600 transition flex items-center gap-1"
                            onClick={() => onSelectUser(u)}
                            disabled={actionLoading}
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaEye className="text-xs" />
                            查看
                          </motion.button>
                          <motion.button
                            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition flex items-center gap-1"
                            onClick={() => onDeleteUser(u)}
                            disabled={actionLoading}
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaTrash className="text-xs" />
                            删除
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 分页控制 */}
          {users.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={page <= 1 || actionLoading}
                onClick={async () => { await fetchUsers(page - 1); setNotification({ type: 'info', message: `已切换到第 ${page - 1} 页` }); }}
                whileTap={{ scale: 0.95 }}
              >
                <FaChevronLeft className="text-xs" />
                上一页
              </motion.button>
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={page >= totalPages || actionLoading}
                onClick={async () => { await fetchUsers(page + 1); setNotification({ type: 'info', message: `已切换到第 ${page + 1} 页` }); }}
                whileTap={{ scale: 0.95 }}
              >
                下一页
                <FaChevronRight className="text-xs" />
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* Right: Selected user's history */}
        <motion.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FaHistory className="text-lg text-blue-500" />
              用户历史
            </h3>
            {history.length > 0 && (
              <motion.button
                className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition flex items-center gap-1"
                onClick={async () => {
                  try {
                    const allMessages = history.map(m => 
                      `[${m.role === 'user' ? '用户' : '助手'}] ${formatTs(m.timestamp)}\n${m.message}\n`
                    ).join('\n---\n\n');
                    await navigator.clipboard.writeText(allMessages);
                    setNotification({ type: 'success', message: `已复制 ${history.length} 条消息内容` });
                  } catch (err) {
                    setNotification({ type: 'error', message: '复制失败' });
                  }
                }}
                disabled={actionLoading}
                whileTap={{ scale: 0.95 }}
                title="复制所有消息内容"
              >
                <FaCopy className="text-xs" />
                复制全部
              </motion.button>
            )}
            {selectedUser && (
              <div className="flex items-center gap-2 text-sm text-gray-500 truncate max-w-48">
                <span title={selectedUser.userId}>
                  {selectedUser.userId.length > 24 ? `${selectedUser.userId.slice(0, 20)}...${selectedUser.userId.slice(-4)}` : selectedUser.userId} · 共 {hTotal} 条
                </span>
                <button
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedUser.userId);
                      setNotification({ type: 'success', message: '用户ID已复制' });
                    } catch (err) {
                      setNotification({ type: 'error', message: '复制失败' });
                    }
                  }}
                  title="复制用户ID"
                >
                  <FaCopy className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {!selectedUser ? (
            <div className="text-center py-12 text-gray-500">
              <FaHistory className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>请选择左侧用户以查看详情</p>
            </div>
          ) : (
            <>
              {/* 分页控制 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">每页</span>
                  <select
                    className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={hLimit}
                    onChange={(e) => { setHLimit(parseInt(e.target.value)); fetchHistory(selectedUser.userId, 1, true); }}
                    disabled={actionLoading}
                  >
                    {PAGE_SIZES.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                  </select>
                </div>
                <div className="text-sm text-gray-500">
                  第 {hPage}/{hTotalPages} 页
                </div>
              </div>

              {/* 历史记录列表 */}
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {hLoading ? (
                  <UnifiedLoadingSpinner 
                    size="sm" 
                    text="正在加载历史记录..." 
                    className="py-4"
                  />
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FaComments className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    暂无消息
                  </div>
                ) : (
                  history.map((m, idx) => (
                    <motion.div
                      key={m.id}
                      className="p-4 border border-gray-200 rounded-lg"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * idx }}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-full">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                            m.role === 'user' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {m.role === 'user' ? '用户' : '助手'}
                          </span>
                          <span className="truncate max-w-32">{formatTs(m.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <span className="font-mono text-[10px] text-gray-400 truncate max-w-28" title={m.id}>
                            {m.id.length > 16 ? `${m.id.slice(0, 12)}...${m.id.slice(-4)}` : m.id}
                          </span>
                          <button
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(m.id);
                                setNotification({ type: 'success', message: '消息ID已复制' });
                              } catch (err) {
                                setNotification({ type: 'error', message: '复制失败' });
                              }
                            }}
                            title="复制消息ID"
                          >
                            <FaCopy className="w-2 h-2" />
                          </button>
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto overflow-x-hidden relative group">
                        <MarkdownRenderer 
                          content={m.message} 
                          className="bg-gray-50 p-3 rounded border"
                          onCopy={(success) => {
                            if (success) {
                              setNotification({ type: 'success', message: '代码已复制' });
                            } else {
                              setNotification({ type: 'error', message: '复制失败' });
                            }
                          }}
                        />
                        <button
                          className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded opacity-0 group-hover:opacity-100 transition-all duration-200"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(m.message);
                              setNotification({ type: 'success', message: '消息内容已复制' });
                            } catch (err) {
                              setNotification({ type: 'error', message: '复制失败' });
                            }
                          }}
                          title="复制完整消息"
                        >
                          <FaCopy className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* 历史记录分页控制 */}
              {history.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <motion.button
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                    disabled={hPage <= 1 || actionLoading}
                    onClick={async () => { await fetchHistory(selectedUser.userId, hPage - 1); setNotification({ type: 'info', message: `已切换到第 ${hPage - 1} 页` }); }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaChevronLeft className="text-xs" />
                    上一页
                  </motion.button>
                  <motion.button
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                    disabled={hPage >= hTotalPages || actionLoading}
                    onClick={async () => { await fetchHistory(selectedUser.userId, hPage + 1); setNotification({ type: 'info', message: `已切换到第 ${hPage + 1} 页` }); }}
                    whileTap={{ scale: 0.95 }}
                  >
                    下一页
                    <FaChevronRight className="text-xs" />
                  </motion.button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LibreChatAdminPage;
