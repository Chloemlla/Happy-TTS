import React, { type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import Mermaid from './Mermaid';

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> &
  ExtraProps & {
    inline?: boolean;
  };

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
  className?: string;
  onCodeCopy?: (success: boolean) => void;
}

const CODE_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the legacy copy path below.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';

  document.body.appendChild(textArea);

  const selection = document.getSelection();
  const selectedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
    if (selection) {
      selection.removeAllRanges();
      if (selectedRange) {
        selection.addRange(selectedRange);
      }
    }
  }
}

function getCodeLanguage(codeClassName?: string): string {
  return (
    codeClassName
      ?.split(/\s+/)
      .find((value) => value.startsWith('language-'))
      ?.slice('language-'.length) ?? ''
  );
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDark,
  className,
  onCodeCopy,
}) => {
  const handleCodeCopy = async (code: string) => {
    const success = await copyTextToClipboard(code);
    onCodeCopy?.(success);
  };

  const components: Components = {
    code({ node: _node, inline, className: codeClassName, children, ...props }: MarkdownCodeProps) {
      const language = getCodeLanguage(codeClassName);
      const languageLabel = language || 'text';
      const rawCode = React.Children.toArray(children).join('').replace(/\n$/, '');
      const isBlockCode = inline !== true;

      if (isBlockCode && language.toLowerCase() === 'mermaid') {
        return <Mermaid code={rawCode} />;
      }

      if (!isBlockCode) {
        return (
          <code className={codeClassName} {...props}>
            {children}
          </code>
        );
      }

      return (
        <div className="group relative my-4 overflow-hidden rounded-xl border border-gray-700/50 shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-700/30 bg-gray-800 px-4 py-2 font-mono text-[10px] text-gray-400">
            <span className="font-bold uppercase tracking-wider">{languageLabel}</span>
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/50" />
              <span className="h-2 w-2 rounded-full bg-yellow-500/50" />
              <span className="h-2 w-2 rounded-full bg-green-500/50" />
            </div>
          </div>
          {language ? (
            <SyntaxHighlighter
              {...props}
              style={vscDarkPlus}
              language={language}
              PreTag="div"
              className="!m-0 !bg-gray-900 !p-4"
              customStyle={{
                fontSize: '12px',
                lineHeight: '1.6',
                fontFamily: CODE_FONT_FAMILY,
              }}
            >
              {rawCode}
            </SyntaxHighlighter>
          ) : (
            <pre
              className="m-0 overflow-x-auto bg-gray-900 p-4 text-xs leading-relaxed text-gray-100"
              style={{ fontFamily: CODE_FONT_FAMILY }}
            >
              <code {...props}>{rawCode}</code>
            </pre>
          )}
          <button
            type="button"
            onClick={() => void handleCodeCopy(rawCode)}
            className="absolute right-2 top-10 rounded-lg bg-white/10 p-2 text-white opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
            title="复制代码"
            aria-label={`Copy ${languageLabel} code`}
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
      );
    },
    a: ({ node: _node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
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
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
