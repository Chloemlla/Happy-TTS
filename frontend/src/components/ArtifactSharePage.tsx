import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import getApiBaseUrl from '../api';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/base16/darcula.css';

// 配置 marked 和代码高亮
marked.use({
  async: true,
  pedantic: false,
  gfm: true,
});

// 高亮扩展
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'shell';
    return hljs.highlight(code, { language }).value;
  }
}));

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
  const [renderedMarkdown, setRenderedMarkdown] = useState<string>('');

  useEffect(() => {
    if (shortId) {
      fetchArtifact();
    }
  }, [shortId]);

  // 渲染 Markdown
  useEffect(() => {
    if (artifact && artifact.contentType === 'markdown') {
      marked.parse(artifact.content, { async: true }).then((html: string) => {
        setRenderedMarkdown(DOMPurify.sanitize(html));
      });
    }
  }, [artifact]);

  const fetchArtifact = async (pwd?: string) => {
    try {
      setLoading(true);
      setError(null);

      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (pwd) {
        headers['X-Password'] = pwd;
      }

      const response = await fetch(`${getApiBaseUrl()}/api/nexai/artifacts/${shortId}`, {
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'password_required') {
          setShowPasswordInput(true);
          setLoading(false);
          return;
        }
        if (data.error === 'invalid_password') {
          setError('密码错误');
          setLoading(false);
          return;
        }
        throw new Error(data.message || '获取失败');
      }

      setArtifact(data.data);
      setShowPasswordInput(false);

      // 记录访问
      recordView();
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const recordView = async () => {
    try {
      await fetch(`${getApiBaseUrl()}/api/nexai/artifacts/${shortId}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referer: document.referrer,
          user_agent: navigator.userAgent,
        }),
      });
    } catch (err) {
      // 忽略错误
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) {
      fetchArtifact(password);
    }
  };

  const handleCopy = async () => {
    if (artifact) {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (artifact) {
      const blob = new Blob([artifact.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artifact.title}.${getFileExtension(artifact.contentType, artifact.language)}`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: artifact?.title,
          url,
        });
      } catch (err) {
        // 用户取消分享
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  const getFileExtension = (contentType: string, language?: string): string => {
    if (contentType === 'code' && language) {
      const extMap: Record<string, string> = {
        javascript: 'js',
        typescript: 'ts',
        python: 'py',
        java: 'java',
        cpp: 'cpp',
        c: 'c',
        go: 'go',
        rust: 'rs',
        html: 'html',
        css: 'css',
      };
      return extMap[language] || 'txt';
    }
    if (contentType === 'html') return 'html';
    if (contentType === 'markdown') return 'md';
    if (contentType === 'mermaid') return 'mmd';
    return 'txt';
  };

  const getContentTypeIcon = (contentType: string) => {
    const icons: Record<string, string> = {
      code: '💻',
      html: '🌐',
      markdown: '📝',
      mermaid: '📊',
      text: '📄',
    };
    return icons[contentType] || '📄';
  };

  const renderContent = () => {
    if (!artifact) return null;

    switch (artifact.contentType) {
      case 'html':
        return (
          <div className="artifact-html-content rounded-xl overflow-hidden shadow-lg">
            <iframe
              srcDoc={DOMPurify.sanitize(artifact.content)}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-[600px] border-0 bg-white"
            />
          </div>
        );

      case 'code':
        return (
          <div className="artifact-code-content rounded-xl overflow-hidden shadow-2xl">
            <SyntaxHighlighter
              language={artifact.language || 'text'}
              style={vscDarkPlus}
              showLineNumbers
              wrapLines
              customStyle={{
                margin: 0,
                borderRadius: '0.75rem',
                padding: '1.5rem',
                fontSize: '14px',
                lineHeight: '1.6',
              }}
            >
              {artifact.content}
            </SyntaxHighlighter>
          </div>
        );

      case 'markdown':
        return (
          <div
            className="artifact-markdown-content prose prose-lg prose-slate max-w-none dark:prose-invert
                       bg-white dark:bg-gray-800 rounded-xl p-8 shadow-xl
                       prose-headings:font-bold prose-a:text-blue-600 hover:prose-a:text-blue-500
                       prose-code:text-pink-600 prose-code:bg-pink-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                       prose-pre:bg-gray-900 prose-pre:shadow-lg"
            dangerouslySetInnerHTML={{
              __html: renderedMarkdown,
            }}
          />
        );

      case 'mermaid':
        return (
          <div className="artifact-mermaid-content bg-white rounded-xl p-8 shadow-xl">
            <pre className="mermaid text-center">{artifact.content}</pre>
          </div>
        );

      default:
        return (
          <pre className="artifact-text-content bg-gray-900 text-gray-100 rounded-xl p-6 shadow-xl overflow-x-auto">
            {artifact.content}
          </pre>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-indigo-600 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="mt-6 text-lg text-gray-700 font-medium animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  if (showPasswordInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform transition-all hover:scale-105">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mb-4">
              <span className="text-3xl">🔒</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">需要密码</h2>
            <p className="text-gray-600">此内容受密码保护</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                autoFocus
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-shake">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-medium
                         hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all shadow-lg hover:shadow-xl"
            >
              解锁内容
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6 animate-bounce">😕</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">出错了</h2>
          <p className="text-gray-600 mb-8 text-lg">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium
                       hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all shadow-lg"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6 animate-pulse">🔍</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">未找到</h2>
          <p className="text-gray-600 mb-8 text-lg">内容不存在或已过期</p>
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium
                       hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all shadow-lg"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* 装饰性背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Card */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-6 sm:p-8 mb-6 border border-white/20">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Left: Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">{getContentTypeIcon(artifact.contentType)}</span>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 truncate">{artifact.title}</h1>
              </div>

              <div className="flex flex-wrap gap-3 text-sm mb-4">
                <span className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full font-medium shadow-md">
                  {artifact.contentType}
                </span>
                {artifact.language && (
                  <span className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-full font-medium shadow-md">
                    {artifact.language}
                  </span>
                )}
                <span className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-full font-medium">
                  👁️ {artifact.viewCount} 次查看
                </span>
                <span className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-full font-medium">
                  📅 {new Date(artifact.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>

              {artifact.description && (
                <p className="text-gray-700 text-base leading-relaxed mb-4 bg-gray-50 rounded-lg p-4">
                  {artifact.description}
                </p>
              )}

              {artifact.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {artifact.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 bg-white border border-gray-200 text-gray-600 text-sm rounded-full hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex lg:flex-col gap-3">
              <button
                onClick={handleCopy}
                className={`flex-1 lg:flex-none px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg
                  ${copied
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                  }`}
                title="复制内容"
              >
                {copied ? '✓ 已复制' : '📋 复制'}
              </button>
              <button
                onClick={handleDownload}
                className={`flex-1 lg:flex-none px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg
                  ${downloaded
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                  }`}
                title="下载"
              >
                {downloaded ? '✓ 已下载' : '⬇️ 下载'}
              </button>
              <button
                onClick={handleShare}
                className={`flex-1 lg:flex-none px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg
                  ${shared
                    ? 'bg-green-500 text-white'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                  }`}
                title="分享"
              >
                {shared ? '✓ 已复制链接' : '🔗 分享'}
              </button>
            </div>
          </div>
        </div>

        {/* Content Card */}
        <div className="rounded-2xl shadow-2xl overflow-hidden">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-sm mb-2">
            Created with{' '}
            <a href="/" className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-colors">
              Happy TTS
            </a>
          </p>
          <p className="text-gray-500 text-xs">Powered by NexAI Artifacts ✨</p>
        </div>
      </div>

      {/* 添加自定义动画 */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
};

export default ArtifactSharePage;
