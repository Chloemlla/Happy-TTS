import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Copy, Eye, Link2, ListFilter, Plus, Save, Search, Send, Sigma, Table2, Trash2 } from 'lucide-react';
import { FaRegFileAlt } from 'react-icons/fa';
import { markdownArticleApi, type MarkdownArticle, type MarkdownArticleSummary } from '../api/markdownArticles';
import MarkdownRenderer, { copyTextToClipboard } from './MarkdownRenderer';
import { useNotification } from './Notification';
import {
  InfoBadge,
  InfoPanel,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logSharePrimaryButtonClass,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from './LogShareStyleScaffold';

const starterMarkdown = `# 新文章

这里编写 Markdown 内容，支持 GFM 表格、任务列表、代码块、Mermaid 和 LaTeX。

## 数学公式

行内公式：$E = mc^2$

块级公式：

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## 代码

\`\`\`ts
const message = 'Hello Markdown';
console.log(message);
\`\`\`
`;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 100);
}

function getPublicUrl(slug: string): string {
  if (!slug) return '';
  return `${window.location.origin}/articles/${slug}`;
}

const emptyArticle: MarkdownArticle = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  content: starterMarkdown,
  status: 'draft',
};

const localDraftKey = 'synapse-markdown-article-editor-draft';

const snippets = [
  {
    label: '表格',
    icon: Table2,
    text: '\n| 列 A | 列 B |\n| --- | --- |\n| 内容 | 内容 |\n',
  },
  {
    label: '代码',
    icon: Code2,
    text: '\n```ts\n// code here\n```\n',
  },
  {
    label: '公式',
    icon: Sigma,
    text: '\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n',
  },
  {
    label: 'Mermaid',
    icon: ListFilter,
    text: '\n```mermaid\ngraph TD\n  A[开始] --> B[发布]\n```\n',
  },
];

const MarkdownArticleManager: React.FC = () => {
  const [articles, setArticles] = useState<MarkdownArticleSummary[]>([]);
  const [current, setCurrent] = useState<MarkdownArticle>(emptyArticle);
  const [isPreview, setIsPreview] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const { setNotification } = useNotification();

  const publicUrl = useMemo(() => getPublicUrl(current.slug), [current.slug]);
  const wordCount = useMemo(() => current.content.trim().length, [current.content]);
  const hasEditorContent = Boolean(current.title || current.slug || current.excerpt || current.content !== starterMarkdown);
  const stats = useMemo(
    () => ({
      total: articles.length,
      published: articles.filter((article) => article.status === 'published').length,
      draft: articles.filter((article) => article.status !== 'published').length,
    }),
    [articles],
  );
  const filteredArticles = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return articles.filter((article) => {
      if (statusFilter !== 'all' && article.status !== statusFilter) return false;
      if (!query) return true;
      return [article.title, article.slug, article.excerpt].some((value) => (value || '').toLowerCase().includes(query));
    });
  }, [articles, searchText, statusFilter]);

  const loadArticles = async () => {
    setIsLoading(true);
    try {
      const result = await markdownArticleApi.listAdmin();
      setArticles(result.articles || []);
    } catch (error: any) {
      setNotification({ type: 'error', message: error?.response?.data?.message || '文章列表加载失败' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadArticles();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(localDraftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<MarkdownArticle>;
      if (!draft.id && (draft.title || draft.content)) {
        setCurrent((prev) => ({ ...prev, ...draft, status: 'draft' }));
      }
    } catch {
      localStorage.removeItem(localDraftKey);
    }
  }, []);

  useEffect(() => {
    try {
      if (!current.id && hasEditorContent) {
        localStorage.setItem(localDraftKey, JSON.stringify(current));
      } else if (current.id) {
        localStorage.removeItem(localDraftKey);
      }
    } catch {
      // Ignore local draft persistence failures.
    }
  }, [current, hasEditorContent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveArticle('draft');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const updateField = (key: keyof MarkdownArticle, value: string) => {
    setCurrent((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (value: string) => {
    setCurrent((prev) => ({
      ...prev,
      title: value,
      slug: prev.id || prev.slug ? prev.slug : slugify(value),
    }));
  };

  const resetEditor = () => {
    setCurrent({ ...emptyArticle, content: starterMarkdown });
    setIsPreview(true);
    localStorage.removeItem(localDraftKey);
  };

  const selectArticle = async (article: MarkdownArticleSummary) => {
    setIsLoading(true);
    try {
      const result = await markdownArticleApi.getAdmin(article.id);
      setCurrent(result.article);
      setIsPreview(true);
    } catch (error: any) {
      setNotification({ type: 'error', message: error?.response?.data?.message || '文章加载失败' });
    } finally {
      setIsLoading(false);
    }
  };

  const insertSnippet = (text: string) => {
    const textarea = editorRef.current;
    if (!textarea) {
      updateField('content', `${current.content}${text}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextContent = `${current.content.slice(0, start)}${text}${current.content.slice(end)}`;
    updateField('content', nextContent);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const saveArticle = async (status: 'draft' | 'published' = current.status) => {
    if (!current.title.trim() || !current.content.trim()) {
      setNotification({ type: 'warning', message: '标题和 Markdown 内容不能为空' });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: current.title,
        slug: current.slug || slugify(current.title),
        excerpt: current.excerpt,
        content: current.content,
        status,
      };
      const result = current.id
        ? await markdownArticleApi.update(current.id, payload)
        : await markdownArticleApi.create(payload);

      setCurrent(result.article);
      localStorage.removeItem(localDraftKey);
      await loadArticles();
      setNotification({ type: 'success', message: status === 'published' ? '文章已发布' : '文章已保存' });
    } catch (error: any) {
      setNotification({ type: 'error', message: error?.response?.data?.message || '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async (article: MarkdownArticleSummary) => {
    setIsSaving(true);
    try {
      const nextStatus = article.status === 'published' ? 'draft' : 'published';
      const result = await markdownArticleApi.setStatus(article.id, nextStatus);
      if (current.id === article.id) setCurrent(result.article);
      await loadArticles();
      setNotification({ type: 'success', message: nextStatus === 'published' ? '文章已发布' : '文章已下线' });
    } catch (error: any) {
      setNotification({ type: 'error', message: error?.response?.data?.message || '状态更新失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteArticle = async (article: MarkdownArticleSummary) => {
    if (!window.confirm(`确认删除「${article.title}」？`)) return;
    setIsSaving(true);
    try {
      await markdownArticleApi.remove(article.id);
      if (current.id === article.id) resetEditor();
      await loadArticles();
      setNotification({ type: 'success', message: '文章已删除' });
    } catch (error: any) {
      setNotification({ type: 'error', message: error?.response?.data?.message || '删除失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const copyPublicLink = async () => {
    if (!publicUrl) return;
    const copied = await copyTextToClipboard(publicUrl);
    setNotification({ type: copied ? 'success' : 'error', message: copied ? '公开链接已复制' : '复制失败' });
  };

  return (
    <div className="space-y-5">
      <InfoSectionTitle
        title="Markdown 文章发布"
        description="编辑 Markdown 原文，实时预览完整语法效果，并发布生成对外查看链接。"
        icon={FaRegFileAlt}
        action={
          <button type="button" className={logShareSecondaryButtonClass} onClick={resetEditor}>
            <Plus className="h-4 w-4" />
            新建文章
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <InfoPanel compact>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">文章列表</div>
              <div className="mt-1 text-xs text-slate-500">
                已发布 {stats.published} · 草稿 {stats.draft}
              </div>
            </div>
            <InfoBadge>{stats.total} 篇</InfoBadge>
          </div>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${logShareInputClass} py-2 pl-9`}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索标题、slug、摘要"
            />
          </label>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ['all', '全部'],
              ['published', '已发布'],
              ['draft', '草稿'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key as typeof statusFilter)}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  statusFilter === key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white/80 text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
            {isLoading && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">正在加载...</div>}
            {!isLoading && filteredArticles.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">没有匹配的文章。</div>
            )}
            {filteredArticles.map((article) => (
              <div key={article.id} className={`${logShareTileClass} p-3`}>
                <button type="button" className="w-full text-left" onClick={() => void selectArticle(article)}>
                  <div className="line-clamp-2 text-sm font-semibold text-slate-900">{article.title}</div>
                  <div className="mt-1 break-all font-mono text-[11px] text-slate-500">/{article.slug}</div>
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <InfoBadge tone={article.status === 'published' ? 'emerald' : 'slate'}>
                    {article.status === 'published' ? '已发布' : '草稿'}
                  </InfoBadge>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    onClick={() => void togglePublish(article)}
                    disabled={isSaving}
                  >
                    {article.status === 'published' ? '下线' : '发布'}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => void deleteArticle(article)}
                    disabled={isSaving}
                    title="删除文章"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </InfoPanel>

        <div className="space-y-5">
          <InfoPanel>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">标题</span>
                <input
                  className={logShareInputClass}
                  value={current.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder="输入文章标题"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Slug</span>
                <input
                  className={`${logShareInputClass} font-mono`}
                  value={current.slug}
                  onChange={(event) => updateField('slug', slugify(event.target.value))}
                  placeholder="article-slug"
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">摘要</span>
              <textarea
                className={`${logShareInputClass} min-h-[82px] resize-y`}
                value={current.excerpt}
                onChange={(event) => updateField('excerpt', event.target.value)}
                placeholder="可选，用于文章列表和分享预览"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={logSharePrimaryButtonClass} onClick={() => void saveArticle('draft')} disabled={isSaving}>
                <Save className="h-4 w-4" />
                保存草稿
              </button>
              <button type="button" className={logSharePrimaryButtonClass} onClick={() => void saveArticle('published')} disabled={isSaving}>
                <Send className="h-4 w-4" />
                发布文章
              </button>
              <button type="button" className={logShareSecondaryButtonClass} onClick={() => setIsPreview((value) => !value)}>
                <Eye className="h-4 w-4" />
                {isPreview ? '隐藏预览' : '显示预览'}
              </button>
              <button type="button" className={logShareSecondaryButtonClass} onClick={() => void copyPublicLink()} disabled={!current.slug}>
                <Copy className="h-4 w-4" />
                复制链接
              </button>
              {current.status === 'published' && current.slug && (
                <a className={logShareSecondaryButtonClass} href={`/articles/${current.slug}`} target="_blank" rel="noreferrer">
                  <Link2 className="h-4 w-4" />
                  打开
                </a>
              )}
              {current.id && (
                <button type="button" className={logShareDangerButtonClass} onClick={() => void deleteArticle(current)} disabled={isSaving}>
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>状态：{current.status === 'published' ? '已发布' : '草稿'}</span>
              <span>字符数：{wordCount}</span>
              <span>预计阅读：{Math.max(1, Math.ceil(wordCount / 500))} 分钟</span>
              {publicUrl && <span className="break-all">公开链接：{publicUrl}</span>}
            </div>
          </InfoPanel>

          <div className={`grid gap-5 ${isPreview ? 'xl:grid-cols-2' : ''}`}>
            <InfoPanel compact>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {snippets.map((snippet) => {
                  const Icon = snippet.icon;
                  return (
                    <button
                      key={snippet.label}
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                      onClick={() => insertSnippet(snippet.text)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {snippet.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                ref={editorRef}
                className="min-h-[620px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:ring-2 focus:ring-slate-300"
                value={current.content}
                onChange={(event) => updateField('content', event.target.value)}
                spellCheck={false}
              />
            </InfoPanel>
            {isPreview && (
              <InfoPanel compact>
                <div className="min-h-[620px] overflow-x-auto rounded-2xl bg-white p-5">
                  <MarkdownRenderer content={current.content || ''} />
                </div>
              </InfoPanel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkdownArticleManager;
