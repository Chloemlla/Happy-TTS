import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import '../styles/katex-fonts.css';
import DOMPurify from 'dompurify';

// 预加载 KaTeX 字体（仅在需要渲染数学公式时调用）
const preloadKatexFonts = () => {
    const fonts = [
        'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/fonts/KaTeX_Main-Regular.woff2',
        'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/fonts/KaTeX_Math-Italic.woff2',
        'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/fonts/KaTeX_Size1-Regular.woff2',
        'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/fonts/KaTeX_Size2-Regular.woff2'
    ];
    
    fonts.forEach(fontUrl => {
        if (!document.querySelector(`link[href="${fontUrl}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'font';
            link.type = 'font/woff2';
            link.crossOrigin = 'anonymous';
            link.href = fontUrl;
            document.head.appendChild(link);
        }
    });
};

// 配置marked以支持KaTeX
marked.use(markedKatex({
    nonStandard: true
}));

interface MarkdownPreviewProps {
  markdown: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown }) => {
  const [isKatexLoaded, setIsKatexLoaded] = useState(false);

  // 是否包含数学语法的简单检测
  const hasMath = (text: string) => /\$[^$]+\$|\$\$[\s\S]*?\$\$|\\\(|\\\)|\\\[|\\\]/.test(text || '');

  // 仅在内容包含数学公式时预加载字体并等待就绪；否则立即放行
  useEffect(() => {
    if (hasMath(markdown)) {
      preloadKatexFonts();
      const checkFontsLoaded = () => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setIsKatexLoaded(true);
          });
        } else {
          // 降级方案：等待一段时间后假设字体已加载
          setTimeout(() => {
            setIsKatexLoaded(true);
          }, 200);
        }
      };
      checkFontsLoaded();
    } else {
      // 没有数学公式时无需等待字体
      setIsKatexLoaded(true);
    }
  }, [markdown]);

  // 简单转义，作为回退时防止HTML注入
  const escapeHtml = (text: string) =>
    (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderMarkdown = (content: string): string => {
    try {
      const rawHtml = marked.parse(content || '', { async: false } as any) as unknown as string;
      return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'p','br','pre','code','span','div','h1','h2','h3','h4','h5','h6',
          'ul','ol','li','strong','em','table','thead','tbody','tr','th','td',
          'a','img','blockquote'
        ],
        ALLOWED_ATTR: ['href','title','alt','src','class','id','target','rel']
      });
    } catch (error) {
      console.warn('Markdown parsing error:', error);
      // 如果解析失败，返回转义后的纯文本
      const safeText = escapeHtml(content || '');
      return `<pre>${safeText}</pre>`;
    }
  };

  return (
    <div 
      className="prose prose-sm max-w-none" 
      style={{
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} 
    />
  );
};

export default MarkdownPreview;