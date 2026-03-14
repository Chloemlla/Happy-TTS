import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import getApiBaseUrl from '../api';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { marked } from 'marked';

// 配置 marked
marked.use({
  async: true,
  pedantic: false,
  gfm: true,
  mangle: false,
  headerIds: false,
});

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

  const handleCopy = () => {
    if (artifact) {
      navigator.clipboard.writeText(artifact.content);
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
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: artifact?.title,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert('链接已复制到剪贴板');
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

  const renderContent = () => {
    if (!artifact) return null;

    switch (artifact.contentType) {
      case 'html':
        return (
          <div className="artifact-html-content">
            <iframe
              srcDoc={DOMPurify.sanitize(artifact.content)}
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: '100%',
                height: '600px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
          </div>
        );

      case 'code':
        return (
          <div className="artifact-code-content">
            <SyntaxHighlighter
              language={artifact.language || 'text'}
              style={vscDarkPlus}
              showLineNumbers
              wrapLines
              customStyle={{
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '14px',
              }}
            >
              {artifact.content}
            </SyntaxHighlighter>
          </div>
        );

      case 'markdown':
        return (
          <div
            className="artifact-markdown-content prose prose-slate max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{
              __html: renderedMarkdown,
            }}
          />
        );

      case 'mermaid':
        return (
          <div className="artifact-mermaid-content">
            <pre className="mermaid">{artifact.content}</pre>
          </div>
        );

      default:
        return (
          <pre className="artifact-text-content">
            {artifact.content}
          </pre>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (showPasswordInput) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">需要密码</h2>
          <p className="text-gray-600 mb-4">此 Artifact 受密码保护</p>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              提交
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold mb-2">出错了</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold mb-2">未找到</h2>
          <p className="text-gray-600 mb-4">Artifact 不存在或已过期</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{artifact.title}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {artifact.contentType}
                </span>
                {artifact.language && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
                    {artifact.language}
                  </span>
                )}
                <span>{artifact.viewCount} 次查看</span>
                <span>{new Date(artifact.createdAt).toLocaleDateString()}</span>
              </div>
              {artifact.description && (
                <p className="mt-3 text-gray-700">{artifact.description}</p>
              )}
              {artifact.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {artifact.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2"
                title="复制内容"
              >
                {copied ? '✓ 已复制' : '📋 复制'}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2"
                title="下载"
              >
                ⬇️ 下载
              </button>
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
                title="分享"
              >
                🔗 分享
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-md p-6">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-600 text-sm">
          <p>
            Created with{' '}
            <a href="/" className="text-blue-600 hover:underline">
              Happy TTS
            </a>
          </p>
          <p className="mt-1">Powered by NexAI Artifacts</p>
        </div>
      </div>
    </div>
  );
};

export default ArtifactSharePage;
