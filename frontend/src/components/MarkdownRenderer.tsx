import React, { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Clipboard, Code2, Eye, Maximize2, Minimize2 } from 'lucide-react';
import 'katex/dist/katex.min.css';
import Mermaid from './Mermaid';

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> &
  ExtraProps & {
    inline?: boolean;
  };

type MarkdownHeadingProps = ComponentPropsWithoutRef<'h1'> & ExtraProps;
type MarkdownImageProps = ComponentPropsWithoutRef<'img'> & ExtraProps;
type MarkdownLinkProps = ComponentPropsWithoutRef<'a'> & ExtraProps;
type MarkdownInputProps = ComponentPropsWithoutRef<'input'> & ExtraProps;
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type MarkdownDisplayMode = 'rendered' | 'source';
type MarkdownDensity = 'default' | 'compact';

export type MarkdownReaderControls = {
  showCopy?: boolean;
  showSourceToggle?: boolean;
  showExpandToggle?: boolean;
  defaultMode?: MarkdownDisplayMode;
  defaultExpanded?: boolean;
  collapsedHeight?: number | string;
};

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
  className?: string;
  onCodeCopy?: (success: boolean) => void;
  onContentCopy?: (success: boolean, content: string) => void;
  density?: MarkdownDensity;
  controls?: boolean | MarkdownReaderControls;
}

const CODE_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const DEFAULT_COLLAPSED_HEIGHT = 520;

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

function extractText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (React.isValidElement<{ children?: React.ReactNode }>(child)) return extractText(child.props.children);
      return '';
    })
    .join('');
}

export function getMarkdownHeadingId(children: React.ReactNode): string {
  return extractText(children)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getLinkTitle(href?: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return href;
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return href;
  }
}

function resolveReaderControls(controls?: boolean | MarkdownReaderControls) {
  if (!controls) return null;

  const config = controls === true ? {} : controls;
  return {
    showCopy: config.showCopy ?? true,
    showSourceToggle: config.showSourceToggle ?? true,
    showExpandToggle: config.showExpandToggle ?? false,
    defaultMode: config.defaultMode ?? 'rendered',
    defaultExpanded: config.defaultExpanded ?? !(config.showExpandToggle ?? false),
    collapsedHeight: config.collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT,
  };
}

function formatCssSize(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

const TaskCheckbox: React.FC<MarkdownInputProps> = ({ checked, disabled: _disabled, ...props }) => {
  const [isChecked, setIsChecked] = useState(Boolean(checked));

  useEffect(() => {
    setIsChecked(Boolean(checked));
  }, [checked]);

  return (
    <input
      {...props}
      type="checkbox"
      checked={isChecked}
      onChange={(event) => setIsChecked(event.target.checked)}
      className="markdown-task-checkbox"
    />
  );
};

const MarkdownImage: React.FC<MarkdownImageProps & {
  onOpen: (image: { src: string; alt: string }) => void;
}> = ({ src, alt = '', onOpen, node: _node, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <figure className="markdown-image-frame">
      <button
        type="button"
        className={`markdown-image-button ${isLoaded ? 'is-loaded' : ''}`}
        onClick={() => {
          if (src) onOpen({ src, alt });
        }}
        title="点击放大图片"
      >
        <span className="markdown-image-skeleton" aria-hidden="true" />
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          {...props}
        />
      </button>
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDark,
  className,
  onCodeCopy,
  onContentCopy,
  density = 'default',
  controls,
}) => {
  const readerControls = resolveReaderControls(controls);
  const [displayMode, setDisplayMode] = useState<MarkdownDisplayMode>(
    readerControls?.defaultMode ?? 'rendered',
  );
  const [isExpanded, setIsExpanded] = useState(readerControls?.defaultExpanded ?? true);
  const [contentCopyStatus, setContentCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyFeedbackTimer = useRef<number | null>(null);
  const handleCodeCopy = async (code: string) => {
    const success = await copyTextToClipboard(code);
    onCodeCopy?.(success);
  };

  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);

  useEffect(() => {
    setDisplayMode(readerControls?.defaultMode ?? 'rendered');
  }, [content, readerControls?.defaultMode]);

  useEffect(() => {
    setIsExpanded(readerControls?.defaultExpanded ?? true);
  }, [content, readerControls?.defaultExpanded]);

  useEffect(() => () => {
    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!lightboxImage) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImage(null);
        setIsLightboxZoomed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  const handleContentCopy = async () => {
    const success = await copyTextToClipboard(content);
    onContentCopy?.(success, content);
    setContentCopyStatus(success ? 'copied' : 'failed');

    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current);
    }

    copyFeedbackTimer.current = window.setTimeout(() => {
      setContentCopyStatus('idle');
      copyFeedbackTimer.current = null;
    }, 1600);
  };

  const copyHeadingLink = async (id: string) => {
    if (!id || typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
    const success = await copyTextToClipboard(url);
    onCodeCopy?.(success);
  };

  const renderHeading = (Tag: HeadingTag, children: React.ReactNode, props: MarkdownHeadingProps) => {
    const id = getMarkdownHeadingId(children);
    return React.createElement(
      Tag,
      {
        ...props,
        id,
        className: `markdown-heading markdown-heading-${Tag} group scroll-mt-24 ${props.className || ''}`,
      },
      <>
        <span>{children}</span>
        {id && (
          <button
            type="button"
            className="markdown-heading-anchor"
            onClick={() => void copyHeadingLink(id)}
            title="复制此标题链接"
            aria-label="复制此标题链接"
          >
            #
          </button>
        )}
      </>,
    );
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
        <div className="group relative my-4 overflow-hidden rounded-md border border-gray-700/50 shadow-lg">
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
            className="absolute right-2 top-10 rounded-sm bg-white/10 p-2 text-white opacity-85 transition hover:bg-white/20 hover:opacity-100 focus-visible:opacity-100"
            title="复制代码"
            aria-label={`Copy ${languageLabel} code`}
          >
            <Clipboard className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      );
    },
    a: ({ node: _node, href, children, ...props }: MarkdownLinkProps) => (
      <a
        href={href}
        target={href?.startsWith('#') ? undefined : '_blank'}
        rel={href?.startsWith('#') ? undefined : 'noopener noreferrer'}
        title={getLinkTitle(href)}
        data-link-preview={getLinkTitle(href)}
        {...props}
      >
        {children}
      </a>
    ),
    blockquote: ({ node: _node, children, ...props }) => (
      <blockquote className="markdown-blockquote" {...props}>
        {children}
      </blockquote>
    ),
    table: ({ node: _node, children, ...props }) => (
      <div className="markdown-table-scroll">
        <table {...props}>{children}</table>
      </div>
    ),
    input: ({ node: _node, ...props }: MarkdownInputProps) =>
      props.type === 'checkbox' ? <TaskCheckbox {...props} /> : <input {...props} />,
    img: (props: MarkdownImageProps) => (
      <MarkdownImage
        {...props}
        onOpen={(image) => {
          setLightboxImage(image);
          setIsLightboxZoomed(false);
        }}
      />
    ),
    h1: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h1', children, props),
    h2: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h2', children, props),
    h3: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h3', children, props),
    h4: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h4', children, props),
    h5: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h5', children, props),
    h6: ({ node: _node, children, ...props }: MarkdownHeadingProps) => renderHeading('h6', children, props),
  };

  const rendererClassName = `markdown-renderer ${
    density === 'compact' ? 'markdown-renderer-compact' : ''
  } prose max-w-none break-words ${isDark ? 'markdown-renderer-dark prose-invert' : ''} ${className || ''}`;

  const markdownNode = (
    <div className={rendererClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  const sourceNode = (
    <pre className={`markdown-source-view ${density === 'compact' ? 'markdown-source-view-compact' : ''}`}>
      {content}
    </pre>
  );

  const contentNode = displayMode === 'source' ? sourceNode : markdownNode;
  const isCollapsed = Boolean(readerControls?.showExpandToggle && !isExpanded);
  const collapsedHeight = readerControls
    ? formatCssSize(readerControls.collapsedHeight)
    : `${DEFAULT_COLLAPSED_HEIGHT}px`;
  const bodyStyle = isCollapsed
    ? { maxHeight: collapsedHeight }
    : undefined;

  const wrappedContent = readerControls ? (
    <div className={`markdown-reader ${isDark ? 'markdown-reader-dark' : ''}`}>
      <div className="markdown-reader-toolbar" aria-label="Markdown reading controls">
        {readerControls.showCopy && (
          <button
            type="button"
            className={`markdown-reader-button ${
              contentCopyStatus === 'copied' ? 'is-success' : contentCopyStatus === 'failed' ? 'is-error' : ''
            }`}
            onClick={() => void handleContentCopy()}
            title={contentCopyStatus === 'copied' ? '已复制' : contentCopyStatus === 'failed' ? '复制失败' : '复制 Markdown'}
            aria-label={contentCopyStatus === 'copied' ? '已复制' : '复制 Markdown'}
          >
            {contentCopyStatus === 'copied' ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Clipboard className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
        {readerControls.showSourceToggle && (
          <button
            type="button"
            className="markdown-reader-button"
            onClick={() => setDisplayMode((value) => (value === 'source' ? 'rendered' : 'source'))}
            title={displayMode === 'source' ? '显示渲染结果' : '显示 Markdown 原文'}
            aria-label={displayMode === 'source' ? '显示渲染结果' : '显示 Markdown 原文'}
            aria-pressed={displayMode === 'source'}
          >
            {displayMode === 'source' ? (
              <Eye className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Code2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
        {readerControls.showExpandToggle && (
          <button
            type="button"
            className="markdown-reader-button"
            onClick={() => setIsExpanded((value) => !value)}
            title={isExpanded ? '收起长内容' : '展开长内容'}
            aria-label={isExpanded ? '收起长内容' : '展开长内容'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <div className={`markdown-reader-body ${isCollapsed ? 'is-collapsed' : ''}`} style={bodyStyle}>
        {contentNode}
        {isCollapsed && <span className="markdown-reader-fade" aria-hidden="true" />}
      </div>
    </div>
  ) : (
    contentNode
  );

  return (
    <>
      {wrappedContent}
      {lightboxImage && (
        <div
          className="markdown-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setLightboxImage(null);
            setIsLightboxZoomed(false);
          }}
        >
          <button
            type="button"
            className="markdown-lightbox-close"
            onClick={() => {
              setLightboxImage(null);
              setIsLightboxZoomed(false);
            }}
            aria-label="关闭图片预览"
          >
            ×
          </button>
          <div
            className={`markdown-lightbox-content ${isLightboxZoomed ? 'is-zoomed' : ''}`}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={() => setIsLightboxZoomed((value) => !value)}
          >
            <img src={lightboxImage.src} alt={lightboxImage.alt} draggable={false} />
            {lightboxImage.alt && <p>{lightboxImage.alt}</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default MarkdownRenderer;
