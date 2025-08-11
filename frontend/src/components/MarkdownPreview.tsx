import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import '../styles/katex-fonts.css';

// 预加载KaTeX字体以避免慢网络警告
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

  // 组件挂载时预加载KaTeX字体
  useEffect(() => {
    preloadKatexFonts();
    
    // 检查字体是否已加载
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
  }, []);

  const renderMarkdown = (content: string) => {
    try {
      return marked.parse(content || '');
    } catch (error) {
      console.warn('Markdown parsing error:', error);
      // 如果解析失败，返回纯文本
      return `<pre>${content}</pre>`;
    }
  };

  if (!isKatexLoaded) {
    return (
      <div className="prose prose-sm max-w-none flex items-center justify-center py-8">
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm">正在加载数学公式渲染器...</p>
        </div>
      </div>
    );
  }

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