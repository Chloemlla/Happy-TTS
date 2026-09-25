import React, { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import {
  studioModalCardClassName,
  studioModalOverlayClassName,
  studioSubPanelClassName,
  studioSurfaceClassName,
} from './studioTheme';

interface MermaidProps {
  code: string;
}

const SUPPORTED_MERMAID_PREFIX =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|zenuml|sankey)/i;

// G12-04/G12-05：模块级只初始化一次。
// securityLevel 用默认的 'strict'，禁用 mermaid 的 click 指令与原始 HTML 标签注入；
// flowchart 关闭 htmlLabels，让标签输出原生 <text>，避免 DOMPurify 消毒把 foreignObject 里的文字剥掉。
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
  fontFamily: 'inherit',
  flowchart: { htmlLabels: false },
});

function normalizeMermaidCode(input: string): string {
  return (input || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g, '-')
    .replace(/\n\s*--[!>]*>/g, ' -->')
    .trim();
}

const Mermaid: React.FC<MermaidProps> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const diagramId = useMemo(
    () => `mermaid-${Math.random().toString(36).slice(2, 10)}`,
    []
  );

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      const normalizedCode = normalizeMermaidCode(code);

      setIsRendering(true);
      setError(false);
      setSvg(null);

      if (!normalizedCode) {
        setError(true);
        setIsRendering(false);
        return;
      }

      const candidates = [normalizedCode];
      if (!SUPPORTED_MERMAID_PREFIX.test(normalizedCode)) {
        candidates.push(`graph TD\n${normalizedCode}`);
      }

      try {
        let renderedSvg: string | null = null;
        for (const candidate of candidates) {
          try {
            const result = await mermaid.render(
              `${diagramId}-${candidates.indexOf(candidate)}`,
              candidate
            );
            renderedSvg = result.svg;
            break;
          } catch {
            renderedSvg = null;
          }
        }

        if (!renderedSvg) {
          throw new Error('Unable to render Mermaid diagram');
        }

        if (cancelled) {
          return;
        }

        setSvg(
          DOMPurify.sanitize(renderedSvg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ['foreignObject'],
          })
        );
      } catch (renderError) {
        console.error('[Mermaid] render failed:', renderError);
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (copyError) {
      console.error('[Mermaid] copy failed:', copyError);
    }
  };

  const handleZoom = () => {
    if (!svg) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = `${studioModalOverlayClassName} cursor-pointer`;

    const container = document.createElement('div');
    container.className = `${studioModalCardClassName} max-h-[95%] max-w-[95%] overflow-auto`;
    container.innerHTML = svg;

    modal.appendChild(container);
    document.body.appendChild(modal);

    const close = () => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    };

    modal.onclick = close;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          close();
        }
      },
      { once: true }
    );
  };

  if (isRendering) {
    return (
      <div className={`${studioSubPanelClassName} flex flex-col items-center justify-center gap-3`}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
        <span className="text-sm text-slate-500">正在渲染图表...</span>
      </div>
    );
  }

  if (error || !svg) {
    return (
      <div className="rounded-lg border border-rose-100 bg-rose-50 p-4">
        <div className="mb-2 font-medium text-rose-800">图表渲染失败</div>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            复制原始代码
          </button>
        </div>
        <pre className="overflow-x-auto rounded border border-rose-200 bg-white/50 p-2 font-mono text-xs text-rose-900">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={`${studioSurfaceClassName} group my-4 cursor-zoom-in p-4`}
      onClick={handleZoom}
    >
      <div
        className="mermaid-svg flex max-h-[600px] justify-center overflow-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="pointer-events-none absolute right-2 top-2 rounded border border-slate-100 bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
        点击放大
      </div>
    </div>
  );
};

export default Mermaid;
