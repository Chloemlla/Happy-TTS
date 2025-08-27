import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTimes, 
  FaPaperPlane, 
  FaDownload, 
  FaTrash, 
  FaEdit, 
  FaCopy, 
  FaRedo,
  FaHistory,
  FaUser,
  FaRobot,
  FaExclamationTriangle,
  FaInfoCircle,
  FaEnvelope,
  FaChevronLeft,
  FaChevronRight,
  FaCode,
  FaEye,
  FaEyeSlash,
  FaExpand,
  FaCompress,
  FaQuestionCircle
} from 'react-icons/fa';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsLang from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { FaCopy as FaCopyIcon } from 'react-icons/fa';
import mermaid from 'mermaid';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstileConfig } from '../hooks/useTurnstileConfig';

SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('javascript', jsLang);

// 将英文标点符号替换为中文标点符号
function convertToChinesePunctuation(text: string): string {
  if (!text) return text;
  return text
    .replace(/\.\.\./g, '…')
    .replace(/,/g, '，')
    .replace(/!/g, '！')
    .replace(/\?/g, '？')
    .replace(/:/g, '：')
    .replace(/;/g, '；')
    .replace(/\[/g, '【')
    .replace(/\]/g, '】')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/'/g, '’')
    .replace(/\./g, '。');
}

// 兼容部分模型返回的 <think> 思考内容与孤立 </think> 标签
function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  try {
    // 保护数学公式，避免处理其中的换行符
    let processedText = text;
    
    // 临时替换数学公式，避免被后续处理影响
    const mathBlocks: string[] = [];
    processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
      mathBlocks.push(match);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });
    
    processedText = processedText.replace(/\$([^$\n]*?)\$/g, (match, content) => {
      mathBlocks.push(match);
      return `__MATH_INLINE_${mathBlocks.length - 1}__`;
    });
    
    // 处理非数学公式部分
    processedText = processedText
      // 移除完整的 <think ...>...</think> 段落（允许属性，跨行）
      .replace(/<think\b[^>]*>[\s\S]*?<\/?think>/gi, '')
      // 兜底：去掉可能残留的起止标签（含空白）
      .replace(/<\/?\s*think\b[^>]*>/gi, '')
      // 去除常见的可视化标记行（如"已深度思考"/"深度思考"/"Deep Thinking"开头的行）
      .replace(/^\s*(已深度思考|深度思考|Deep\s*Thinking)\b.*$/gmi, '')
      // 折叠多余空行（仅在非数学公式部分）
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // 恢复数学公式
    mathBlocks.forEach((block, index) => {
      processedText = processedText.replace(`__MATH_BLOCK_${index}__`, block);
      processedText = processedText.replace(`__MATH_INLINE_${index}__`, block);
    });
    
    return processedText;
  } catch {
    return text;
  }
}

// // 统一规范化 AI 输出（仅保留针对 Mermaid 的断行箭头修复）
// function normalizeAiOutput(input: string): string {
//   if (!input) return input;
//   try {
//     // 仅处理 ```mermaid 代码块：把换行起始的箭头合并到上一行，避免 "\n -->" 导致解析错误
//     return input.replace(/```\s*mermaid\s*[\r\n]+([\s\S]*?)```/gi, (m, code) => {
//       const fixed = code.replace(/\n\s*--[!>]*>/g, ' -->');
//       return '```mermaid\n' + fixed + '\n```';
//     });
//   } catch {
//     return input;
//   }
// }

// 配置 marked 支持 KaTeX
marked.use(markedKatex({ nonStandard: true }));

// 代码高亮配置 - 使用 react-syntax-highlighter
marked.setOptions({
  highlight: function(code: string, lang: string) {
    // 使用 react-syntax-highlighter 进行代码高亮
    try {
      // 这里我们将在渲染时使用 SyntaxHighlighter 组件
      // 暂时返回原始代码，让 SyntaxHighlighter 组件处理高亮
      return code;
    } catch (err) {
      console.warn('代码高亮失败:', err);
      return code;
    }
  }
} as any);

// 增强的 Markdown 渲染组件
const EnhancedMarkdownRenderer: React.FC<{ 
  content: string; 
  className?: string;
  showControls?: boolean;
  onCopy?: (content: string) => void;
  onCodeCopy?: (success: boolean) => void;
}> = ({ content, className = '', showControls = true, onCopy, onCodeCopy }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // 关闭自动修复：仅尝试按原文渲染
  const MERMAID_AUTO_FIX = false;

  // 检测是否包含markdown语法
  const hasMarkdown = useMemo(() => {
    return /[#*`\[\]()>|~=]/.test(content) || 
           /^[-*+]\s/.test(content) || 
           /^\d+\.\s/.test(content) ||
           /```[\s\S]*```/.test(content) ||
           /`[^`]+`/.test(content) ||
           /\$\$[\s\S]*\$\$/.test(content) ||
           /\$[^$]+\$/.test(content);
  }, [content]);

  // 检测具体的markdown语法类型
  const markdownFeatures = useMemo(() => {
    const features = [];
    if (/^#{1,6}\s/.test(content)) features.push('标题');
    if (/^[-*+]\s/.test(content) || /^\d+\.\s/.test(content)) features.push('列表');
    if (/```[\s\S]*```/.test(content)) features.push('代码块');
    if (/`[^`]+`/.test(content)) features.push('行内代码');
    if (/\*\*[^*]+\*\*/.test(content) || /__[^_]+__/.test(content)) features.push('粗体');
    if (/\*[^*]+\*/.test(content) || /_[^_]+_/.test(content)) features.push('斜体');
    if (/\[[^\]]+\]\([^)]+\)/.test(content)) features.push('链接');
    if (/!\[[^\]]*\]\([^)]+\)/.test(content)) features.push('图片');
    if (/^\s*>\s/.test(content)) features.push('引用');
    if (/\$\$[\s\S]*\$\$/.test(content) || /\$[^$]+\$/.test(content)) features.push('数学公式');
    if (/\|[^|]+\|[^|]+\|/.test(content)) features.push('表格');
    return features;
  }, [content]);

  const renderMarkdown = (text: string): string => {
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

      const rawHtml = marked.parse(processedText, { async: false } as any) as unknown as string;
      
      // 使用DOMPurify清理HTML，允许更多标签和属性
      return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'p', 'br', 'pre', 'code', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'del', 's', 'mark',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
          'a', 'img', 'blockquote', 'hr', 'details', 'summary', 'abbr', 'cite',
          'kbd', 'samp', 'var', 'sub', 'sup', 'small', 'big', 'time', 'data'
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'alt', 'src', 'class', 'id', 'target', 'rel', 'width', 'height',
          'data-*', 'aria-*', 'role', 'tabindex', 'download', 'hreflang',
          'type', 'value', 'name', 'placeholder', 'required', 'disabled', 'readonly',
          'maxlength', 'minlength', 'pattern', 'autocomplete', 'autofocus', 'form'
        ],
        ALLOW_DATA_ATTR: true,
        ALLOW_UNKNOWN_PROTOCOLS: true
      });
    } catch (e) {
      console.error('Markdown渲染失败:', e);
      // 回退为纯文本
      const safe = (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre class="text-red-500 bg-red-50 p-2 rounded border">${safe}</pre>`;
    }
  };

  // 处理代码块高亮的函数
  const processCodeBlocks = (htmlContent: string): React.ReactNode[] => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const codeBlocks = tempDiv.querySelectorAll('pre code');
    const result: React.ReactNode[] = [];
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
                        onCodeCopy?.(true);
                      } catch (err) {
                        onCodeCopy?.(false);
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

  // Mermaid 初始化（每次渲染前重新初始化以确保多图表支持）
  const initializeMermaid = () => {
    try {
      mermaid.initialize({ 
        startOnLoad: false, 
        securityLevel: 'loose', // 改为 loose 以允许更多内容
        theme: 'default',
        // 确保多图表支持
        maxTextSize: 50000,
        // 完全禁用日志以避免控制台污染
        logLevel: 0,
        // 添加更多配置以支持中文和特殊字符
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis'
        },
        // 自动适应页面大小的配置
        sequence: {
          useMaxWidth: true
        },
        gantt: {
          useMaxWidth: true
        },
        pie: {
          useMaxWidth: true
        },
        journey: {
          useMaxWidth: true
        },
        gitGraph: {
          useMaxWidth: true
        },
        class: {
          useMaxWidth: true
        },
        state: {
          useMaxWidth: true
        },
        er: {
          useMaxWidth: true
        },
        mindmap: {
          useMaxWidth: true
        },
        timeline: {
          useMaxWidth: true
        }
      });
    } catch (error) {
      console.warn('[Mermaid] 初始化失败:', error);
    }
  };

  // 渲染后的 Mermaid 转换
  useEffect(() => {
    if (showRaw) return; // 原始模式不渲染
    const root = containerRef.current;
    if (!root) return;

    const codeBlocks = root.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid, code.language-mermaid');
    if (codeBlocks.length === 0) return;

    // 每次渲染前重新初始化 Mermaid
    initializeMermaid();

    let cancelled = false;
    const tasks: Promise<void>[] = [];
    let globalIdx = 0;
    
    // 使用更可靠的唯一ID生成方法
    const generateUniqueId = () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      return `mermaid-${timestamp}-${random}-${globalIdx++}`;
    };
    
    codeBlocks.forEach((codeEl) => {
      const parentPre = codeEl.closest('pre');
      const raw = codeEl.textContent || '';
      // 规范化连字符：将非 ASCII 连字符（如 \u2011/‑ 等）替换为普通 '-'
      const normalizedRaw = raw.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g, '-');
      const id = generateUniqueId();
      
      // 智能清理和纠错 Mermaid 代码
      const cleanMermaidCode = (code: string): string => {
        return code
          // 移除中文注释行（以 -- 开头的中文注释）
          .replace(/^\s*--\s*[\u4e00-\u9fff][^\n]*$/gm, '')
          // 移除行内中文注释（-- 后面的中文内容）
          .replace(/\s*--\s*[\u4e00-\u9fff][^\n]*/g, '')
          // 移除包含中文的注释行
          .replace(/^\s*%%\s*[\u4e00-\u9fff][^\n]*$/gm, '')
          // 移除破折号，用空格替代
          .replace(/-/g, ' ')
          // 移除括号，保持文本内容
          .replace(/\(/g, '')
          .replace(/\)/g, '')
          .replace(/\[/g, '')
          .replace(/\]/g, '')
          .replace(/\{/g, '')
          .replace(/\}/g, '')
          // 智能纠错：将中文括号转换为英文括号
          .replace(/（/g, '')
          .replace(/）/g, '')
          .replace(/【/g, '')
          .replace(/】/g, '')
          .replace(/｛/g, '')
          .replace(/｝/g, '')
          // 智能纠错：将中文引号转换为英文引号
          .replace(/"/g, '"')
          .replace(/"/g, '"')
          .replace(/'/g, "'")
          .replace(/'/g, "'")
          // 智能纠错：将中文冒号转换为英文冒号
          .replace(/：/g, ':')
          // 智能纠错：将中文分号转换为英文分号
          .replace(/；/g, ';')
          // 智能纠错：将中文逗号转换为英文逗号
          .replace(/，/g, ',')
          // 智能纠错：将中文句号转换为英文句号
          .replace(/。/g, '.')
          // 智能纠错：将中文感叹号转换为英文感叹号
          .replace(/！/g, '!')
          // 智能纠错：将中文问号转换为英文问号
          .replace(/？/g, '?')
          // 智能纠错：将中文破折号转换为英文破折号
          .replace(/——/g, ' ')
          .replace(/—/g, ' ')
          // 智能纠错：将中文省略号转换为英文省略号
          .replace(/…/g, '...')
          // 统一将 Unicode 箭头替换为 mermaid 箭头
          .replace(/[→⇒➔➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯➱]/g, '-->')
          // 智能纠错：修复常见的语法错误
          .replace(/\s*--(>|!>)\s*\[([^\]]*)\]\s*([A-Z])\s*--(>|!>)/g, ' --> $3[$2]')
      };
      
      // 智能检查和修复 Mermaid 代码
      const isCompleteMermaid = (code: string): boolean => {
        const cleanedCode = cleanMermaidCode(code);
        if (!cleanedCode) return false;
        
        // 检查是否包含基本的 Mermaid 语法结构
        const hasGraphKeyword = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(cleanedCode);
        
        // 对于简单的图表，不要求必须有结束标记
        const isSimpleChart = /^(pie|gantt|gitgraph|mindmap|timeline)/i.test(cleanedCode);
        
        // 检查是否有基本的节点和连接
        const hasNodes = /[A-Za-z]\s*\[[^\]]*\]/i.test(cleanedCode);
        const hasConnections = /--[!>]*>/i.test(cleanedCode);
        
        // 进一步放宽检查条件：只要有图表关键字就认为可以尝试渲染
        return hasGraphKeyword;
      };
      
      // 智能修复 Mermaid 语法错误
      const fixMermaidSyntax = (code: string): string => {
        let fixedCode = code;
        
        // 修复常见的语法错误模式
        const fixes = [
          // 修复不完整的节点定义
          { pattern: /([A-Z])\s*--[!>]*>\s*([A-Z])\s*\[([^\]]*)\]\s*([A-Z])\s*--[!>]*>/g, replacement: '$1 --> $2[$3]\n$2 --> $4' },
          // 修复缺少方括号的节点
          { pattern: /([A-Z])\s*--[!>]*>\s*([A-Z])\s*([^[\n\r]*?)(?=\s*--[!>]*>\s*[A-Z]|$)/g, replacement: '$1 --> $2[$3]' },
          // 修复不完整的连接
          { pattern: /([A-Z])\s*--[!>]*>\s*$/gm, replacement: '$1 --> END' },
          // 修复缺少开始节点的连接
          { pattern: /^\s*--[!>]*>\s*([A-Z])/gm, replacement: 'START --> $1' },
          // 修复重复的连接符
          { pattern: /--(>|!>)\s*--(>|!>)/g, replacement: '-->' },
          // 修复缺少空格的情况
          { pattern: /([A-Z])\[([^\]]*)\]([A-Z])/g, replacement: '$1[$2] --> $3' },
          // 修复中文括号导致的语法错误
          { pattern: /\[([^\]]*?)（([^）]*?)）([^\]]*?)\]/g, replacement: '[$1($2)$3]' },
          { pattern: /\[([^\]]*?)（([^）]*?)\]/g, replacement: '[$1($2)]' },
          { pattern: /\[([^\]]*?)）([^\]]*?)\]/g, replacement: '[$1)$2]' },
          // 修复不完整的节点标签
          { pattern: /([A-Z])\s*--[!>]*>\s*([A-Z])\s*\[([^\]]*?)\s*$/gm, replacement: '$1 --> $2[$3]' },
          // 修复缺少结束方括号的情况
          { pattern: /([A-Z])\s*--[!>]*>\s*([A-Z])\s*\[([^\]]*?)(?=\s*--[!>]*>\s*[A-Z]|$)/g, replacement: '$1 --> $2[$3]' },
          // 修复多余的方括号
          { pattern: /\[\[([^\]]*?)\]\]/g, replacement: '[$1]' },
          // 修复不正确的连接语法
          { pattern: /([A-Z])\s*-\s*>\s*([A-Z])/g, replacement: '$1 --> $2' },
          { pattern: /([A-Z])\s*--\s*>\s*([A-Z])/g, replacement: '$1 --> $2' },
          // 将同一行的多个语句拆分为多行（在节点定义或结束方括号后，遇到新的起始节点+箭头时换行）
          { pattern: /(\]|\))\s+([A-Za-z][A-Za-z0-9_]*)\s*--[!>]*>/g, replacement: '$1\n$2 -->' },
          // 在纯节点后紧接另一个节点/连接时也换行
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s+([A-Za-z][A-Za-z0-9_]*)\s*--[!>]*>/g, replacement: '$1[$2]\n$3 -->' },
          // 修复同一行多个语句：在节点定义后遇到另一个节点时换行
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s+([A-Za-z][A-Za-z0-9_]*)(?!\s*--[!>]*>)/g, replacement: '$1[$2]\n$3' },
          // 修复同一行多个语句：在节点定义后遇到另一个节点定义时换行
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s+([A-Za-z][A-Za-z0-9_]*)\s*\[/g, replacement: '$1[$2]\n$3[' },
          // 修复节点之间缺少换行的情况：在节点定义后直接跟另一个节点
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]([A-Za-z][A-Za-z0-9_]*)/g, replacement: '$1[$2]\n$3' },
          // 修复节点之间缺少换行的情况：在节点定义后直接跟另一个节点定义
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]([A-Za-z][A-Za-z0-9_]*)\s*\[/g, replacement: '$1[$2]\n$3[' },
          // 修复边标签语法错误：将 "X -- 标签 --> Y" 转换为 "X -->|标签| Y"
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*--\s*([^>\n\r|]+?)\s*--[!>]*>\s*([A-Za-z][A-Za-z0-9_]*)/g, replacement: '$1 -->|$2| $3' },
          // 修复边标签语法错误：将 "X -- 标签 → Y" 转换为 "X -->|标签| Y"
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*--\s*([^>\n\r|]+?)\s*→\s*([A-Za-z][A-Za-z0-9_]*)/g, replacement: '$1 -->|$2| $3' },
          // 修复边标签语法错误：将 "X -- 标签 --> Y" 转换为 "X -->|标签| Y"（无空格版本）
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*--([^>\n\r|]+?)--[!>]*>\s*([A-Za-z][A-Za-z0-9_]*)/g, replacement: '$1 -->|$2| $3' },
          // 修复同一行多个语句：在节点定义后遇到边标签时换行
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s+([A-Za-z][A-Za-z0-9_]*)\s*--/g, replacement: '$1[$2]\n$3 --' },
          // 修复同一行多个语句：在节点定义后遇到连接时换行
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s+([A-Za-z][A-Za-z0-9_]*)\s*--[!>]*>/g, replacement: '$1[$2]\n$3 -->' },
          // 修复分号后的多余内容：将 "A[label]; B" 转换为 "A[label];\nB"
          { pattern: /;\s*([A-Za-z][A-Za-z0-9_]*)/g, replacement: ';\n$1' },
          // 修复分号后的连接：将 "A[label]; B -->" 转换为 "A[label];\nB -->"
          { pattern: /;\s*([A-Za-z][A-Za-z0-9_]*)\s*--[!>]*>/g, replacement: ';\n$1 -->' },
          // 修复分号后的节点定义：将 "A[label]; B[label]" 转换为 "A[label];\nB[label]"
          { pattern: /;\s*([A-Za-z][A-Za-z0-9_]*)\s*\[/g, replacement: ';\n$1[' },
          // 修复分号后的多余内容：将 "A[label]; B C" 转换为 "A[label];\nB\nC"
          { pattern: /;\s*([A-Za-z][A-Za-z0-9_]*)\s*([A-Za-z][A-Za-z0-9_]*)/g, replacement: ';\n$1\n$2' },
          // 修复节点定义和连接分离的情况：将 "A[label]\n --> B" 转换为 "A[label] --> B"
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s*\n\s*--[!>]*>/g, replacement: '$1[$2] -->' },
          // 修复节点定义和连接在同一行的情况：将 "A[label] --> B" 保持原样
          { pattern: /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]\s*--[!>]*>/g, replacement: '$1[$2] -->' },

        ];
        
        fixes.forEach(fix => {
          fixedCode = fixedCode.replace(fix.pattern, fix.replacement);
        });
        
        // 智能补全缺失的节点
        const nodeMatches = fixedCode.match(/[A-Z]\s*\[[^\]]*\]/g) || [];
        const connectionMatches = fixedCode.match(/[A-Z]\s*--[!>]*>\s*[A-Z]/g) || [];
        
        // 如果只有连接但没有节点定义，尝试补全
        if (connectionMatches.length > 0 && nodeMatches.length === 0) {
          const nodes = new Set<string>();
          connectionMatches.forEach(conn => {
            const parts = conn.match(/([A-Z])\s*--[!>]*>\s*([A-Z])/);
            if (parts) {
              nodes.add(parts[1]);
              nodes.add(parts[2]);
            }
          });
          
          // 为每个节点添加默认定义
          nodes.forEach(node => {
            if (!fixedCode.includes(`${node}[`)) {
              fixedCode = fixedCode.replace(new RegExp(`(${node})\\s*--[!>]*>`, 'g'), `$1[${node}节点] -->`);
            }
          });
        }
        
        // 最后一步：确保每行只有一个语句
        const lines = fixedCode.split('\n');
        const cleanedLines = lines.map(line => {
          // 如果一行包含多个节点定义，拆分为多行
          const nodePattern = /([A-Za-z][A-Za-z0-9_]*)\s*\[([^\]]*)\]/g;
          const matches = [...line.matchAll(nodePattern)];
          
          if (matches.length > 1) {
            // 有多个节点定义，需要拆分
            let result = '';
            let lastIndex = 0;
            
            matches.forEach((match, index) => {
              if (index > 0) {
                result += '\n';
              }
              result += line.substring(lastIndex, match.index) + match[0];
              lastIndex = match.index! + match[0].length;
            });
            
            // 添加剩余部分
            if (lastIndex < line.length) {
              result += line.substring(lastIndex);
            }
            
            return result;
          }
          
          // 处理分号后的多余内容
          if (line.includes(';')) {
            return line.replace(/;\s*([A-Za-z][A-Za-z0-9_]*)\s*([A-Za-z][A-Za-z0-9_]*)/g, ';\n$1\n$2');
          }
          
          return line;
        });
        
        fixedCode = cleanedLines.join('\n');
        
        return fixedCode;
      };
      
      // 智能清理和修复代码用于渲染
      let cleanedCode = cleanMermaidCode(normalizedRaw);
      
      // 尝试智能修复语法错误
      const fixedCode = normalizedRaw;
      
      // 当关闭自动修复时，直接按原文渲染
      if (!MERMAID_AUTO_FIX) {
        cleanedCode = normalizedRaw || '';
        console.log('[Mermaid] 自动修复已关闭，按原文渲染（已规范化连字符）');
      } else {
        // 优先尝试两个方法：1. 清理后的代码 2. 修复后的代码
        // 如果任一方法成功，则不尝试其他方法
        
        // 方法1：尝试清理后的代码
        if (isCompleteMermaid(cleanedCode)) {
          console.log('[Mermaid] 方法1成功：使用清理后的代码:', cleanedCode);
          // 保持使用 cleanedCode，不尝试其他方法
        } else {
          // 方法2：尝试修复后的代码
          if (isCompleteMermaid(fixedCode)) {
            cleanedCode = fixedCode;
            console.log('[Mermaid] 方法2成功：使用修复后的代码:', cleanedCode);
          } else {
            // 如果两个方法都失败，使用清理后的代码作为最后尝试
            console.log('[Mermaid] 两个方法都失败，使用清理后的代码作为最后尝试:', cleanedCode);
          }
        }
      }
      
      // 如果代码完全无法识别，跳过渲染
      if (!cleanedCode || !cleanedCode.trim()) {
        // 在代码块上添加提示
        const placeholder = document.createElement('div');
        placeholder.className = 'mermaid-placeholder bg-gray-100 border border-gray-300 rounded p-3 text-center text-gray-500 text-sm';
        placeholder.innerHTML = `
          <div class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>等待 Mermaid 图表完成...</span>
          </div>
        `;
        
        if (parentPre && parentPre.parentNode) {
          parentPre.parentNode.replaceChild(placeholder, parentPre);
        } else if (codeEl.parentNode) {
          codeEl.parentNode.replaceChild(placeholder, codeEl);
        }
        return;
      }
      
      // 当开启自动修复时才注入关键字与占位提示
      if (MERMAID_AUTO_FIX) {
        // 确保代码包含图表关键字，如果没有则添加
        if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(cleanedCode)) {
          cleanedCode = `graph TD\n${cleanedCode}`;
          console.log('[Mermaid] 自动添加图表关键字:', cleanedCode);
        }
        
        // 如果代码完全无法识别，跳过渲染
        if (!cleanedCode || !cleanedCode.trim()) {
          // 在代码块上添加提示
          const placeholder = document.createElement('div');
          placeholder.className = 'mermaid-placeholder bg-gray-100 border border-gray-300 rounded p-3 text-center text-gray-500 text-sm';
          placeholder.innerHTML = `
            <div class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>等待 Mermaid 图表完成...</span>
            </div>
          `;
          
          if (parentPre && parentPre.parentNode) {
            parentPre.parentNode.replaceChild(placeholder, parentPre);
          } else if (codeEl.parentNode) {
            codeEl.parentNode.replaceChild(placeholder, codeEl);
          }
          return;
        }
      }
      
              const p = (async () => {

        
        try {
                    console.log('[Mermaid] 开始渲染图表:', id, '代码长度:', cleanedCode.length);
        console.log('[Mermaid] 渲染代码:', cleanedCode.substring(0, 200) + '...');
        console.log('[Mermaid] 完整代码:', cleanedCode);
            

            
                      // 为每个图表创建独立的渲染上下文
          const { svg } = await mermaid.render(id, cleanedCode);
          if (cancelled) return;
          
          console.log('[Mermaid] 渲染结果 SVG 长度:', svg?.length || 0);
          console.log('[Mermaid] 渲染结果 SVG 前100字符:', svg?.substring(0, 100) || 'null');
          
          // 检查渲染结果是否包含特定的错误信息
          if (svg.includes('Syntax error in text') && 
              svg.includes('x="1440"') && 
              svg.includes('y="250"') && 
              svg.includes('font-size="150px"') && 
              svg.includes('text-anchor: middle')) {
            // 如果包含特定的错误信息，尝试第二个方法
            console.log('[Mermaid] 方法1失败，尝试方法2...');
            
            // 方法2：尝试使用修复后的代码
            const { svg: svg2 } = await mermaid.render(id + '_retry', fixedCode);
            if (cancelled) return;
            
            // 检查第二个方法的渲染结果
            if (svg2.includes('Syntax error in text') && 
                svg2.includes('x="1440"') && 
                svg2.includes('y="250"') && 
                svg2.includes('font-size="150px"') && 
                svg2.includes('text-anchor: middle')) {
                          // 两个方法都失败，不渲染，保持原代码块
            console.log('[Mermaid] 两个方法都失败，跳过渲染');
            return;
            }
            
            // 方法2成功，使用 svg2
            if (!svg2 || svg2.trim().length === 0 || !svg2.includes('<svg')) {
              console.log('[Mermaid] 方法2渲染结果为空或无效:', svg2);
              return;
            }
            
            // 使用方法2的成功结果
            const safeSvg = DOMPurify.sanitize(svg2, {
              ALLOWED_TAGS: [
                'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
                'defs', 'marker', 'style', 'linearGradient', 'stop', 'clipPath', 'foreignObject'
              ],
              ALLOWED_ATTR: [
                'class', 'id', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                'cx', 'cy', 'r', 'rx', 'ry', 'transform', 'preserveAspectRatio', 'markerHeight', 'markerWidth',
                'refX', 'refY', 'orient', 'offset', 'stop-color', 'stop-opacity', 'dx', 'dy', 'text-anchor',
                'font-family', 'font-size', 'height', 'width'
              ],
              ALLOW_DATA_ATTR: false
            });
            
            // 再次检查清理后的 SVG 是否包含特定的错误信息
            if (safeSvg.includes('Syntax error in text') && 
                safeSvg.includes('x="1440"') && 
                safeSvg.includes('y="250"') && 
                safeSvg.includes('font-size="150px"') && 
                safeSvg.includes('text-anchor: middle')) {
              console.log('[Mermaid] 方法2清理后的 SVG 仍包含特定错误信息，跳过渲染');
              return;
            }
            
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-diagram my-2';
            wrapper.style.overflow = 'auto';
            wrapper.style.borderRadius = '0.5rem';
            wrapper.style.maxWidth = '100%';
            wrapper.style.width = '100%';
            wrapper.style.minHeight = '200px';
            wrapper.setAttribute('contenteditable', 'false');
            wrapper.setAttribute('aria-hidden', 'false');
            wrapper.setAttribute('data-mermaid-id', id + '_retry'); // 添加唯一标识
            
            console.log('[Mermaid] 创建包装器元素（方法2）:', wrapper);
            
            // 使用 data URL 图片承载 SVG，避免直接插入 SVG 节点导致第三方监听器读取 SVGAnimatedString.className 报错
            const img = document.createElement('img');
            img.alt = 'mermaid diagram';
            img.style.maxWidth = '100%';
            img.style.width = 'auto';
            img.style.height = 'auto';
            img.style.overflow = 'visible';
            img.style.borderRadius = '0.5rem';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.setAttribute('draggable', 'false');
            img.setAttribute('aria-hidden', 'false');
            img.setAttribute('title', '点击放大查看');
            const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(safeSvg);
            img.src = dataUrl;
            
            // 添加点击放大功能
            img.addEventListener('click', () => {
              const modal = document.createElement('div');
              modal.style.position = 'fixed';
              modal.style.top = '0';
              modal.style.left = '0';
              modal.style.width = '100%';
              modal.style.height = '100%';
              modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
              modal.style.display = 'flex';
              modal.style.alignItems = 'center';
              modal.style.justifyContent = 'center';
              modal.style.zIndex = '9999';
              modal.style.cursor = 'pointer';
              
              const modalImg = document.createElement('img');
              modalImg.src = dataUrl;
              modalImg.style.maxWidth = '90%';
              modalImg.style.maxHeight = '90%';
              modalImg.style.objectFit = 'contain';
              modalImg.style.borderRadius = '8px';
              modalImg.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
              
              modal.appendChild(modalImg);
              document.body.appendChild(modal);
              
              // 点击关闭
              modal.addEventListener('click', () => {
                document.body.removeChild(modal);
              });
              
              // ESC 键关闭
              const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                  document.body.removeChild(modal);
                  document.removeEventListener('keydown', handleKeyDown);
                }
              };
              document.addEventListener('keydown', handleKeyDown);
            });
            
            wrapper.appendChild(img);
            
                      // 安全地替换元素
          console.log('[Mermaid] 准备替换元素（方法2）');
          if (parentPre && parentPre.parentNode) {
            console.log('[Mermaid] 替换 parentPre（方法2）');
            parentPre.parentNode.replaceChild(wrapper, parentPre);
          } else if (codeEl.parentNode) {
            console.log('[Mermaid] 替换 codeEl（方法2）');
            codeEl.parentNode.replaceChild(wrapper, codeEl);
          } else {
            console.log('[Mermaid] 无法找到父节点进行替换（方法2）');
          }
            
            console.log('[Mermaid] 方法2成功渲染图表:', id + '_retry');
            console.log('[Mermaid] 包装器元素已添加到DOM（方法2）:', wrapper.parentNode);
            
            // 延迟检查元素是否真的在DOM中
            setTimeout(() => {
              const checkElement = document.querySelector(`[data-mermaid-id="${id}_retry"]`);
              console.log('[Mermaid] 延迟检查元素是否存在（方法2）:', checkElement);
              if (!checkElement) {
                console.warn('[Mermaid] 元素在延迟检查中不存在，可能被清理函数删除了（方法2）');
              }
            }, 100);
            
            return; // 方法2成功，直接返回
          }
          
          // 方法1成功，继续处理
          // 检查 SVG 是否为空或无效
          if (!svg || svg.trim().length === 0 || !svg.includes('<svg')) {
            console.log('[Mermaid] 方法1渲染结果为空或无效:', svg);
            return;
          }
          
          const safeSvg = DOMPurify.sanitize(svg, {
            ALLOWED_TAGS: [
              'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
              'defs', 'marker', 'style', 'linearGradient', 'stop', 'clipPath', 'foreignObject'
            ],
            ALLOWED_ATTR: [
              'class', 'id', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
              'cx', 'cy', 'r', 'rx', 'ry', 'transform', 'preserveAspectRatio', 'markerHeight', 'markerWidth',
              'refX', 'refY', 'orient', 'offset', 'stop-color', 'stop-opacity', 'dx', 'dy', 'text-anchor',
              'font-family', 'font-size', 'height', 'width'
            ],
            ALLOW_DATA_ATTR: false
          });
          
          // 再次检查清理后的 SVG 是否包含特定的错误信息
          if (safeSvg.includes('Syntax error in text') && 
              safeSvg.includes('x="1440"') && 
              safeSvg.includes('y="250"') && 
              safeSvg.includes('font-size="150px"') && 
              safeSvg.includes('text-anchor: middle')) {
            console.log('[Mermaid] 方法1清理后的 SVG 仍包含特定错误信息，跳过渲染');
            return;
          }
          
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram my-2';
          wrapper.style.overflow = 'auto';
          wrapper.style.borderRadius = '0.5rem';
          wrapper.style.maxWidth = '100%';
          wrapper.style.width = '100%';
          wrapper.style.minHeight = '200px';
          wrapper.setAttribute('contenteditable', 'false');
          wrapper.setAttribute('aria-hidden', 'false');
          wrapper.setAttribute('data-mermaid-id', id); // 添加唯一标识
          
          console.log('[Mermaid] 创建包装器元素（方法1）:', wrapper);
          
          // 使用 data URL 图片承载 SVG，避免直接插入 SVG 节点导致第三方监听器读取 SVGAnimatedString.className 报错
          const img = document.createElement('img');
          img.alt = 'mermaid diagram';
          img.style.maxWidth = '100%';
          img.style.width = 'auto';
          img.style.height = 'auto';
          img.style.overflow = 'visible';
          img.style.borderRadius = '0.5rem';
          img.style.display = 'block';
          img.style.margin = '0 auto';
          img.setAttribute('draggable', 'false');
          img.setAttribute('aria-hidden', 'false');
          img.setAttribute('title', '点击放大查看');
          const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(safeSvg);
          img.src = dataUrl;
          
          // 添加点击放大功能
          img.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
            modal.style.cursor = 'pointer';
            
            const modalImg = document.createElement('img');
            modalImg.src = dataUrl;
            modalImg.style.maxWidth = '90%';
            modalImg.style.maxHeight = '90%';
            modalImg.style.objectFit = 'contain';
            modalImg.style.borderRadius = '8px';
            modalImg.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
            
            modal.appendChild(modalImg);
            document.body.appendChild(modal);
            
            // 点击关闭
            modal.addEventListener('click', () => {
              document.body.removeChild(modal);
            });
            
            // ESC 键关闭
            const handleKeyDown = (e: KeyboardEvent) => {
              if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeyDown);
              }
            };
            document.addEventListener('keydown', handleKeyDown);
          });
          
          wrapper.appendChild(img);
          
          // 安全地替换元素
          console.log('[Mermaid] 准备替换元素（方法1）');
          if (parentPre && parentPre.parentNode) {
            console.log('[Mermaid] 替换 parentPre（方法1）');
            parentPre.parentNode.replaceChild(wrapper, parentPre);
          } else if (codeEl.parentNode) {
            console.log('[Mermaid] 替换 codeEl（方法1）');
            codeEl.parentNode.replaceChild(wrapper, codeEl);
          } else {
            console.log('[Mermaid] 无法找到父节点进行替换（方法1）');
          }
          
          console.log('[Mermaid] 方法1成功渲染图表:', id);
          console.log('[Mermaid] 包装器元素已添加到DOM（方法1）:', wrapper.parentNode);
          
          // 延迟检查元素是否真的在DOM中
          setTimeout(() => {
            const checkElement = document.querySelector(`[data-mermaid-id="${id}"]`);
            console.log('[Mermaid] 延迟检查元素是否存在（方法1）:', checkElement);
            if (!checkElement) {
              console.warn('[Mermaid] 元素在延迟检查中不存在，可能被清理函数删除了（方法1）');
            }
          }, 100);
                          } catch (err) {
          // 渲染失败则不再继续尝试修复，提供复制按钮给用户自行渲染
          console.warn('[Mermaid] 两个方法都失败，渲染失败:', id, err);

          const fallbackDiv = document.createElement('div');
          fallbackDiv.className = 'mermaid-fallback bg-yellow-50 border border-yellow-200 rounded p-3 text-sm';

          const title = document.createElement('div');
          title.className = 'text-yellow-800 font-medium mb-2';
          title.textContent = 'Mermaid 渲染失败（已尝试两个方法）';

          const btnRow = document.createElement('div');
          btnRow.className = 'mb-2 flex items-center gap-2';

          const copyBtn = document.createElement('button');
          copyBtn.className = 'px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700';
          copyBtn.textContent = '复制原始代码';

          // 选择最可渲染的版本：优先 cleanedCode，其次 fixedCode，最后 raw
          const bestCode = (typeof cleanedCode === 'string' && cleanedCode.trim())
            ? cleanedCode
            : (typeof fixedCode === 'string' && fixedCode.trim())
              ? fixedCode
              : (typeof raw === 'string' ? raw : '');

          // 添加中文标点转换按钮
          const chineseBtn = document.createElement('button');
          chineseBtn.className = 'px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700';
          chineseBtn.textContent = '转换为中文标点';

          chineseBtn.onclick = () => {
            try {
              // 将代码中的英文标点转换为中文标点
              const chineseCode = convertToChinesePunctuation(bestCode);
              pre.textContent = chineseCode;
              chineseBtn.textContent = '已转换';
              setTimeout(() => (chineseBtn.textContent = '转换为中文标点'), 2000);
            } catch (err) {
              console.error('转换中文标点失败:', err);
              chineseBtn.textContent = '转换失败';
              setTimeout(() => (chineseBtn.textContent = '转换为中文标点'), 2000);
            }
          };

          copyBtn.onclick = async () => {
            try {
              await navigator.clipboard.writeText(bestCode);
              copyBtn.textContent = '已复制';
              setTimeout(() => (copyBtn.textContent = '复制原始代码'), 1200);
            } catch {
              // 退化方案
              const ta = document.createElement('textarea');
              ta.value = bestCode;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              copyBtn.textContent = '已复制';
              setTimeout(() => (copyBtn.textContent = '复制原始代码'), 1200);
            }
          };

          const pre = document.createElement('pre');
          pre.className = 'text-xs text-gray-800 overflow-x-auto bg-white border border-gray-200 rounded p-2';
          pre.textContent = bestCode;

          btnRow.appendChild(copyBtn);
          btnRow.appendChild(chineseBtn);
          fallbackDiv.appendChild(title);
          fallbackDiv.appendChild(btnRow);
          fallbackDiv.appendChild(pre);

          // 替换原始元素
          if (parentPre && parentPre.parentNode) {
            parentPre.parentNode.replaceChild(fallbackDiv, parentPre);
          } else if (codeEl.parentNode) {
            codeEl.parentNode.replaceChild(fallbackDiv, codeEl);
          }
        }
      })();
      tasks.push(p);
    });

    // 并行执行所有渲染任务
    Promise.allSettled(tasks).then((results) => {
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (successCount > 0 || failCount > 0) {
        console.log(`[Mermaid] 渲染完成: ${successCount} 成功, ${failCount} 失败`);
      }
    });

    return () => {
      cancelled = true;
      console.log('[Mermaid] 清理函数被调用');
      // 清理所有 Mermaid 相关的临时元素（包括方法1和方法2的元素）
      const tempElements = document.querySelectorAll('[data-mermaid-id]');
      console.log('[Mermaid] 找到临时元素数量:', tempElements.length);
      tempElements.forEach(el => {
        if (el.parentNode) {
          console.log('[Mermaid] 删除临时元素:', el);
          el.parentNode.removeChild(el);
        }
      });
    };
  }, [content, showRaw]);

  // 如果没有markdown语法，直接显示纯文本
  if (!hasMarkdown) {
    return (
      <div className={`whitespace-pre-wrap break-words text-sm ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 控制按钮 */}
      {showControls && (
        <div className="flex items-center justify-between bg-gray-50 p-2 rounded-t border-b">
          <div className="flex items-center gap-2">
            <FaCode className="text-xs text-gray-500" />
            <span className="text-xs text-gray-500">Markdown</span>
            {hasMarkdown && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  已检测到语法
                </span>
                {markdownFeatures.length > 0 && (
                  <div className="flex items-center gap-1">
                    {markdownFeatures.slice(0, 3).map((feature, idx) => (
                      <span key={idx} className="text-xs text-blue-600 bg-blue-100 px-1 py-0.5 rounded text-[10px]">
                        {feature}
                      </span>
                    ))}
                    {markdownFeatures.length > 3 && (
                      <span className="text-xs text-gray-500">
                        +{markdownFeatures.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors p-1 rounded hover:bg-blue-50"
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <FaCompress className="text-xs" /> : <FaExpand className="text-xs" />}
              {isExpanded ? '收起' : '展开'}
            </button>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors p-1 rounded hover:bg-blue-50"
              title={showRaw ? '显示渲染结果' : '显示原始文本'}
            >
              {showRaw ? <FaEye className="text-xs" /> : <FaEyeSlash className="text-xs" />}
              {showRaw ? '渲染' : '原始'}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  if (onCopy) {
                    onCopy(content);
                  } else {
                    console.log('Markdown内容已复制到剪贴板');
                  }
                } catch (err) {
                  console.error('复制失败:', err);
                }
              }}
              className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1 transition-colors p-1 rounded hover:bg-green-50"
              title="复制原始内容"
            >
              <FaCopyIcon className="text-xs" />
              复制
            </button>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 transition-colors p-1 rounded hover:bg-purple-50"
              title="显示Markdown语法帮助"
            >
              <FaQuestionCircle className="text-xs" />
              帮助
            </button>
          </div>
        </div>
      )}

      {/* 内容显示 */}
      <div className={`${className} ${showRaw ? 'bg-gray-100' : 'bg-gray-50'} ${isExpanded ? '' : 'max-h-96 overflow-y-auto'}`}>
        {/* Markdown语法帮助面板 */}
        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs">
            <h4 className="font-semibold text-blue-800 mb-2">Markdown语法速查：</h4>
            <div className="grid grid-cols-2 gap-2 text-blue-700">
              <div><code>**粗体**</code> {'→'} <strong>粗体</strong></div>
              <div><code>*斜体*</code> {'→'} <em>斜体</em></div>
              <div><code>`代码`</code> {'→'} <code className="bg-gray-200 px-1 rounded">代码</code></div>
              <div><code># 标题</code> {'→'} 标题</div>
              <div><code>- 列表</code> {'→'} 列表</div>
              <div><code>[链接](url)</code> {'→'} 链接</div>
              <div><code>![图片](url)</code> {'→'} 图片</div>
              <div><code>&gt; 引用</code> {'→'} 引用</div>
              <div><code>$$公式$$</code> {'→'} 数学公式</div>
              <div><code>|表格|</code> {'→'} 表格</div>
            </div>
          </div>
        )}
        {showRaw ? (
          <pre className="whitespace-pre-wrap break-words text-sm p-3 rounded border overflow-x-auto bg-white">
            {content}
          </pre>
        ) : (
          <div 
            className="prose prose-sm max-w-none p-3 rounded border overflow-x-auto bg-white
                     prose-headings:text-gray-800 prose-headings:font-semibold
                     prose-p:text-gray-700 prose-p:leading-relaxed
                     prose-strong:text-gray-900 prose-strong:font-semibold
                     prose-em:text-gray-800 prose-em:italic
                     prose-code:text-gray-800 prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm
                     prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-700
                     prose-ul:list-disc prose-ul:pl-5
                     prose-ol:list-decimal prose-ol:pl-5
                     prose-li:marker:text-gray-500 prose-li:mb-1
                     prose-a:text-blue-600 prose-a:underline prose-a:hover:text-blue-800
                     prose-table:border-collapse prose-table:w-full
                     prose-th:border prose-th:border-gray-300 prose-th:bg-gray-100 prose-th:p-2 prose-th:text-left
                     prose-td:border prose-td:border-gray-300 prose-td:p-2
                     prose-img:rounded prose-img:shadow-sm
                     prose-hr:border-gray-300 prose-hr:my-4
                     [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                     [&>h1]:text-xl [&>h1]:font-bold [&>h1]:mb-3 [&>h1]:border-b [&>h1]:pb-2
                     [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:mb-2 [&>h2]:text-gray-800
                     [&>h3]:text-base [&>h3]:font-medium [&>h3]:mb-2 [&>h3]:text-gray-800
                     [&>h4]:text-sm [&>h4]:font-medium [&>h4]:mb-1 [&>h4]:text-gray-800
                     [&>p]:mb-2 [&>p]:leading-relaxed
                     [&>ul]:mb-2 [&>ol]:mb-2
                     [&>li]:mb-1 [&>li]:leading-relaxed
                     [&>code]:font-mono [&>code]:text-sm
                     [&>pre]:p-3 [&>pre]:rounded [&>pre]:bg-gray-800 [&>pre]:text-gray-100 [&>pre]:overflow-x-auto
                     [&>pre>code]:bg-transparent [&>pre>code]:text-inherit [&>pre>code]:p-0
                     [&>blockquote]:border-l-4 [&>blockquote]:border-gray-300 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:bg-gray-50 [&>blockquote]:py-2
                     [&>a]:text-blue-600 [&>a]:underline [&>a]:hover:text-blue-800 [&>a]:transition-colors
                     [&>table]:border-collapse [&>table]:w-full [&>table]:mb-4
                     [&>table>thead]:bg-gray-100
                     [&>table>thead>tr>th]:border [&>table>thead>tr>th]:border-gray-300 [&>table>thead>tr>th]:p-2 [&>table>thead>tr>th]:text-left [&>table>thead>tr>th]:font-semibold
                     [&>table>tbody>tr>td]:border [&>table>tbody>tr>td]:border-gray-300 [&>table>tbody>tr>td]:p-2
                     [&>table>tbody>tr:nth-child(even)]:bg-gray-50
                     [&>img]:rounded [&>img]:shadow-sm [&>img]:max-w-full [&>img]:h-auto [&>img]:overflow-hidden
                     [&_.mermaid-diagram]:overflow-auto [&_.mermaid-diagram]:rounded-lg [&_.mermaid-diagram]:max-w-full [&_.mermaid-diagram]:w-full [&_.mermaid-diagram]:min-h-[200px] [&_.mermaid-diagram]:border [&_.mermaid-diagram]:border-gray-200 [&_.mermaid-diagram]:bg-white [&_.mermaid-diagram]:p-2 [&_.mermaid-diagram]:shadow-sm [&_.mermaid-diagram_img]:max-w-full [&_.mermaid-diagram_img]:h-auto [&_.mermaid-diagram_img]:w-auto [&_.mermaid-diagram_img]:block [&_.mermaid-diagram_img]:mx-auto [&_.mermaid-diagram_img]:overflow-visible [&_.mermaid-diagram_img]:transform [&_.mermaid-diagram_img]:transition-transform [&_.mermaid-diagram_img]:duration-200 [&_.mermaid-diagram_img]:hover:scale-105 [&_.mermaid-diagram_img]:cursor-zoom-in [&_.mermaid-diagram]:sm:min-h-[300px] [&_.mermaid-diagram]:md:min-h-[400px] [&_.mermaid-diagram]:lg:min-h-[500px] [&_.mermaid-diagram_img]:sm:max-w-[95%] [&_.mermaid-diagram_img]:md:max-w-[90%] [&_.mermaid-diagram_img]:lg:max-w-[85%]
                     [&>hr]:border-gray-300 [&>hr]:my-4
                     [&>details]:border [&>details]:border-gray-300 [&>details]:rounded [&>details]:p-3 [&>details]:mb-2
                     [&>summary]:cursor-pointer [&>summary]:font-medium [&>summary]:text-gray-800
                     [&>kbd]:bg-gray-200 [&>kbd]:border [&>kbd]:border-gray-400 [&>kbd]:rounded [&>kbd]:px-2 [&>kbd]:py-1 [&>kbd]:text-sm [&>kbd]:font-mono
                     [&>mark]:bg-yellow-200 [&>mark]:px-1 [&>mark]:rounded
                     [&>sub]:text-xs [&>sub]:text-gray-600
                     [&>sup]:text-xs [&>sup]:text-gray-600

                     [&>.katex]:text-inherit [&>.katex-display]:text-center [&>.katex-display]:my-4"
            ref={containerRef}
          >
            {processCodeBlocks(renderMarkdown(content))}
          </div>
        )}
      </div>
    </div>
  );
};

// 兼容性函数：保持原有API - 使用 react-syntax-highlighter
function renderMarkdown(content: string): string {
  try {
    const rawHtml = marked.parse(content || '', { async: false } as any) as unknown as string;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'pre', 'code', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'strong', 'em', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img', 'blockquote'
      ],
      ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class', 'id', 'target', 'rel']
    });
  } catch (e) {
    // 回退为纯文本
    const safe = (content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre>${safe}</pre>`;
  }
}

  

// 导出当前页为 TXT
function downloadTextFile(filename: string, content: string) {
  // Ensure UTF-8 with BOM so Windows Notepad detects encoding correctly
  const utf8Content = content.startsWith('\uFEFF') ? content : '\uFEFF' + content;
  const blob = new Blob([utf8Content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface LatestRecord {
  update_time?: string;
  image_url?: string;
  image_name?: string;
}

interface HistoryItem {
  id?: string; // 可选：后端如返回则支持按消息删除
  role: 'user' | 'assistant' | string;
  content: string;
  createdAt?: string;
}

interface HistoryResponse {
  history: HistoryItem[];
  total: number;
  currentPage: number;
  totalPages: number;
}

const LibreChatPage: React.FC = () => {
  const { setNotification } = useNotification();
  
  // 为 LibreChat 页面添加豁免标记，避免完整性检查器误报
  useEffect(() => {
    // 在页面根元素添加豁免标记
    const rootElement = document.querySelector('#root') || document.body;
    if (rootElement) {
      rootElement.setAttribute('data-component', 'LibreChatPage');
      rootElement.setAttribute('data-page', 'librechat');
    }
    
    // 清理函数
    return () => {
      if (rootElement) {
        rootElement.removeAttribute('data-component');
        rootElement.removeAttribute('data-page');
      }
    };
  }, []);

  // 全局错误拦截器，专门处理 Mermaid 语法错误
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
          // 拦截 console.error
      console.error = (...args) => {
        const errorMessage = args.join(' ');
        
        // 检查是否是 Mermaid 相关的语法错误
        if (
          errorMessage.includes('Syntax error in text') ||
          errorMessage.includes('Error parsing') ||
          errorMessage.includes('Error executing queue') ||
          errorMessage.includes('Parse error on line') ||
          errorMessage.includes('Expecting') ||
          errorMessage.includes('got') ||
          errorMessage.includes('Error: Error: Parse error') ||
          errorMessage.includes('Error: Parse error') ||
          errorMessage.includes('got \'PS\'')
        ) {
          // 静默处理 Mermaid 语法或执行错误
          return;
        }
        
        // 检查是否是其他 Mermaid 相关错误
        if (errorMessage.includes('mermaid') || errorMessage.includes('Mermaid')) {
          // 对于其他 Mermaid 错误，使用 warn 级别而不是 error
          return; // 直接静默
        }
        
        // 其他错误正常输出
        originalError.apply(console, args);
      };
    
    // 拦截 console.warn
    console.warn = (...args) => {
      const warnMessage = args.join(' ');
      
      // 检查是否是 Mermaid 相关的警告，包括 dagre 布局引擎的调试输出
      if (warnMessage.includes('mermaid') || 
          warnMessage.includes('Mermaid') ||
          warnMessage.includes('dagre') ||
          warnMessage.includes('flowchart') ||
          warnMessage.includes('Graph at first') ||
          warnMessage.includes('Edge') ||
          warnMessage.includes('Fix XXX') ||
          warnMessage.includes('Adjusted Graph') ||
          warnMessage.includes('extractor') ||
          warnMessage.includes('Graph in recursive render') ||
          warnMessage.includes('WARN :') ||
          warnMessage.includes('30.639 : WARN :')) {
        // 静默处理 Mermaid 和 dagre 相关警告
        return;
      }
      
      // 其他警告正常输出
      originalWarn.apply(console, args);
    };
    
    // 拦截全局错误事件
    const handleGlobalError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';
      const errorStack = event.error?.stack || '';
      
      // 检查是否是 Mermaid 相关的错误
      if (errorMessage.includes('Syntax error in text') || 
          errorMessage.includes('mermaid') || 
          errorMessage.includes('Mermaid') ||
          errorStack.includes('mermaid') ||
          errorStack.includes('Mermaid')) {
        // 阻止 Mermaid 错误传播
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };
    
    // 拦截未处理的 Promise 拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const errorMessage = reason?.message || String(reason);
      
      // 检查是否是 Mermaid 相关的 Promise 错误
      if (errorMessage.includes('Syntax error in text') || 
          errorMessage.includes('mermaid') || 
          errorMessage.includes('Mermaid')) {
        // 阻止 Mermaid Promise 错误传播
        event.preventDefault();
        return false;
      }
    };
    
    // DOM 观察器：监控并删除包含 Mermaid 语法错误的元素
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // 精确检查：ID 包含 dmermaid 并且包含特定的错误文本元素
              if (element.id && element.id.includes('dmermaid')) {
                // 检查是否包含特定的错误文本元素
                const errorText = element.querySelector('text.error-text');
                if (errorText && 
                    errorText.textContent?.includes('Syntax error in text') &&
                    errorText.getAttribute('x') === '1440' &&
                    errorText.getAttribute('y') === '250' &&
                    errorText.getAttribute('font-size') === '150px' &&
                    errorText.getAttribute('style')?.includes('text-anchor: middle')) {
                  // 只有同时满足所有条件才删除
                  element.remove();
                  console.log('[Mermaid] 已删除包含语法错误的元素:', element.id);
                  return;
                }
              }
              
              // 递归检查子元素，使用相同的精确条件
              const dmermaidElements = element.querySelectorAll('[id*="dmermaid"]');
              dmermaidElements.forEach((dmermaidEl) => {
                const errorText = dmermaidEl.querySelector('text.error-text');
                if (errorText && 
                    errorText.textContent?.includes('Syntax error in text') &&
                    errorText.getAttribute('x') === '1440' &&
                    errorText.getAttribute('y') === '250' &&
                    errorText.getAttribute('font-size') === '150px' &&
                    errorText.getAttribute('style')?.includes('text-anchor: middle')) {
                  // 只有同时满足所有条件才删除
                  dmermaidEl.remove();
                  console.log('[Mermaid] 已删除包含语法错误的子元素:', dmermaidEl.id);
                }
              });
            }
          });
        }
      });
    });
    
    // 立即检查现有元素
    const checkExistingElements = () => {
      const dmermaidElements = document.querySelectorAll('[id*="dmermaid"]');
      dmermaidElements.forEach((element) => {
        const errorText = element.querySelector('text.error-text');
        if (errorText && 
            errorText.textContent?.includes('Syntax error in text') &&
            errorText.getAttribute('x') === '1440' &&
            errorText.getAttribute('y') === '250' &&
            errorText.getAttribute('font-size') === '150px' &&
            errorText.getAttribute('style')?.includes('text-anchor: middle')) {
          // 只有同时满足所有条件才删除
          element.remove();
          console.log('[Mermaid] 已删除现有的包含语法错误的元素:', element.id);
        }
      });
    };
    
    // 开始观察 DOM 变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 延迟检查现有元素，确保页面已加载
    setTimeout(checkExistingElements, 100);
    
    // 定期清理函数，每5秒检查一次是否有遗漏的错误元素
    const cleanupInterval = setInterval(() => {
      const dmermaidElements = document.querySelectorAll('[id*="dmermaid"]');
      dmermaidElements.forEach((element) => {
        const errorText = element.querySelector('text.error-text');
        if (errorText && 
            errorText.textContent?.includes('Syntax error in text') &&
            errorText.getAttribute('x') === '1440' &&
            errorText.getAttribute('y') === '250' &&
            errorText.getAttribute('font-size') === '150px' &&
            errorText.getAttribute('style')?.includes('text-anchor: middle')) {
          // 只有同时满足所有条件才删除
          element.remove();
          console.log('[Mermaid] 定期清理：已删除包含语法错误的元素:', element.id);
        }
      });
    }, 5000);
    
    // 添加事件监听器
    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // 清理函数
    return () => {
      // 恢复原始的 console 方法
      console.error = originalError;
      console.warn = originalWarn;
      
      // 停止观察器
      observer.disconnect();
      
      // 清理定时器
      clearInterval(cleanupInterval);
      
      // 移除事件监听器
      window.removeEventListener('error', handleGlobalError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  
  // 作为 8192 tokens 的近似代理，前端采用同等数量的字符上限；
  // 真正的 token 计数应在后端/模型端完成（此处仅做输入侧保护）。
  const MAX_MESSAGE_LEN = 8192;
  const [token, setToken] = useState<string>(() => localStorage.getItem('librechat_token') || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [latest, setLatest] = useState<LatestRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  // 批量操作：选中的消息ID
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Turnstile 相关状态
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);

  // 单次实时对话框状态（与 WebhookEventsManager 模态对齐样式）
  const [rtOpen, setRtOpen] = useState(false);
  const [rtMessage, setRtMessage] = useState('');
  const [rtSending, setRtSending] = useState(false);
  const [rtStreaming, setRtStreaming] = useState(false);
  const [rtStreamContent, setRtStreamContent] = useState('');
  const [rtError, setRtError] = useState('');
  const [rtHistory, setRtHistory] = useState<HistoryItem[]>([]);
  // 持有实时对话的本地流式 interval，便于关闭对话框或卸载时清理
  const rtIntervalRef = useRef<number | null>(null);

  // 自定义弹窗状态
  const [alertModal, setAlertModal] = useState<{ open: boolean; title?: string; message: string; type?: 'warning' | 'danger' | 'info' | 'success' }>({ open: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title?: string; message: string; onConfirm: () => void; type?: 'warning' | 'danger' | 'info' }>({ open: false, message: '', onConfirm: () => {} });
  const [promptModal, setPromptModal] = useState<{ open: boolean; title?: string; message?: string; placeholder?: string; defaultValue?: string; codeEditor?: boolean; language?: string; maxLength?: number; onConfirm: (value: string) => void }>({ open: false, message: '', onConfirm: () => {} });

  const apiBase = useMemo(() => getApiBaseUrl(), []);

  // 复制到剪贴板
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ type: 'success', message: '内容已复制到剪贴板' });
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setNotification({ type: 'success', message: '内容已复制到剪贴板' });
    }
  };

  // 游客模式：当未填写本地 token 时视为游客（服务端通过 HttpOnly Cookie 维持会话）
  const guestMode = useMemo(() => !token, [token]);
  const [guestHintDismissed, setGuestHintDismissed] = useState<boolean>(() => localStorage.getItem('lc_guest_hint_dismissed') === '1');
  useEffect(() => {
    localStorage.setItem('lc_guest_hint_dismissed', guestHintDismissed ? '1' : '0');
  }, [guestHintDismissed]);

  // 检查用户是否为管理员
  const isAdmin = useMemo(() => {
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'administrator';
  }, []);

  // 游客须知面板的隐藏状态
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState<boolean>(() => localStorage.getItem('lc_guest_notice_dismissed') === '1');
  useEffect(() => {
    localStorage.setItem('lc_guest_notice_dismissed', guestNoticeDismissed ? '1' : '0');
  }, [guestNoticeDismissed]);

  // 将 librechat_token 持久化；若没有则尝试从 URL 和 登录态注入
  useEffect(() => {
    const url = new URL(window.location.href);
    const qpToken = url.searchParams.get('token');
    if (!token && qpToken) {
      setToken(qpToken);
      return;
    }
    if (!token) {
      const authToken = localStorage.getItem('token');
      if (authToken) setToken(authToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) localStorage.setItem('librechat_token', token);
  }, [token]);

  // 若无本地 token，则尝试申请游客 token（服务端通过 HttpOnly Cookie 下发）
  const ensureGuestToken = async () => {
    if (token) return;
    try {
      await fetch(`${apiBase}/api/librechat/guest`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // 忽略错误：可能未启用游客模式或网络异常
    }
  };

  const fetchLatest = async () => {
    try {
      setLoadingLatest(true);
      // 优先新API /lc（image_name 字段）；兼容旧API /librechat-image（image_url 字段）
      const res = await fetch(`${apiBase}/api/librechat/lc`, { credentials: 'include' });
      if (res.ok) {
        const data: LatestRecord = await res.json();
        setLatest(data);
      } else {
        const res2 = await fetch(`${apiBase}/api/librechat/librechat-image`, { credentials: 'include' });
        if (res2.ok) setLatest(await res2.json());
        else setLatest(null);
      }
    } catch (e) {
      setLatest(null);
    } finally {
      setLoadingLatest(false);
    }
  };

  // 受控输入：限制长度
  const onChangeMessage = (val: string) => {
    const next = val.length > MAX_MESSAGE_LEN ? val.slice(0, MAX_MESSAGE_LEN) : val;
    setMessage(next);
    if (next.length >= MAX_MESSAGE_LEN) setSendError(`已达到上限，将自动截断发送（${MAX_MESSAGE_LEN} 字符）`);
    else if (sendError) setSendError('');
  };
  const onChangeRtMessage = (val: string) => {
    const next = val.length > MAX_MESSAGE_LEN ? val.slice(0, MAX_MESSAGE_LEN) : val;
    setRtMessage(next);
    if (next.length >= MAX_MESSAGE_LEN) setRtError(`已达到上限，将自动截断发送（${MAX_MESSAGE_LEN} 字符）`);
    else if (rtError) setRtError('');
  };

  // 勾选切换
  const toggleSelect = (id?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法选择此消息' });
      return;
    }
    setSelectedIds((prev) => {
      const newIds = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (newIds.length > prev.length) {
        setNotification({ type: 'info', message: '已选择消息' });
      } else {
        setNotification({ type: 'info', message: '已取消选择消息' });
      }
      return newIds;
    });
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setNotification({ type: 'warning', message: '请先选择要删除的消息' });
      return;
    }
    setConfirmModal({
      open: true,
      title: '确认批量删除',
      message: `确定批量删除选中的 ${selectedIds.length} 条消息吗？`,
      type: 'danger',
      onConfirm: async () => {
        try {
          setNotification({ type: 'info', message: '正在批量删除消息...' });
      const res = await fetch(`${apiBase}/api/librechat/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(token ? { token, messageIds: selectedIds } : { messageIds: selectedIds })
      });
      if (res.ok) {
        setSelectedIds([]);
            setNotification({ type: 'success', message: `已删除 ${selectedIds.length} 条消息` });
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '批量删除失败' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '批量删除失败' });
    }
      }
    });
  };

  // 编辑消息
  const handleEdit = async (id?: string, current?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法编辑此消息' });
      return;
    }
    setPromptModal({
      open: true,
      title: '编辑消息',
      message: '请输入新的消息内容：',
      placeholder: '请输入消息内容',
      defaultValue: current || '',
      codeEditor: true,
      language: 'auto',
      maxLength: MAX_MESSAGE_LEN,
      onConfirm: async (content: string) => {
        if (!content.trim()) {
          setNotification({ type: 'warning', message: '消息内容不能为空' });
          return;
        }
        try {
          setNotification({ type: 'info', message: '正在修改消息...' });
      const res = await fetch(`${apiBase}/api/librechat/message`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(token ? { token, messageId: id, content } : { messageId: id, content })
      });
      if (res.ok) {
            setNotification({ type: 'success', message: '消息修改成功' });
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '修改失败' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '修改失败' });
    }
      }
    });
  };

  // 重试助手消息（携带上下文，覆盖原消息）
  const handleRetry = async (id?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法重试此消息' });
      return;
    }
    try {
      setNotification({ type: 'info', message: '正在重试AI回复...' });
      const res = await fetch(`${apiBase}/api/librechat/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(token ? { token, messageId: id } : { messageId: id })
      });
      if (res.ok) {
        setNotification({ type: 'success', message: 'AI回复重试成功' });
        await fetchHistory(page);
      } else {
        setNotification({ type: 'error', message: '重试失败' });
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || '重试失败' });
    }
  };

  const refreshHistory = () => {
    setNotification({ type: 'info', message: '正在刷新历史记录...' });
    fetchHistory(page);
  };

  const exportCurrentPage = async () => {
    if (!history || !history.history || history.history.length === 0) {
      setNotification({ type: 'warning', message: '当前页无历史记录可导出' });
      return;
    }
    try {
      setNotification({ type: 'info', message: '正在导出当前页历史记录...' });
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const header = `LibreChat 历史导出（当前页）\n导出时间：${now.toLocaleString()}\n总条数：${history.history.length}\n\n`;
    const lines = history.history.map((m, idx) => {
      const role = m.role === 'user' ? '用户' : '助手';
      const content = m.role === 'user' ? m.content : sanitizeAssistantText(m.content);
      const ts = m.createdAt ? ` @ ${m.createdAt}` : '';
      return `#${idx + 1} 【${role}${ts}】\n${content}\n`;
    });
    const txt = header + lines.join('\n');
    downloadTextFile(`LibreChat_聊天历史_第${page}页_${dateStr}.txt`, txt);
      setNotification({ type: 'success', message: `已导出 ${history.history.length} 条历史记录` });
    } catch (e) {
      setNotification({ type: 'error', message: '导出历史记录失败' });
    }
  };

  // 导出全部历史（后端生成并返回TXT文件）
  const exportAll = async () => {
    try {
      setNotification({ type: 'info', message: '正在导出全部历史记录...' });
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    const res = await fetch(`${apiBase}/api/librechat/export?${params.toString()}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!res.ok) {
        setNotification({ type: 'error', message: '导出失败，请稍后再试' });
      return;
    }
    // Try to normalize to UTF-8 with BOM for broad editor compatibility
    const originalBlob = await res.blob();
    let blob: Blob;
    try {
      const text = await originalBlob.text();
      const utf8Text = text.startsWith('\uFEFF') ? text : '\uFEFF' + text;
      blob = new Blob([utf8Text], { type: 'text/plain;charset=utf-8' });
    } catch {
      // Fallback: if not readable as text, keep original
      blob = originalBlob;
    }
    // 从响应头尝试获取文件名
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd || '');
    let filename = '';
    if (match) {
      filename = decodeURIComponent(match[1] || match[2] || '');
    }
    if (!filename) {
      const date = new Date().toISOString().slice(0, 10);
      filename = `LibreChat_历史_${date}.txt`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
      setNotification({ type: 'success', message: '全部历史记录导出成功' });
    } catch (e) {
      setNotification({ type: 'error', message: '导出全部历史记录失败' });
    }
  };

  // 删除单条消息（需要后端返回 id）
  const handleDelete = async (id?: string) => {
    if (!id) {
      setNotification({ type: 'warning', message: '无法删除此消息' });
      return;
    }
    setConfirmModal({
      open: true,
      title: '确认删除',
      message: '确定删除该消息吗？',
      type: 'danger',
      onConfirm: async () => {
        try {
          setNotification({ type: 'info', message: '正在删除消息...' });
      const res = await fetch(`${apiBase}/api/librechat/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(token ? { token, messageIds: [id] } : { messageIds: [id] })
      });
      if (res.ok) {
            setNotification({ type: 'success', message: '消息删除成功' });
        await fetchHistory(page);
      } else {
            setNotification({ type: 'error', message: '删除失败，请稍后再试' });
      }
    } catch {
          setNotification({ type: 'error', message: '删除失败，请稍后再试' });
    }
      }
    });
  };

  const fetchHistory = async (toPage = 1) => {
    console.log('fetchHistory called with page:', toPage); // 调试信息
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ page: String(toPage), limit: String(limit) });
      // 若存在 token 则一并传递；否则依赖后端会话中的 userId
      if (token) params.set('token', token);
      const url = `${apiBase}/api/librechat/history?${params.toString()}`;
      console.log('Fetching history from:', url); // 调试信息
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data: any = await res.json();
        console.log('History API response:', data); // 调试信息
        // 后端返回的消息字段为 message/timestamp/role，这里映射到前端使用的字段
        const mapped: HistoryResponse = {
          history: Array.isArray(data.history)
            ? data.history.map((m: any) => {
                console.log('Processing message:', m); // 调试信息
                return {
                  id: m.id || `msg_${Date.now()}_${Math.random()}`, // 确保有ID
                  role: m.role || 'user', // 简化role判断逻辑
                  content: m.message || m.content || '',
                  createdAt: m.timestamp || m.createdAt
                };
              })
            : [],
          total: data.total || 0,
          currentPage: data.currentPage || toPage,
          totalPages: data.totalPages || 1
        };
        console.log('Mapped history:', mapped); // 调试信息
        setHistory(mapped);
        setPage(toPage);
        console.log('History updated successfully'); // 调试信息
        if (mapped.history.length > 0) {
          setNotification({ type: 'success', message: `已加载 ${mapped.history.length} 条历史记录` });
      } else {
          setNotification({ type: 'info', message: '暂无历史记录' });
        }
      } else {
        console.error('History API error:', res.status, res.statusText); // 调试信息
        setHistory(null);
        setNotification({ type: 'error', message: '加载历史记录失败' });
      }
    } catch (e) {
      console.error('History fetch error:', e); // 调试信息
      setHistory(null);
      setNotification({ type: 'error', message: '加载历史记录失败，请稍后再试' });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Turnstile 验证处理函数
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(false);
  };

  const handleTurnstileError = () => {
    setTurnstileToken('');
    setTurnstileVerified(false);
    setTurnstileError(true);
  };

  const handleSend = async () => {
    setSendError('');
    if (!message.trim()) return;
    
    // 检查Turnstile验证（管理员除外）
    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setSendError('请先完成人机验证');
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }
    
    // 自动截断超长消息
    let toSend = message;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setSendError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
      setNotification({ type: 'warning', message: `消息过长，已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）` });
    }
    
    try {
      setSending(true);
      setStreaming(true);
      setStreamContent('');
      setNotification({ type: 'info', message: '正在发送消息...' });
      
      console.log('Sending message:', toSend); // 调试信息
      
      // 构建请求体
      const requestBody: any = token ? { token, message: toSend } : { message: toSend };
      
      // 如果不是管理员且Turnstile已启用，添加验证token
      if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
        requestBody.cfToken = turnstileToken;
      }
      
      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('Send response:', data); // 调试信息
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = txtRaw;
      setMessage('');
      
      // 重置Turnstile状态
      if (!isAdmin) {
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey(k => k + 1);
      }
      
      console.log('Message sent, waiting for response...'); // 调试信息
      if (txt) {
        console.log('AI response received:', txt.substring(0, 100) + '...'); // 调试信息
        setNotification({ type: 'success', message: 'AI回复已收到，正在生成...' });
      }
      
      // 检测历史记录中是否已有助手回复的函数
      const checkForExistingAssistantResponse = async () => {
        try {
          const params = new URLSearchParams({ page: '1', limit: '10' });
          if (token) params.set('token', token);
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, { 
            credentials: 'include' 
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.history && Array.isArray(checkData.history)) {
              // 检查最新的几条记录中是否有助手回复
              const recentMessages = checkData.history.slice(0, 5); // 检查最新的5条
              const hasAssistantResponse = recentMessages.some((msg: any) => {
                const role = msg.role || 'user';
                const content = msg.message || msg.content || '';
                return role === 'assistant' && content.trim().length > 0;
              });
              
              if (hasAssistantResponse) {
                console.log('检测到历史记录中已有助手回复，停止流式展示');
                return true;
              }
            }
          }
        } catch (error) {
          console.warn('检查历史记录失败:', error);
        }
        return false;
      };
      
      // 智能流式展示：按字符逐步显示，但避免渲染不完整的 Mermaid 代码
      if (txt) {
        let i = 0;
        let checkCounter = 0;
        const startTime = Date.now();
        const maxCheckDuration = 10000; // 最多检测10秒
        const interval = setInterval(async () => {
          // 每5次更新检查一次历史记录，避免过多API调用
          // 并且只在开始后的10秒内进行检测
          checkCounter++;
          const elapsedTime = Date.now() - startTime;
          if (checkCounter % 5 === 0 && elapsedTime < maxCheckDuration) {
            const hasExistingResponse = await checkForExistingAssistantResponse();
            if (hasExistingResponse) {
              clearInterval(interval);
              setStreaming(false);
              setStreamContent('');
              console.log('检测到已有助手回复，立即停止流式展示并刷新历史');
              setNotification({ type: 'info', message: '检测到已有回复，正在刷新历史记录...' });
              fetchHistory(1);
              return;
            }
          }
          
          i = i + Math.max(1, Math.floor(txt.length / 80)); // 自适应步长
          if (i >= txt.length) {
            setStreamContent(txt);
            clearInterval(interval);
            setStreaming(false);
            // 完成后刷新历史，确保刷新第一页
            console.log('Streaming completed, refreshing history...'); // 调试信息
            setNotification({ type: 'success', message: '对话完成，正在刷新历史记录...' });
            setTimeout(() => {
              console.log('Delayed refresh triggered...'); // 调试信息
              fetchHistory(1);
            }, 2000); // 增加延迟到2秒确保后端数据已保存
          } else {
            const partialContent = txt.slice(0, i);
            
            // 检查是否包含不完整的 Mermaid 代码块
            const mermaidBlocks = partialContent.match(/```mermaid[\s\S]*?```/g) || [];
            const hasIncompleteMermaid = mermaidBlocks.some(block => {
              const code = block.replace(/```mermaid\n?/, '').replace(/```$/, '');
              const trimmed = code.trim();
              
              // 检查是否包含基本的 Mermaid 语法结构
              const hasGraphKeyword = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(trimmed);
              const hasEndMarker = /end\s*$/i.test(trimmed) || /}\s*$/i.test(trimmed) || /\)\s*$/i.test(trimmed);
              const hasBalancedBraces = (trimmed.match(/\{/g) || []).length === (trimmed.match(/\}/g) || []).length;
              const hasBalancedParens = (trimmed.match(/\(/g) || []).length === (trimmed.match(/\)/g) || []).length;
              
              // 对于简单的图表，不要求必须有结束标记
              const isSimpleChart = /^(pie|gantt|gitgraph|mindmap|timeline)/i.test(trimmed);
              
              return hasGraphKeyword && !(isSimpleChart || hasBalancedBraces || hasBalancedParens);
            });
            
            // 如果包含不完整的 Mermaid 代码，显示提示而不是渲染
            if (hasIncompleteMermaid) {
              const processedContent = partialContent.replace(/```mermaid[\s\S]*?```/g, (match) => {
                return match.replace(/```mermaid\n?/, '```mermaid\n[等待图表完成...]\n');
              });
              setStreamContent(processedContent);
            } else {
              setStreamContent(partialContent);
            }
          }
        }, 30);
      } else {
        setStreaming(false);
        setNotification({ type: 'warning', message: 'AI未返回有效回复，正在刷新历史记录...' });
        // 即使没有回复内容，也要刷新历史记录
        setTimeout(() => {
          fetchHistory(1);
        }, 500);
      }
    } catch (e) {
      console.error('Send message error:', e); // 调试信息
      setSendError('发送失败，请稍后再试');
      setStreaming(false);
      setNotification({ type: 'error', message: '发送消息失败，请稍后再试' });
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      setNotification({ type: 'info', message: '正在清除历史记录...' });
      
      // 构建请求体，确保包含token信息
      const requestBody: any = {};
      if (token && token.trim()) {
        requestBody.token = token;
      }
      
      console.log('清除历史记录请求体:', requestBody); // 调试信息
      
      const res = await fetch(`${apiBase}/api/librechat/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      
      if (res.ok) {
        const result = await res.json();
        console.log('清除历史记录成功:', result); // 调试信息
        setNotification({ type: 'success', message: '历史记录已清除' });
        
        // 清除本地状态
        setHistory(null);
        setSelectedIds([]);
        
        // 重新获取历史记录（应该为空）
        await fetchHistory(1);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('清除历史记录失败:', res.status, errorData); // 调试信息
        setNotification({ type: 'error', message: errorData.error || '清除历史记录失败' });
      }
    } catch (e) {
      console.error('清除历史记录异常:', e); // 调试信息
      setNotification({ type: 'error', message: '清除历史记录失败，请稍后再试' });
    }
  };

  useEffect(() => {
    fetchLatest();
    fetchHistory(1); // 立即加载历史记录
    if (!token) {
      ensureGuestToken();
      setNotification({ type: 'info', message: '已切换到游客模式' });
    }
  }, []);

  // 组件卸载时，确保清理实时流式 interval 和 SSE 连接，避免遗留计时器导致状态异常
  useEffect(() => {
    return () => {
      if (rtIntervalRef.current) {
        clearInterval(rtIntervalRef.current);
        rtIntervalRef.current = null;
      }
      // 清理SSE连接
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // token 变更时刷新；无 token 也尝试从后端（会话）拉取
    console.log('useEffect triggered, token:', token); // 调试信息
    fetchHistory(1);
    if (!token) {
      ensureGuestToken();
      setNotification({ type: 'info', message: '已切换到游客模式' });
    } else {
      setNotification({ type: 'success', message: '已切换到用户模式' });
    }
  }, [token]);

  // 打开/关闭单次实时对话框
  const openRealtimeDialog = () => {
    // 清理可能遗留的 interval
    if (rtIntervalRef.current) {
      clearInterval(rtIntervalRef.current);
      rtIntervalRef.current = null;
    }
    setRtError('');
    setRtMessage('');
    setRtStreamContent('');
    setRtStreaming(false);
    setRtSending(false);
    setRtHistory([]);
    setRtOpen(true);
  };
  const closeRealtimeDialog = () => {
    if (rtSending) return; // 发送中避免误关
    // 关闭对话框时，确保停止任何仍在进行的本地流式 interval
    if (rtIntervalRef.current) {
      clearInterval(rtIntervalRef.current);
      rtIntervalRef.current = null;
    }
    setRtStreaming(false);
    setRtOpen(false);
  };

  // 对话框内发送（实时，支持上下文）
  const handleRealtimeSend = async () => {
    setRtError('');
    if (rtSending || rtStreaming) {
      setNotification({ type: 'warning', message: '正在处理中，请稍候...' });
      return; // 避免并发发送
    }
    if (!rtMessage.trim()) {
      setNotification({ type: 'warning', message: '请输入消息内容' });
      return;
    }
    
    // 检查Turnstile验证（管理员除外）
    if (!isAdmin && !!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
      setRtError('请先完成人机验证');
      setNotification({ message: '请先完成人机验证', type: 'warning' });
      return;
    }
    
    // 自动截断超长消息
    let toSend = rtMessage;
    if (toSend.length > MAX_MESSAGE_LEN) {
      toSend = toSend.slice(0, MAX_MESSAGE_LEN);
      setRtError(`超出部分已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）`);
      setNotification({ type: 'warning', message: `消息过长，已自动截断（最大 ${MAX_MESSAGE_LEN} 字符）` });
    }
    try {
      setRtSending(true);
      setRtStreaming(true);
      setRtStreamContent('');
      setNotification({ type: 'info', message: '正在发送消息...' });
      // 先把用户消息加入对话框内的本地上下文
      const userEntry: HistoryItem = { role: 'user', content: rtMessage };
      setRtHistory((prev) => [...prev, userEntry]);
      setRtMessage('');
      // 构建请求体
      const requestBody: any = token ? { token, message: toSend } : { message: toSend };
      
      // 如果不是管理员且Turnstile已启用，添加验证token
      if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
        requestBody.cfToken = turnstileToken;
      }
      
      const res = await fetch(`${apiBase}/api/librechat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 客户端模拟流式展示（后端字段为 response）
      const txtRaw: string = (data && typeof data.response === 'string') ? data.response : '';
      const txt = txtRaw;
      // 当后端按"模型身份"规则返回空字符串时，避免渲染空的助手消息
      if (!txt) {
        setRtStreaming(false);
        setRtSending(false);
        return;
      }
      
      // 检测历史记录中是否已有助手回复的函数（实时对话框版本）
      const checkForExistingAssistantResponseRealtime = async () => {
        try {
          const params = new URLSearchParams({ page: '1', limit: '10' });
          if (token) params.set('token', token);
          const checkRes = await fetch(`${apiBase}/api/librechat/history?${params.toString()}`, { 
            credentials: 'include' 
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.history && Array.isArray(checkData.history)) {
              // 检查最新的几条记录中是否有助手回复
              const recentMessages = checkData.history.slice(0, 5); // 检查最新的5条
              const hasAssistantResponse = recentMessages.some((msg: any) => {
                const role = msg.role || 'user';
                const content = msg.message || msg.content || '';
                return role === 'assistant' && content.trim().length > 0;
              });
              
              if (hasAssistantResponse) {
                console.log('实时对话框：检测到历史记录中已有助手回复，停止流式展示');
                return true;
              }
            }
          }
        } catch (error) {
          console.warn('实时对话框：检查历史记录失败:', error);
        }
        return false;
      };
      
      // 放入一个助手占位项，随着流式更新
      let assistantIndex = -1;
      setRtHistory((prev) => {
        const next = [...prev, { role: 'assistant', content: '' } as HistoryItem];
        assistantIndex = next.length - 1;
        return next;
      });
      // 启动前若已有旧计时器，先行清理
      if (rtIntervalRef.current) {
        clearInterval(rtIntervalRef.current);
        rtIntervalRef.current = null;
      }
      let i = 0;
      let checkCounter = 0;
      const interval = window.setInterval(async () => {
        try {
          // 每5次更新检查一次历史记录，避免过多API调用
          checkCounter++;
          if (checkCounter % 5 === 0) {
            const hasExistingResponse = await checkForExistingAssistantResponseRealtime();
            if (hasExistingResponse) {
              if (rtIntervalRef.current) {
                clearInterval(rtIntervalRef.current);
                rtIntervalRef.current = null;
              }
              setRtStreaming(false);
              setRtSending(false);
              setRtStreamContent('');
              // 移除刚添加的助手占位项
              setRtHistory((prev) => {
                const next = [...prev];
                if (assistantIndex >= 0 && assistantIndex < next.length) {
                  next.splice(assistantIndex, 1);
                }
                return next;
              });
              console.log('实时对话框：检测到已有助手回复，立即停止流式展示并刷新历史');
              setNotification({ type: 'info', message: '检测到已有回复，正在刷新历史记录...' });
              fetchHistory(1);
              return;
            }
          }
          
          i = i + Math.max(1, Math.floor(txt.length / 80));
          if (i >= txt.length) {
            setRtStreamContent(txt); // 兼容旧显示区域
            // 最终写回完整助手内容
            setRtHistory((prev) => {
              const next = [...prev];
              if (assistantIndex >= 0 && assistantIndex < next.length) {
                next[assistantIndex] = { ...next[assistantIndex], content: txt } as HistoryItem;
              }
              return next;
            });
            if (rtIntervalRef.current) {
              clearInterval(rtIntervalRef.current);
              rtIntervalRef.current = null;
            }
            setRtStreaming(false);
            setRtSending(false);
            
            // 重置Turnstile状态
            if (!isAdmin) {
              setTurnstileToken('');
              setTurnstileVerified(false);
              setTurnstileKey(k => k + 1);
            }
            
            // 实时对话框发送完成后也刷新历史记录
            console.log('Realtime dialog completed, refreshing history...'); // 调试信息
            setNotification({ type: 'success', message: '实时对话完成，正在刷新历史记录...' });
            setTimeout(() => {
              fetchHistory(1);
            }, 500);
          } else {
            const partial = txt.slice(0, i);
            
            // 检查是否包含不完整的 Mermaid 代码块
            const mermaidBlocks = partial.match(/```mermaid[\s\S]*?```/g) || [];
            const hasIncompleteMermaid = mermaidBlocks.some(block => {
              const code = block.replace(/```mermaid\n?/, '').replace(/```$/, '');
              const trimmed = code.trim();
              
              // 检查是否包含基本的 Mermaid 语法结构
              const hasGraphKeyword = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|zenuml|sankey)/i.test(trimmed);
              const hasEndMarker = /end\s*$/i.test(trimmed) || /}\s*$/i.test(trimmed) || /\)\s*$/i.test(trimmed);
              const hasBalancedBraces = (trimmed.match(/\{/g) || []).length === (trimmed.match(/\}/g) || []).length;
              const hasBalancedParens = (trimmed.match(/\(/g) || []).length === (trimmed.match(/\)/g) || []).length;
              
              // 对于简单的图表，不要求必须有结束标记
              const isSimpleChart = /^(pie|gantt|gitgraph|mindmap|timeline)/i.test(trimmed);
              
              return hasGraphKeyword && !(isSimpleChart || hasBalancedBraces || hasBalancedParens);
            });
            
            // 如果包含不完整的 Mermaid 代码，显示提示而不是渲染
            let processedPartial = partial;
            if (hasIncompleteMermaid) {
              processedPartial = partial.replace(/```mermaid[\s\S]*?```/g, (match) => {
                return match.replace(/```mermaid\n?/, '```mermaid\n[等待图表完成...]\n');
              });
            }
            
            setRtStreamContent(processedPartial);
            setRtHistory((prev) => {
              const next = [...prev];
              if (assistantIndex >= 0 && assistantIndex < next.length) {
                next[assistantIndex] = { ...next[assistantIndex], content: processedPartial } as HistoryItem;
              }
              return next;
            });
          }
        } catch (err) {
          console.error('Realtime stream interval error:', err);
          if (rtIntervalRef.current) {
            clearInterval(rtIntervalRef.current);
            rtIntervalRef.current = null;
          }
          setRtStreaming(false);
          setRtSending(false);
          setRtError('生成中发生错误，已停止');
          setNotification({ type: 'error', message: '实时对话生成过程中出现错误，已停止' });
        }
      }, 30);
      rtIntervalRef.current = interval;
    } catch (e) {
      setRtError('发送失败，请稍后再试');
      setRtStreaming(false);
      setRtSending(false);
      setNotification({ type: 'error', message: '实时对话发送失败，请稍后再试' });
    }
  };

  // 新增：SSE 连接管理
  const [sseConnected, setSseConnected] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // 建立SSE连接
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    try {
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      const sseUrl = `${apiBase}/api/librechat/sse?${params.toString()}`;
      
      const eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] 连接已建立');
        setSseConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] 收到消息:', data);

          switch (data.type) {
            case 'connected':
              console.log('[SSE] 连接确认，客户端ID:', data.clientId);
              break;
            
            case 'ping':
              // 心跳包，保持连接活跃
              break;
            
            case 'message_completed':
              console.log('[SSE] 消息完成通知:', data.data);
              // 立即停止流式展示并刷新历史记录
              setStreaming(false);
              setStreamContent('');
              setSending(false);
              setRtStreaming(false);
              setRtStreamContent('');
              setRtSending(false);
              
              // 立即刷新历史记录
              setNotification({ type: 'success', message: 'AI回复已完成，正在刷新历史记录...' });
              fetchHistory(1);
              break;
            
            case 'retry_completed':
              console.log('[SSE] 重试完成通知:', data.data);
              // 立即停止流式展示并刷新历史记录
              setStreaming(false);
              setStreamContent('');
              setSending(false);
              setRtStreaming(false);
              setRtStreamContent('');
              setRtSending(false);
              
              // 立即刷新历史记录
              setNotification({ type: 'success', message: 'AI重试已完成，正在刷新历史记录...' });
              fetchHistory(1);
              break;
            
            default:
              console.log('[SSE] 未知消息类型:', data.type);
          }
        } catch (error) {
          console.error('[SSE] 解析消息失败:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] 连接错误:', error);
        setSseConnected(false);
        
        // 自动重连（延迟3秒）
        setTimeout(() => {
          if (sseRef.current === eventSource) {
            console.log('[SSE] 尝试重新连接...');
            connectSSE();
          }
        }, 3000);
      };

    } catch (error) {
      console.error('[SSE] 建立连接失败:', error);
      setSseConnected(false);
    }
  }, [apiBase, token]);

  // 断开SSE连接
  const disconnectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
      setSseConnected(false);
      console.log('[SSE] 连接已断开');
    }
  }, []);

  // 监听token变化，重新建立SSE连接
  useEffect(() => {
    if (token || guestMode) {
      connectSSE();
    } else {
      disconnectSSE();
    }

    // 组件卸载时清理连接
    return () => {
      disconnectSSE();
    };
  }, [token, guestMode, connectSSE, disconnectSSE]);

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
          LibreChat 聊天
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>与 LibreChat 进行智能对话，支持历史记录管理、消息编辑和导出功能。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>智能对话和流式响应</li>
                <li>历史记录查看和管理</li>
                <li>消息编辑和批量删除（支持VSCode Dark+主题代码编辑器）</li>
                <li>聊天记录导出功能</li>
                <li>游客模式和用户模式</li>
                <li>实时通知和自动刷新</li>
              </ul>
            </div>
          </div>
          {/* SSE连接状态指示器 */}
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-500">
              {sseConnected ? '实时连接已建立' : '实时连接已断开'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* 最新镜像信息 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FaDownload className="text-lg text-blue-500" />
          LibreChat 最新镜像
        </h3>
        {loadingLatest ? (
          <UnifiedLoadingSpinner 
            size="md" 
            text="正在获取最新镜像信息..." 
            className="py-8"
          />
        ) : latest ? (
          <div className="space-y-3">
            {latest.update_time && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaInfoCircle className="text-blue-500" />
                <span>更新时间：{latest.update_time}</span>
              </div>
            )}
            {latest.image_name && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaDownload className="text-green-500" />
                <span>镜像名称：{latest.image_name}</span>
              </div>
            )}
            {latest.image_url && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FaEnvelope className="text-orange-500" />
                <span className="break-all">镜像地址：{latest.image_url}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FaDownload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            暂无数据
          </div>
        )}
      </motion.div>

      {/* 游客须知 */}
      <AnimatePresence>
        {guestMode && !guestNoticeDismissed && (
          <motion.div
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={() => setGuestNoticeDismissed(true)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              title="关闭并不再提示"
            >
              <FaTimes className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FaExclamationTriangle className="text-orange-500" />
              使用须知（游客）
            </h3>
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-2 text-gray-800">1. 禁止内容范围：</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>政治敏感、民族歧视内容</li>
                  <li>色情、暴力、恐怖主义内容</li>
                  <li>侵犯知识产权内容</li>
                  <li>虚假信息或误导性内容</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-2 text-gray-800">2. 违规处理措施：</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>立即停止服务并封禁账号</li>
                  <li>配合执法部门调查</li>
                  <li>提供使用记录和生成内容</li>
                  <li>保留追究法律责任权利</li>
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-blue-700 font-semibold mb-2 flex items-center gap-2">
                  <FaEnvelope className="text-blue-500" />
                  联系我们
                </h4>
                <p className="text-blue-700 text-sm">
                  如有任何问题或建议，请联系开发者：
                  <a
                    href="mailto:admin@hapxs.com"
                    className="font-medium hover:text-blue-800 transition-colors duration-200 ml-1 underline"
                  >
                    admin@hapxs.com
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 发送消息 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaPaperPlane className="text-lg text-blue-500" />
            发送消息
          </h3>
          {guestMode && (
            <span
              className="inline-flex items-center text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1"
              title="未填写令牌，将以游客模式使用 HttpOnly Cookie 维持会话"
            >
              <FaUser className="w-3 h-3 mr-1" />
              游客模式
            </span>
          )}
          {!guestMode && token && (
            <span
              className="inline-flex items-center text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1"
              title={`当前Token: ${token.substring(0, 8)}...`}
            >
              <FaUser className="w-3 h-3 mr-1" />
              用户模式
            </span>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                placeholder="请输入 Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="relative sm:col-span-2">
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                placeholder="请输入消息"
                value={message}
                maxLength={MAX_MESSAGE_LEN}
                onChange={(e) => onChangeMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">{message.length}/{MAX_MESSAGE_LEN}</div>
            {guestMode && !guestHintDismissed && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>当前以游客身份使用，会话通过浏览器 Cookie 保存。</span>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setGuestHintDismissed(true)}
                  title="不再提示"
                >
                  <FaTimes className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          {sendError && (
            <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              {sendError}
            </div>
          )}
          
          {/* Turnstile 人机验证（非管理员用户） */}
          {!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
            <motion.div
              className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-sm text-gray-700 mb-3 text-center">
                人机验证
                {turnstileVerified && (
                  <span className="ml-2 text-green-600 font-medium">✓ 验证通过</span>
                )}
              </div>
              
              <TurnstileWidget
                key={turnstileKey}
                siteKey={turnstileConfig.siteKey}
                onVerify={handleTurnstileVerify}
                onExpire={handleTurnstileExpire}
                onError={handleTurnstileError}
                theme="light"
                size="normal"
              />
              
              {turnstileError && (
                <div className="mt-2 text-sm text-red-500 text-center">
                  验证失败，请重新验证
                </div>
              )}
            </motion.div>
          )}
          
          <div className="flex flex-wrap gap-3">
            <motion.button
              onClick={handleSend}
              disabled={sending || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 disabled:opacity-50"
              whileTap={{ scale: 0.95 }}
            >
              <FaPaperPlane className="w-4 h-4" />
              {sending ? '发送中...' : '发送'}
            </motion.button>
            <motion.button
              onClick={() => {
                setConfirmModal({
                  open: true,
                  title: '确认清除历史',
                  message: '确定要清除所有聊天历史记录吗？此操作不可恢复。',
                  type: 'danger',
                  onConfirm: handleClear
                });
              }}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              whileTap={{ scale: 0.95 }}
            >
              清除历史
            </motion.button>
            <motion.button
              onClick={openRealtimeDialog}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium flex items-center gap-2"
              title="打开单次实时对话框"
              whileTap={{ scale: 0.95 }}
            >
              <FaPaperPlane className="w-4 h-4" />
              单次对话
            </motion.button>
            <motion.button
              onClick={() => {
                setPromptModal({
                  open: true,
                  title: '测试代码编辑器',
                  message: '这是一个测试，展示原生代码编辑器功能：',
                  placeholder: '请输入代码内容...',
                  defaultValue: `// 这是一个JavaScript示例
function greet(name) {
  return \`Hello, \${name}!\`;
}

const user = "World";
console.log(greet(user));

// JSON示例
const config = {
  "theme": "vscDarkPlus",
  "language": "javascript",
  "features": ["syntax-highlighting", "line-numbers", "auto-detection"]
};`,
                  codeEditor: true,
                  language: 'auto',
                  maxLength: 5000,
                  onConfirm: (content: string) => {
                    setNotification({ type: 'success', message: '代码编辑器测试完成！' });
                    console.log('测试代码内容:', content);
                  }
                });
              }}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium flex items-center gap-2"
              title="测试代码编辑器功能"
              whileTap={{ scale: 0.95 }}
            >
              <FaCode className="w-4 h-4" />
              测试编辑器
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 聊天历史 */}
      <motion.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* 工具栏 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaHistory className="text-lg text-blue-500" />
            聊天历史
            {history && (
              <span className="text-sm text-gray-500 font-normal">
                (共 {history.total} 条记录)
              </span>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>第 {page} / {history?.totalPages || 1} 页，共 {history?.total || 0} 条</span>
            <motion.button
              onClick={refreshHistory}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="刷新"
              whileTap={{ scale: 0.95 }}
            >
              <FaRedo className="w-3 h-3" />
              刷新
            </motion.button>
            <motion.button
              onClick={exportCurrentPage}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="导出本页"
              whileTap={{ scale: 0.95 }}
            >
              <FaDownload className="w-3 h-3" />
              导出本页
            </motion.button>
            <motion.button
              onClick={exportAll}
              className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
              title="导出全部"
              whileTap={{ scale: 0.95 }}
            >
              <FaDownload className="w-3 h-3" />
              导出全部
            </motion.button>
            <motion.button
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
              className={`px-3 py-1 rounded-lg border transition flex items-center gap-1 ${
                selectedIds.length === 0 
                  ? 'border-gray-200 text-gray-300' 
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
              title="批量删除所选"
              whileTap={{ scale: 0.95 }}
            >
              <FaTrash className="w-3 h-3" />
              批量删除
            </motion.button>
          </div>
        </div>
        
        {/* 聊天记录内容区域 */}
        <div className="border-t border-gray-200 pt-4">
          {loadingHistory ? (
            <UnifiedLoadingSpinner 
              size="md" 
              text="正在加载聊天历史..." 
              className="py-8"
            />
          ) : (
            <div className="max-h-[60vh] overflow-auto pr-1">
              {streaming && (
                <motion.div 
                  className="mb-4 p-4 border border-gray-200 rounded-lg bg-white"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <FaRobot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-green-700">助手</span>
                      <span className="text-xs text-gray-500">生成中...</span>
                    </div>
                  </div>
                  <EnhancedMarkdownRenderer 
                    content={sanitizeAssistantText(streamContent || '...')}
                    showControls={false}
                    onCodeCopy={(success) => {
                      if (success) {
                        setNotification({ type: 'success', message: '代码已复制' });
                      } else {
                        setNotification({ type: 'error', message: '复制失败' });
                      }
                    }}
                  />
                </motion.div>
              )}
              {/* 调试信息 */}
              <div className="text-xs text-gray-500 mb-2">
                历史记录状态: {history ? `已加载 (${history.history.length} 条)` : '未加载'} | 
                加载状态: {loadingHistory ? '加载中' : '已完成'}
              </div>
              {history && history.history.length > 0 ? (
                <div className="space-y-4">
                  {history.history.map((m: HistoryItem, idx: number) => (
                    <motion.div 
                      key={idx} 
                      className="p-4 border border-gray-200 rounded-lg bg-white"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * idx }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              m.role === 'user' 
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
                              <span className={`text-sm font-medium ${
                                m.role === 'user' 
                                  ? 'text-blue-700' 
                                  : 'text-green-700'
                              }`}>
                                {m.role === 'user' ? '用户' : '助手'}
                              </span>
                              {m.createdAt && (
                                <span className="text-xs text-gray-500">{m.createdAt}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.id && (
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                              checked={selectedIds.includes(m.id)}
                              onChange={() => toggleSelect(m.id)}
                              title="选择此消息"
                            />
                          )}
                          <motion.button
                            onClick={() => copyText(m.role === 'user' ? m.content : sanitizeAssistantText(m.content))}
                            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaCopy className="w-3 h-3" />
                            复制
                          </motion.button>
                        </div>
                      </div>
                      <EnhancedMarkdownRenderer 
                        content={m.role === 'user' ? m.content : sanitizeAssistantText(m.content)}
                        showControls={true}
                        onCopy={(content) => setNotification({ type: 'success', message: 'Markdown内容已复制到剪贴板' })}
                        onCodeCopy={(success) => {
                          if (success) {
                            setNotification({ type: 'success', message: '代码已复制' });
                          } else {
                            setNotification({ type: 'error', message: '复制失败' });
                          }
                        }}
                      />
                      {m.id && (
                        <div className="mt-3 flex justify-end gap-2">
                          <motion.button
                            onClick={() => handleEdit(m.id, m.content)}
                            className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 transition flex items-center gap-1"
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaEdit className="w-3 h-3" />
                            编辑
                          </motion.button>
                          {m.role !== 'user' && (
                            <motion.button
                              onClick={() => handleRetry(m.id)}
                              className="px-3 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition flex items-center gap-1"
                              whileTap={{ scale: 0.95 }}
                            >
                              <FaRedo className="w-3 h-3" />
                              重试
                            </motion.button>
                          )}
                          <motion.button
                            onClick={() => handleDelete(m.id)}
                            className="px-3 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition flex items-center gap-1"
                            whileTap={{ scale: 0.95 }}
                          >
                            <FaTrash className="w-3 h-3" />
                            删除
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FaHistory className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  {loadingHistory ? '加载中...' : '暂无历史记录'}
                </div>
              )}
            </div>
          )}
          {/* 分页控制 */}
          {history && history.history.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={page <= 1}
                onClick={() => {
                  setNotification({ type: 'info', message: '正在加载上一页...' });
                  fetchHistory(Math.max(1, page - 1));
                }}
                whileTap={{ scale: 0.95 }}
              >
                <FaChevronLeft className="text-xs" />
                上一页
              </motion.button>
              <motion.button
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2"
                disabled={history ? page >= history.totalPages : true}
                onClick={() => {
                  setNotification({ type: 'info', message: '正在加载下一页...' });
                  fetchHistory(page + 1);
                }}
                whileTap={{ scale: 0.95 }}
              >
                下一页
                <FaChevronRight className="text-xs" />
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>

      {/* 单次实时对话框 */}
      <AnimatePresence>
        {rtOpen && (
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
                  onClick={closeRealtimeDialog}
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
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <input
                    className="border-2 border-gray-200 rounded-lg px-4 py-3 w-full sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="请输入消息（支持上下文）"
                    value={rtMessage}
                    maxLength={MAX_MESSAGE_LEN}
                    onChange={(e) => onChangeRtMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !rtSending && !rtStreaming) handleRealtimeSend(); }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">{rtMessage.length}/{MAX_MESSAGE_LEN}</div>
                  {rtError && <div className="text-red-500 text-sm">{rtError}</div>}
                </div>
                
                {/* Turnstile 人机验证（非管理员用户） */}
                {!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
                  <motion.div
                    className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-sm text-gray-700 mb-3 text-center">
                      人机验证
                      {turnstileVerified && (
                        <span className="ml-2 text-green-600 font-medium">✓ 验证通过</span>
                      )}
                    </div>
                    
                    <TurnstileWidget
                      key={turnstileKey}
                      siteKey={turnstileConfig.siteKey}
                      onVerify={handleTurnstileVerify}
                      onExpire={handleTurnstileExpire}
                      onError={handleTurnstileError}
                      theme="light"
                      size="normal"
                    />
                    
                    {turnstileError && (
                      <div className="mt-2 text-sm text-red-500 text-center">
                        验证失败，请重新验证
                      </div>
                    )}
                  </motion.div>
                )}
                
                <div className="flex items-center justify-end gap-2">
                  <motion.button
                    onClick={handleRealtimeSend}
                    disabled={rtSending || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                    whileTap={{ scale: 0.95 }}
                  >
                    <FaPaperPlane className="w-4 h-4" />
                    {rtSending ? '发送中...' : '发送'}
                  </motion.button>
                </div>
                
                <div className="mt-4">
                  {rtHistory.length > 0 ? (
                    <div className="space-y-3 max-h-[45vh] overflow-auto pr-1">
                      {rtHistory.map((m, idx) => (
                        <motion.div 
                          key={idx} 
                          className="p-4 border border-gray-200 rounded-lg bg-white"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              m.role === 'user' 
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
                              <span className={`text-sm font-medium ${
                                m.role === 'user' 
                                  ? 'text-blue-700' 
                                  : 'text-green-700'
                              }`}>
                                {m.role === 'user' ? '用户' : '助手'}
                                {rtStreaming && idx === rtHistory.length - 1 ? '（生成中...）' : ''}
                              </span>
                            </div>
                          </div>
                          <EnhancedMarkdownRenderer 
                            content={m.role === 'user' ? m.content : sanitizeAssistantText(m.content)}
                            showControls={false}
                            onCodeCopy={(success) => {
                              if (success) {
                                setNotification({ type: 'success', message: '代码已复制' });
                              } else {
                                setNotification({ type: 'error', message: '复制失败' });
                              }
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>
                  ) : rtStreaming || rtStreamContent ? (
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
                            助手{rtStreaming ? '（生成中...）' : ''}
                          </span>
                        </div>
                      </div>
                      <EnhancedMarkdownRenderer 
                        content={sanitizeAssistantText(rtStreamContent || '')}
                        showControls={false}
                        onCodeCopy={(success) => {
                          if (success) {
                            setNotification({ type: 'success', message: '代码已复制' });
                          } else {
                            setNotification({ type: 'error', message: '复制失败' });
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

      {/* 自定义弹窗组件 */}
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal({ open: false, message: '' })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      <ConfirmModal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, message: '', onConfirm: () => {} })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
      
      <PromptModal
        open={promptModal.open}
        onClose={() => setPromptModal({ open: false, message: '', onConfirm: () => {} })}
        onConfirm={promptModal.onConfirm}
        title={promptModal.title}
        message={promptModal.message}
        placeholder={promptModal.placeholder}
        defaultValue={promptModal.defaultValue}
        codeEditor={promptModal.codeEditor}
        language={promptModal.language}
        maxLength={promptModal.maxLength}
      />
    </motion.div>
  );
};

export default LibreChatPage;