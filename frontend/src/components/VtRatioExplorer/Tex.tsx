import katex from 'katex';
import 'katex/dist/katex.min.css';
import React from 'react';

interface TexProps {
  /** 不含 $ 定界符的 LaTeX 源码 */
  tex: string;
  display?: boolean;
  className?: string;
}

/** 用仓库里已有的 KaTeX 渲染公式；出错时 KaTeX 自己降级为红色原文，不抛异常。 */
export default function Tex({ tex, display = false, className }: TexProps) {
  const html = React.useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
      }),
    [tex, display],
  );
  return (
    <span
      className={className}
      // KaTeX 输出为受控静态标记，源码全部来自本目录的常量
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
