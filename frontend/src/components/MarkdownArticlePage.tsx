import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Copy, FileText, Image as ImageIcon, Menu, Share2, X } from 'lucide-react';
import { markdownArticleApi, type MarkdownArticle, type MarkdownArticleSummary } from '../api/markdownArticles';
import MarkdownRenderer, { getMarkdownHeadingId } from './MarkdownRenderer';

function formatDate(value?: string | null): string {
  if (!value) return '未发布';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractHeadings(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      const text = match[2].replace(/[#*_`~]/g, '').trim();
      return {
        level: match[1].length,
        text,
        anchor: getMarkdownHeadingId(text),
      };
    })
    .filter((item): item is { level: number; text: string; anchor: string } => Boolean(item?.text));
}

const MarkdownArticlePage: React.FC = () => {
  const { slug = '' } = useParams();
  const [article, setArticle] = useState<MarkdownArticle | null>(null);
  const [articles, setArticles] = useState<MarkdownArticleSummary[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState('');
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const headings = useMemo(() => extractHeadings(article?.content || '').slice(0, 18), [article?.content]);
  const relatedArticles = useMemo(
    () => articles.filter((item) => item.slug !== article?.slug).slice(0, 6),
    [article?.slug, articles],
  );
  const wordCount = useMemo(() => article?.content.trim().length || 0, [article?.content]);
  const readingMinutes = useMemo(
    () => Math.max(1, Math.ceil(wordCount / 500)),
    [wordCount],
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        if (slug) {
          const [articleResult, listResult] = await Promise.all([
            markdownArticleApi.getPublished(slug),
            markdownArticleApi.listPublished(),
          ]);
          if (alive) {
            setArticle(articleResult.article);
            setArticles(listResult.articles || []);
          }
        } else {
          const result = await markdownArticleApi.listPublished();
          if (alive) setArticles(result.articles || []);
        }
      } catch (err: any) {
        if (alive) setError(err?.response?.data?.message || '文章不存在或尚未发布');
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug || !article) return undefined;

    let ticking = false;
    let lastScrollY = window.scrollY;
    const updateReadingState = () => {
      ticking = false;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setReadingProgress(Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)));
      setIsHeaderHidden(scrollTop > 120 && scrollTop > lastScrollY + 6);
      lastScrollY = scrollTop;

      let current = headings[0]?.anchor || '';
      for (const heading of headings) {
        const element = document.getElementById(heading.anchor);
        if (element && element.getBoundingClientRect().top <= 128) {
          current = heading.anchor;
        }
      }
      setActiveHeading(current);
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateReadingState);
      }
    };

    updateReadingState();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [article, headings, slug]);

  const copyArticleLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  };

  const copySelectedText = async () => {
    if (!selectionPopover?.text) return;
    await navigator.clipboard.writeText(selectionPopover.text);
    setSelectionPopover(null);
  };

  const shareSelectedText = () => {
    if (!selectionPopover?.text) return;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(selectionPopover.text)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setSelectionPopover(null);
  };

  const downloadSelectedTextImage = () => {
    if (!selectionPopover?.text) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    const text = selectionPopover.text.slice(0, 260);
    canvas.width = 1200;
    canvas.height = 630;
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#0f172a';
    context.font = '38px system-ui, -apple-system, Segoe UI, sans-serif';
    const lines = text.match(/.{1,24}/g) || [text];
    lines.slice(0, 8).forEach((line, index) => context.fillText(line, 86, 130 + index * 58));
    context.font = '24px system-ui, -apple-system, Segoe UI, sans-serif';
    context.fillStyle = '#64748b';
    context.fillText(article?.title || 'Markdown Article', 86, 560);
    const link = document.createElement('a');
    link.download = 'selection-card.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    setSelectionPopover(null);
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (!selection || text.length < 2 || selection.rangeCount === 0) {
      setSelectionPopover(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPopover({
      text,
      top: Math.max(12, rect.top + window.scrollY - 48),
      left: Math.min(window.innerWidth - 180, Math.max(12, rect.left + rect.width / 2 - 90)),
    });
  };

  const scrollToHeading = (event: React.MouseEvent<HTMLAnchorElement>, anchor: string) => {
    event.preventDefault();
    const element = document.getElementById(anchor);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${anchor}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500 shadow-sm">
          正在加载文章...
        </div>
      </div>
    );
  }

  if (!slug) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
            <FileText className="h-3.5 w-3.5" />
            Published Articles
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">文章</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">这里展示已发布的 Markdown 文章。</p>
        </header>
        {articles.length === 0 ? (
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500 shadow-sm">
            暂无已发布文章。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {articles.map((item) => (
              <Link
                key={item.id}
                to={`/articles/${item.slug}`}
                className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="text-xs font-semibold text-slate-500">{formatDate(item.publishedAt)}</div>
                <h2 className="mt-3 line-clamp-2 text-xl font-semibold text-slate-950">{item.title}</h2>
                {item.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[28px] border border-rose-100 bg-white/90 p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">文章不可访问</h1>
          <p className="mt-3 text-sm text-slate-600">{error || '文章不存在或尚未发布'}</p>
          <Link to="/articles" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4" />
            查看文章列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-7xl px-4 py-6 sm:py-10" onMouseUp={handleSelection}>
      <div className="fixed left-0 top-0 z-[80] h-0.5 w-full bg-transparent">
        <div
          className="h-full bg-slate-900/70 transition-[width] duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>
      <div
        className={`sticky top-0 z-[70] -mx-4 mb-6 border-b border-slate-200/80 bg-white/88 px-4 backdrop-blur-xl transition-transform duration-200 ${
          isHeaderHidden ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3">
          <Link to="/articles" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            返回文章列表
          </Link>
          <div className="flex items-center gap-2">
            {headings.length > 0 && (
              <button
                type="button"
                onClick={() => setIsTocOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 lg:hidden"
              >
                <Menu className="h-4 w-4" />
                目录
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyArticleLink()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              <Copy className="h-4 w-4" />
              复制链接
            </button>
          </div>
        </div>
      </div>
      <header className="mb-8 border-b border-slate-200 pb-8">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(article.publishedAt)}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            {readingMinutes} 分钟阅读
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
            {wordCount} 字
          </div>
          {article.updatedAt && (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
              更新 {formatDate(article.updatedAt)}
            </div>
          )}
        </div>
        <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">{article.title}</h1>
        {article.excerpt && <p className="mt-4 text-base leading-8 text-slate-600">{article.excerpt}</p>}
      </header>
      <div className="grid justify-center gap-6 lg:grid-cols-[210px_minmax(0,720px)_240px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white/70 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">延伸阅读</div>
              <div className="mt-3 space-y-2">
                {relatedArticles.length === 0 ? (
                  <div className="text-sm leading-6 text-slate-500">暂无相关文章。</div>
                ) : (
                  relatedArticles.map((item) => (
                    <Link key={item.id} to={`/articles/${item.slug}`} className="block rounded-xl px-2 py-2 text-sm leading-5 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
                      {item.title}
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
        <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-sm sm:p-8">
          <MarkdownRenderer content={article.content} />
        </section>
        {headings.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[24px] border border-slate-200 bg-white/86 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">目录</div>
              <nav className="mt-3 space-y-2">
                {headings.map((heading, index) => (
                  <a
                    key={`${heading.anchor}-${index}`}
                    href={`#${heading.anchor}`}
                    onClick={(event) => scrollToHeading(event, heading.anchor)}
                    className={`block border-l-2 py-0.5 pr-2 text-sm leading-5 transition ${
                      activeHeading === heading.anchor
                        ? 'border-slate-900 text-slate-950'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'
                    } ${
                      heading.level === 3 ? 'pl-3' : ''
                    } ${
                      heading.level >= 4 ? 'pl-5 text-xs' : ''
                    }`}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>
      {headings.length > 0 && (
        <button
          type="button"
          className="fixed bottom-5 right-5 z-[75] flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-2xl lg:hidden"
          onClick={() => setIsTocOpen(true)}
          aria-label="打开目录"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      {isTocOpen && (
        <div className="fixed inset-0 z-[9991] bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setIsTocOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[72vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">目录</div>
              <button type="button" onClick={() => setIsTocOpen(false)} className="rounded-full p-2 text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {headings.map((heading, index) => (
                <a
                  key={`mobile-${heading.anchor}-${index}`}
                  href={`#${heading.anchor}`}
                  onClick={(event) => {
                    scrollToHeading(event, heading.anchor);
                    setIsTocOpen(false);
                  }}
                  className={`block rounded-xl px-3 py-2 text-sm ${
                    activeHeading === heading.anchor ? 'bg-slate-900 text-white' : 'text-slate-600'
                  } ${heading.level >= 3 ? 'ml-3' : ''}`}
                >
                  {heading.text}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {selectionPopover && (
        <div
          className="absolute z-[90] flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/96 p-1 shadow-[0_16px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl"
          style={{ top: selectionPopover.top, left: selectionPopover.left }}
        >
          <button type="button" className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => void copySelectedText()}>
            <Copy className="mr-1 inline h-3.5 w-3.5" />
            复制
          </button>
          <button type="button" className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={shareSelectedText}>
            <Share2 className="mr-1 inline h-3.5 w-3.5" />
            分享
          </button>
          <button type="button" className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={downloadSelectedTextImage}>
            <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
            图片
          </button>
        </div>
      )}
    </article>
  );
};

export default MarkdownArticlePage;
