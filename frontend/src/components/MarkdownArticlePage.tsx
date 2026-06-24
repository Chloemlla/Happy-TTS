import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, FileText } from 'lucide-react';
import { markdownArticleApi, type MarkdownArticle } from '../api/markdownArticles';
import MarkdownRenderer from './MarkdownRenderer';

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

const MarkdownArticlePage: React.FC = () => {
  const { slug = '' } = useParams();
  const [article, setArticle] = useState<MarkdownArticle | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const result = await markdownArticleApi.getPublished(slug);
        if (alive) setArticle(result.article);
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

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500 shadow-sm">
          正在加载文章...
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-[28px] border border-rose-100 bg-white/90 p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">文章不可访问</h1>
          <p className="mt-3 text-sm text-slate-600">{error || '文章不存在或尚未发布'}</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>
      <header className="mb-8 border-b border-slate-200 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDate(article.publishedAt)}
        </div>
        <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">{article.title}</h1>
        {article.excerpt && <p className="mt-4 text-base leading-8 text-slate-600">{article.excerpt}</p>}
      </header>
      <section className="rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-sm sm:p-8">
        <MarkdownRenderer content={article.content} />
      </section>
    </article>
  );
};

export default MarkdownArticlePage;
