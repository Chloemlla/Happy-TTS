import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  AlertCircle,
  CalendarDays,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileJson,
  FileText,
  Globe2,
  Lock,
  RefreshCcw,
  Share2,
  Tags,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../api/api';
import MarkdownRenderer from './MarkdownRenderer';
import Mermaid from './Mermaid';

interface ArtifactData {
  shortId: string;
  title: string;
  contentType: string;
  language?: string;
  content: string;
  description?: string;
  tags: string[];
  viewCount: number;
  createdAt: string;
  expiresAt?: string;
}

type ArtifactPayload = Partial<ArtifactData> & {
  short_id?: string;
  content_type?: string;
  view_count?: number;
  created_at?: string;
  expires_at?: string;
};

type ArtifactApiResponse = {
  success?: boolean;
  data?: ArtifactPayload;
  error?: string;
  message?: string;
};

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  html: 'html',
  markdown: 'md',
  mermaid: 'mmd',
  json: 'json',
  svg: 'svg',
  latex: 'tex',
  csv: 'csv',
  xml: 'xml',
  text: 'txt',
};

const LANGUAGE_EXTENSION: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  css: 'css',
  dart: 'dart',
  go: 'go',
  html: 'html',
  java: 'java',
  javascript: 'js',
  json: 'json',
  kotlin: 'kt',
  lua: 'lua',
  matlab: 'm',
  perl: 'pl',
  php: 'php',
  powershell: 'ps1',
  python: 'py',
  r: 'r',
  ruby: 'rb',
  rust: 'rs',
  scala: 'scala',
  shell: 'sh',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  typescript: 'ts',
  yaml: 'yaml',
};

const normalizeTags = (tags: unknown): string[] => {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === 'string') {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
};

const normalizeArtifact = (payload: ArtifactPayload): ArtifactData => {
  const contentType = String(payload.contentType ?? payload.content_type ?? 'text').toLowerCase();

  return {
    shortId: String(payload.shortId ?? payload.short_id ?? ''),
    title: String(payload.title ?? 'Untitled artifact'),
    contentType,
    language: payload.language ? String(payload.language).toLowerCase() : undefined,
    content: String(payload.content ?? ''),
    description: payload.description ? String(payload.description) : undefined,
    tags: normalizeTags(payload.tags),
    viewCount: Number(payload.viewCount ?? payload.view_count ?? 0),
    createdAt: String(payload.createdAt ?? payload.created_at ?? new Date().toISOString()),
    expiresAt: payload.expiresAt || payload.expires_at ? String(payload.expiresAt ?? payload.expires_at) : undefined,
  };
};

const getContentTypeIcon = (contentType: string) => {
  switch (contentType) {
    case 'html':
      return Globe2;
    case 'code':
      return FileCode2;
    case 'json':
      return FileJson;
    default:
      return FileText;
  }
};

const getFileExtension = (artifact: ArtifactData): string => {
  if (artifact.contentType === 'code' && artifact.language) {
    return LANGUAGE_EXTENSION[artifact.language] || 'txt';
  }

  return CONTENT_TYPE_EXTENSION[artifact.contentType] || 'txt';
};

const buildDownloadName = (artifact: ArtifactData): string => {
  const safeTitle = artifact.title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || 'artifact';
  return `${safeTitle}.${getFileExtension(artifact)}`;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const csvRows = (content: string): string[][] => {
  return content
    .trim()
    .split(/\r?\n/)
    .map((row) => row.split(',').map((cell) => cell.trim()));
};

const ArtifactSharePage: React.FC = () => {
  const { shortId } = useParams<{ shortId: string }>();
  const navigate = useNavigate();
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shared, setShared] = useState(false);

  const contentIcon = useMemo(() => {
    return getContentTypeIcon(artifact?.contentType ?? 'text');
  }, [artifact?.contentType]);
  const ContentIcon = contentIcon;

  const fetchArtifact = async (pwd?: string) => {
    if (!shortId) {
      setError('Missing artifact id');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers: Record<string, string> = {};
      if (pwd) {
        headers['X-Password'] = pwd;
      }

      const response = await api.get<ArtifactApiResponse>(
        `/api/nexai/artifacts/${encodeURIComponent(shortId)}`,
        { headers },
      );
      const payload = response.data.data;

      if (!payload) {
        throw new Error(response.data.message || 'Artifact response was empty');
      }

      setArtifact(normalizeArtifact(payload));
      setShowPasswordInput(false);
      await recordView();
    } catch (err: any) {
      const data = err?.response?.data;
      const status = err?.response?.status;

      if (status === 403 && data?.error === 'password_required') {
        setShowPasswordInput(true);
        setError(null);
        return;
      }

      if (status === 403 && data?.error === 'invalid_password') {
        setShowPasswordInput(true);
        setError('Password is incorrect');
        return;
      }

      setError(data?.message || err.message || 'Unable to load this artifact');
    } finally {
      setLoading(false);
    }
  };

  const recordView = async () => {
    if (!shortId) return;

    try {
      await api.post(`/api/nexai/artifacts/${encodeURIComponent(shortId)}/view`, {
        referer: document.referrer,
        user_agent: navigator.userAgent,
      });
    } catch {
      // View tracking must not block rendering.
    }
  };

  useEffect(() => {
    void fetchArtifact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortId]);

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.trim()) {
      void fetchArtifact(password.trim());
    }
  };

  const handleCopy = async () => {
    if (!artifact) return;

    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!artifact) return;

    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildDownloadName(artifact);
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 2000);
  };

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: artifact?.title || 'NexAI Artifact',
          url,
        });
        return;
      } catch {
        // Fall through to clipboard when the native share sheet is cancelled or unavailable.
      }
    }

    await navigator.clipboard.writeText(url);
    setShared(true);
    window.setTimeout(() => setShared(false), 2000);
  };

  const renderContent = () => {
    if (!artifact) return null;

    switch (artifact.contentType) {
      case 'html':
        return (
          <iframe
            title={`${artifact.title} preview`}
            srcDoc={artifact.content}
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            referrerPolicy="no-referrer"
            className="h-[72vh] min-h-[560px] w-full border-0 bg-white"
          />
        );

      case 'svg':
        return (
          <div
            className="flex min-h-[560px] w-full items-center justify-center bg-white p-4 [&>svg]:max-h-[520px] [&>svg]:max-w-full"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(artifact.content, { USE_PROFILES: { svg: true, svgFilters: true } }),
            }}
          />
        );

      case 'markdown':
        return (
          <div className="bg-white p-6 text-slate-900 sm:p-8">
            <MarkdownRenderer content={artifact.content} />
          </div>
        );

      case 'mermaid':
        return (
          <div className="bg-white p-6 sm:p-8">
            <Mermaid code={artifact.content} />
          </div>
        );

      case 'json':
        return renderHighlightedCode(artifact, 'json', safeFormatJson(artifact.content));

      case 'xml':
        return renderHighlightedCode(artifact, 'xml', artifact.content);

      case 'latex':
        return renderHighlightedCode(artifact, 'latex', artifact.content);

      case 'csv':
        return renderCsv(artifact.content);

      case 'code':
        return renderHighlightedCode(artifact, artifact.language || 'text', artifact.content);

      case 'text':
      default:
        return (
          <pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-words bg-white p-6 font-mono text-sm leading-7 text-slate-800 sm:p-8">
            {artifact.content}
          </pre>
        );
    }
  };

  if (loading) {
    return (
      <ArtifactStateShell>
        <RefreshCcw className="h-8 w-8 animate-spin text-slate-500" aria-hidden="true" />
        <h1 className="mt-5 text-xl font-semibold text-slate-950">Loading artifact</h1>
      </ArtifactStateShell>
    );
  }

  if (showPasswordInput) {
    return (
      <ArtifactStateShell>
        <Lock className="h-9 w-9 text-slate-700" aria-hidden="true" />
        <h1 className="mt-5 text-xl font-semibold text-slate-950">Password required</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">This artifact is protected.</p>
        <form onSubmit={handlePasswordSubmit} className="mt-6 w-full max-w-sm space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            autoFocus
          />
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Unlock
          </button>
        </form>
      </ArtifactStateShell>
    );
  }

  if (error || !artifact) {
    return (
      <ArtifactStateShell>
        <AlertCircle className="h-9 w-9 text-red-500" aria-hidden="true" />
        <h1 className="mt-5 text-xl font-semibold text-slate-950">Artifact unavailable</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          {error || 'This artifact does not exist or has expired.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        >
          Back to Synapse
        </button>
      </ArtifactStateShell>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <ContentIcon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1 className="break-words text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                    {artifact.title}
                  </h1>
                  {artifact.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {artifact.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <MetadataPill>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {artifact.contentType}
                </MetadataPill>
                {artifact.language && (
                  <MetadataPill>
                    <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {artifact.language}
                  </MetadataPill>
                )}
                <MetadataPill>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {artifact.viewCount} views
                </MetadataPill>
                <MetadataPill>
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(artifact.createdAt)}
                </MetadataPill>
              </div>

              {artifact.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {artifact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                    >
                      <Tags className="h-3 w-3" aria-hidden="true" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 lg:w-40 lg:grid-cols-1">
              <ActionButton active={copied} label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
                <Copy className="h-4 w-4" aria-hidden="true" />
              </ActionButton>
              <ActionButton active={downloaded} label={downloaded ? 'Saved' : 'Download'} onClick={handleDownload}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </ActionButton>
              <ActionButton active={shared} label={shared ? 'Link copied' : 'Share'} onClick={handleShare}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </ActionButton>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {renderContent()}
        </main>

        <footer className="py-5 text-center text-xs text-slate-500">
          Powered by NexAI Artifacts
        </footer>
      </div>
    </div>
  );
};

const ArtifactStateShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-center">
    <div className="flex w-full max-w-md flex-col items-center rounded-lg border border-slate-200 bg-white px-6 py-8 shadow-sm">
      {children}
    </div>
  </div>
);

const MetadataPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
    {children}
  </span>
);

const ActionButton: React.FC<{
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
}> = ({ active, children, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
      active
        ? 'bg-emerald-600 text-white focus-visible:ring-emerald-400'
        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300'
    }`}
  >
    {children}
    <span className="truncate">{label}</span>
  </button>
);

const renderHighlightedCode = (artifact: ArtifactData, language: string, content: string) => (
  <SyntaxHighlighter
    language={language}
    style={vscDarkPlus}
    showLineNumbers
    wrapLongLines
    customStyle={{
      margin: 0,
      minHeight: '560px',
      maxHeight: '72vh',
      overflow: 'auto',
      borderRadius: 0,
      padding: '1.5rem',
      fontSize: '14px',
      lineHeight: '1.6',
    }}
    codeTagProps={{ 'aria-label': `${artifact.title} source` }}
  >
    {content}
  </SyntaxHighlighter>
);

const renderCsv = (content: string) => {
  const rows = csvRows(content);
  const [header = [], ...body] = rows;

  return (
    <div className="max-h-[72vh] overflow-auto bg-white p-4">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {header.map((cell, index) => (
              <th key={`${cell}-${index}`} className="border border-slate-200 px-3 py-2 font-semibold text-slate-700">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="border border-slate-200 px-3 py-2 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const safeFormatJson = (content: string): string => {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
};

export default ArtifactSharePage;
