import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaCopy,
  FaEye,
  FaFileAlt,
  FaFilePdf,
  FaFileWord,
  FaTrash,
  FaUpload,
} from 'react-icons/fa';
import { Document, HeadingLevel, Packer, Paragraph, TextRun, UnderlineType } from 'docx';
import MarkdownRenderer from './MarkdownRenderer';
import { exportToPdf as exportPdfUtil } from './MarkdownExportPage/pdfExport';

const DEFAULT_MARKDOWN = `# 示例文档

## 介绍
这里可以编写 Markdown 内容，并实时预览最终效果。

## 支持能力
- GitHub Flavored Markdown
- KaTeX 数学公式
- 代码高亮
- Mermaid 图表

## 代码示例
\`\`\`typescript
function greet(name: string) {
  return \`Hello, \${name}\`;
}
\`\`\`

## 数学公式
行内公式：$E = mc^2$

块级公式：
$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## 表格
| 列 1 | 列 2 |
| --- | --- |
| 数据 A | 数据 B |

> 这是一段引用文本。`;

type RunFormatting = {
  bold?: boolean;
  italics?: boolean;
  font?: string;
  size?: number;
  color?: string;
  underline?: {
    color?: string;
    type?: typeof UnderlineType.SINGLE;
  };
};

function replaceMathWithPlaceholders(markdown: string): string {
  return markdown
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, formula: string) => `[BLOCK_MATH]${formula.trim()}[/BLOCK_MATH]`)
    .replace(/\$([^$\n]+)\$/g, (_, formula: string) => `[INLINE_MATH]${formula.trim()}[/INLINE_MATH]`);
}

function topLevelText(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => node.textContent || '')
    .join('')
    .trim();
}

const MarkdownExportPage: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [markdownContent, setMarkdownContent] = useState(DEFAULT_MARKDOWN);
  const [docxSourceMarkdown, setDocxSourceMarkdown] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);

  const exportToDocx = async () => {
    setIsExporting(true);

    try {
      const processedMarkdown = replaceMathWithPlaceholders(markdownContent);
      setDocxSourceMarkdown(processedMarkdown);

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = docxPreviewRef.current?.innerHTML || '';

      const processNode = (node: Node, formatting: RunFormatting = {}): TextRun[] => {
        if (node.nodeType === Node.TEXT_NODE) {
          let textContent = node.textContent || '';

          textContent = textContent.replace(
            /\[INLINE_MATH\]([\s\S]*?)\[\/INLINE_MATH\]/g,
            (_, formula: string) => `[行内公式: $${formula}$]`
          );
          textContent = textContent.replace(
            /\[BLOCK_MATH\]([\s\S]*?)\[\/BLOCK_MATH\]/g,
            (_, formula: string) => `[块级公式: $$${formula}$$]`
          );

          return textContent.trim() ? [new TextRun({ text: textContent, ...formatting })] : [];
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return [];
        }

        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        switch (tagName) {
          case 'strong':
          case 'b':
            return Array.from(element.childNodes).flatMap((child) =>
              processNode(child, { ...formatting, bold: true })
            );
          case 'em':
          case 'i':
            return Array.from(element.childNodes).flatMap((child) =>
              processNode(child, { ...formatting, italics: true })
            );
          case 'code':
            return Array.from(element.childNodes).flatMap((child) =>
              processNode(child, { ...formatting, font: 'Courier New', size: 20 })
            );
          case 'a': {
            const href = element.getAttribute('href');
            const runs = Array.from(element.childNodes).flatMap((child) =>
              processNode(child, {
                ...formatting,
                color: '0066CC',
                underline: { type: UnderlineType.SINGLE, color: '0066CC' },
              })
            );

            if (href) {
              runs.push(new TextRun({ text: ` (${href})`, color: '666666' }));
            }

            return runs;
          }
          default:
            return Array.from(element.childNodes).flatMap((child) => processNode(child, formatting));
        }
      };

      const paragraphs: Paragraph[] = [];

      for (const child of Array.from(tempDiv.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
          paragraphs.push(new Paragraph({ children: [new TextRun(child.textContent.trim())] }));
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        const element = child as Element;
        const tagName = element.tagName.toLowerCase();

        switch (tagName) {
          case 'h1':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_1 }));
            break;
          case 'h2':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_2 }));
            break;
          case 'h3':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_3 }));
            break;
          case 'h4':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_4 }));
            break;
          case 'h5':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_5 }));
            break;
          case 'h6':
            paragraphs.push(new Paragraph({ children: processNode(element), heading: HeadingLevel.HEADING_6 }));
            break;
          case 'p':
          case 'blockquote': {
            const runs = processNode(element);
            if (runs.length > 0) {
              paragraphs.push(
                new Paragraph({
                  children: runs,
                  indent: tagName === 'blockquote' ? { left: 720 } : undefined,
                })
              );
            }
            break;
          }
          case 'pre':
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: element.textContent || '',
                    font: 'Courier New',
                    color: '333333',
                  }),
                ],
              })
            );
            break;
          case 'ul':
          case 'ol': {
            let index = 1;
            for (const item of Array.from(element.children)) {
              if (item.tagName.toLowerCase() !== 'li') {
                continue;
              }

              const prefix = tagName === 'ul' ? '• ' : `${index}. `;
              paragraphs.push(
                new Paragraph({
                  children: [new TextRun(prefix), ...processNode(item)],
                  indent: { left: 360 },
                })
              );
              index += 1;
            }
            break;
          }
          case 'table': {
            for (const row of Array.from(element.querySelectorAll('tr'))) {
              const rowText = Array.from(row.children)
                .map((cell) => topLevelText(cell))
                .filter(Boolean)
                .join(' | ');
              if (rowText) {
                paragraphs.push(new Paragraph({ children: [new TextRun(rowText)] }));
              }
            }
            break;
          }
          default: {
            const runs = processNode(element);
            if (runs.length > 0) {
              paragraphs.push(new Paragraph({ children: runs }));
            }
          }
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ text: markdownContent })],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `markdown-export-${Date.now()}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出 DOCX 失败:', error);
      alert('导出 DOCX 失败，请检查内容格式。');
    } finally {
      setDocxSourceMarkdown('');
      setIsExporting(false);
    }
  };

  const exportToPdf = async () => {
    setIsExporting(true);

    try {
      if (!previewRef.current) {
        return;
      }
      await exportPdfUtil(previewRef.current);
    } catch (error) {
      console.error('导出 PDF 失败:', error);
      alert('导出 PDF 失败，请检查内容格式。');
    } finally {
      setIsExporting(false);
    }
  };

  const clearContent = () => {
    if (window.confirm('确定要清空当前 Markdown 内容吗？')) {
      setMarkdownContent('');
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      alert('内容已复制到剪贴板。');
    } catch (error) {
      console.error('复制失败:', error);
      alert('复制失败，请稍后重试。');
    }
  };

  const BUTTON_BASE =
    'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <motion.div
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            <FaFileAlt className="text-[10px]" /> Markdown Export
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Markdown 导出工具
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            使用统一的 Markdown 渲染链路进行预览、导出和复制，支持 GFM、KaTeX 与 Mermaid。
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <motion.button
              onClick={exportToDocx}
              disabled={isExporting || !markdownContent.trim()}
              className={`${BUTTON_BASE} bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <FaFileWord className="text-[13px]" />
              {isExporting ? '导出中…' : '导出 DOCX'}
            </motion.button>

            <motion.button
              onClick={exportToPdf}
              disabled={isExporting || !markdownContent.trim()}
              className={`${BUTTON_BASE} border border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:text-slate-900 focus-visible:ring-slate-300`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <FaFilePdf className="text-[13px]" />
              {isExporting ? '导出中…' : '导出 PDF'}
            </motion.button>

            <motion.button
              onClick={copyToClipboard}
              disabled={!markdownContent.trim()}
              className={`${BUTTON_BASE} border border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:text-slate-900 focus-visible:ring-slate-300`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <FaCopy className="text-[13px]" />
              复制内容
            </motion.button>

            <motion.button
              onClick={clearContent}
              className={`${BUTTON_BASE} border border-slate-200 bg-white/80 text-slate-500 hover:border-rose-200 hover:text-rose-600 focus-visible:ring-rose-200`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <FaTrash className="text-[13px]" />
              清空
            </motion.button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-white/60 px-5 py-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <FaFileAlt className="text-slate-500" />
                  Editor
                </div>
              </div>
              <div className="p-4">
                <textarea
                  value={markdownContent}
                  onChange={(event) => setMarkdownContent(event.target.value)}
                  className="h-96 w-full resize-none rounded-2xl border border-slate-200 bg-white/80 p-4 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="在这里输入 Markdown 内容..."
                />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-white/60 px-5 py-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <FaEye className="text-slate-500" />
                  Preview
                </div>
              </div>
              <div className="p-4">
                <div
                  ref={previewRef}
                  className="h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4"
                  style={{
                    fontFamily:
                      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  <MarkdownRenderer content={markdownContent} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="mt-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
          <FaUpload className="text-slate-500" />
          使用说明
        </div>
        <div className="mt-4 grid grid-cols-1 gap-6 text-sm leading-7 text-slate-600 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">支持的 Markdown 能力</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>标题、列表、引用、表格</li>
              <li>代码块高亮与复制</li>
              <li>KaTeX 数学公式</li>
              <li>Mermaid 图表</li>
              <li>链接与基础排版元素</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">导出说明</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>DOCX 导出基于统一渲染后的 DOM 提取内容</li>
              <li>PDF 导出直接使用当前预览区内容</li>
              <li>复杂数学公式会以文本占位形式保留在 DOCX 中</li>
              <li>导出前建议先确认右侧预览是否符合预期</li>
            </ul>
          </div>
        </div>
      </motion.div>

      <div className="hidden" aria-hidden="true">
        <div ref={docxPreviewRef}>
          {docxSourceMarkdown ? <MarkdownRenderer content={docxSourceMarkdown} /> : null}
        </div>
      </div>
    </section>
  );
};

export default MarkdownExportPage;
