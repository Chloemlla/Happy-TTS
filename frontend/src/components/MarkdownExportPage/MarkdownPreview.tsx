import React from 'react';
import { FaEye } from 'react-icons/fa';
import { studioSurfaceClassName } from '../studioTheme';

interface Props {
  html: string;
  isKatexLoaded: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
}

const MarkdownPreview: React.FC<Props> = ({ html, isKatexLoaded, previewRef }) => {
  return (
    <div className={studioSurfaceClassName}>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-4">
        <div className="flex items-center gap-2">
          <FaEye className="text-lg" />
          <h3 className="text-lg font-semibold">实时预览</h3>
        </div>
      </div>
      <div className="p-4">
        <div
          ref={previewRef}
          className="h-64 overflow-y-auto border border-slate-300 rounded-2xl p-4 bg-white prose prose-sm max-w-none sm:h-96"
          style={{
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          } as React.CSSProperties}
        >
          {isKatexLoaded ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-2"></div>
                <p>正在加载数学公式渲染器...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkdownPreview;
