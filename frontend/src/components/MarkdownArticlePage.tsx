import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Copy, FileText } from 'lucide-react';
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
  const headings = useMemo(() => extractHeadings(article?.content || '').slice(0, 18), [article?.content]);
  const readingMinutes = useMemo(
    () => Math.max(1, Math.ceil((article?.content.trim().length || 0) / 500)),
    [article?.content],
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        if (slug) {
          const result = await markdownArticleApi.getPublished(slug);
          if (alive) setArticle(result.article);
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
    const updateReadingState = () => {
      ticking = false;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setReadingProgress(Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)));

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
    <article className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="fixed left-0 top-0 z-[80] h-0.5 w-full bg-transparent">
        <div
          className="h-full bg-slate-900/70 transition-[width] duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/articles" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          返回文章列表
        </Link>
        <button
          type="button"
          onClick={() => void copyArticleLink()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <Copy className="h-4 w-4" />
          复制链接
        </button>
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
        </div>
        <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">{article.title}</h1>
        {article.excerpt && <p className="mt-4 text-base leading-8 text-slate-600">{article.excerpt}</p>}
      </header>
      <div className="grid justify-center gap-6 lg:grid-cols-[minmax(0,760px)_240px]">
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
    </article>
  );
};

export default MarkdownArticlePage;
