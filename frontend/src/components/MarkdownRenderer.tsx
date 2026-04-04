import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import Mermaid from './Mermaid';

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
  className?: string;
  onCopy?: (success: boolean) => void;
  onCodeCopy?: (success: boolean) => void;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDark,
  className,
  onCopy,
  onCodeCopy,
}) => {
  const handleCodeCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onCodeCopy?.(true);
      onCopy?.(true);
    } catch {
      onCodeCopy?.(false);
      onCopy?.(false);
    }
  };

  return (
    <div
      className={`prose prose-sm max-w-none break-words ${
        isDark ? 'prose-invert text-white' : 'text-gray-800'
      } ${className || ''}
        prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
        prose-code:bg-gray-100/50 prose-code:text-pink-600 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
        prose-headings:text-inherit prose-strong:text-inherit prose-a:text-blue-500 hover:prose-a:underline`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className: codeClassName, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : '';
            const rawCode = String(children).replace(/\n$/, '');

            if (language === 'mermaid') {
              return <Mermaid code={rawCode} />;
            }

            return !inline && match ? (
              <div className="group relative my-4 overflow-hidden rounded-xl border border-gray-700/50 shadow-lg">
                <div className="flex items-center justify-between border-b border-gray-700/30 bg-gray-800 px-4 py-2 font-mono text-[10px] text-gray-400">
                  <span className="font-bold uppercase tracking-wider">{language}</span>
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500/50" />
                    <span className="h-2 w-2 rounded-full bg-yellow-500/50" />
                    <span className="h-2 w-2 rounded-full bg-green-500/50" />
                  </div>
                </div>
                <SyntaxHighlighter
                  {...props}
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  className="!m-0 !bg-gray-900 !p-4"
                  customStyle={{
                    fontSize: '12px',
                    lineHeight: '1.6',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                >
                  {rawCode}
                </SyntaxHighlighter>
                <button
                  type="button"
                  onClick={() => void handleCodeCopy(rawCode)}
                  className="absolute right-2 top-10 rounded-lg bg-white/10 p-2 text-white opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
                  title="复制代码"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
          a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
