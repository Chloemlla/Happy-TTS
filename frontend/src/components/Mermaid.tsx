import React, { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

interface MermaidProps {
  code: string;
}

const SUPPORTED_MERMAID_PREFIX =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|zenuml|sankey)/i;

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
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'default',
          fontFamily: 'inherit',
        });

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
    modal.className =
      'fixed inset-0 z-[9999] flex cursor-pointer items-center justify-center bg-black/80 p-4';

    const container = document.createElement('div');
    container.className =
      'max-h-[95%] max-w-[95%] overflow-auto rounded-lg bg-white p-4 shadow-2xl';
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-sm text-gray-500">正在渲染图表...</span>
      </div>
    );
  }

  if (error || !svg) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-4">
        <div className="mb-2 font-medium text-red-800">图表渲染失败</div>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
          >
            复制原始代码
          </button>
        </div>
        <pre className="overflow-x-auto rounded border border-red-200 bg-white/50 p-2 font-mono text-xs text-red-900">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="group relative my-4 cursor-zoom-in overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      onClick={handleZoom}
    >
      <div
        className="mermaid-svg flex max-h-[600px] justify-center overflow-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="pointer-events-none absolute right-2 top-2 rounded border border-gray-100 bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-500 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
        点击放大
      </div>
    </div>
  );
};

export default Mermaid;
