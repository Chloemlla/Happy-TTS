import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { markdownArticleApi, type MarkdownArticleSummary } from '../api/markdownArticles';

const ArticleCommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<MarkdownArticleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    if (articles.length > 0 || isLoading) return;

    setIsLoading(true);
    markdownArticleApi
      .listPublished()
      .then((result) => setArticles(result.articles || []))
      .catch(() => setArticles([]))
      .finally(() => setIsLoading(false));
  }, [articles.length, isLoading, isOpen]);

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return articles.slice(0, 8);
    return articles
      .filter((article) =>
        [article.title, article.slug, article.excerpt].some((value) => (value || '').toLowerCase().includes(normalized)),
      )
      .slice(0, 10);
  }, [articles, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9990] bg-slate-950/36 p-4 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
      <div
        className="mx-auto mt-[12vh] max-w-2xl overflow-hidden rounded-[28px] border border-white/70 bg-white/96 shadow-[0_32px_120px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索已发布文章..."
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭搜索"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {isLoading && <div className="px-4 py-8 text-center text-sm text-slate-500">正在加载文章...</div>}
          {!isLoading && filteredArticles.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">没有匹配的文章。</div>
          )}
          {filteredArticles.map((article) => (
            <button
              key={article.id}
              type="button"
              className="block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
              onClick={() => {
                setIsOpen(false);
                setQuery('');
                navigate(`/articles/${article.slug}`);
              }}
            >
              <div className="text-sm font-semibold text-slate-950">{article.title}</div>
              {article.excerpt && <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{article.excerpt}</div>}
              <div className="mt-1 font-mono text-[11px] text-slate-400">/articles/{article.slug}</div>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-2 text-xs text-slate-500">
          Ctrl/⌘ + K 打开搜索，Esc 关闭
        </div>
      </div>
    </div>
  );
};

export default ArticleCommandPalette;
