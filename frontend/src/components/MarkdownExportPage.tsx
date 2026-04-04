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

  return (
    <div className="min-h-screen rounded-3xl bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="mx-auto max-w-7xl space-y-8 px-4">
        <motion.div
          className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
            <div className="text-center">
              <motion.div
                className="mb-4 flex items-center justify-center gap-3"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <FaFileAlt className="text-4xl" />
                <h1 className="text-4xl font-bold">Markdown 导出工具</h1>
              </motion.div>
              <motion.p
                className="text-lg text-blue-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                使用统一的 Markdown 渲染链路进行预览、导出和复制。
              </motion.p>
            </div>
          </div>

          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-wrap justify-center gap-3">
              <motion.button
                onClick={exportToDocx}
                disabled={isExporting || !markdownContent.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-white transition-all duration-200 hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaFileWord />
                {isExporting ? '导出中...' : '导出 DOCX'}
              </motion.button>

              <motion.button
                onClick={exportToPdf}
                disabled={isExporting || !markdownContent.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 text-white transition-all duration-200 hover:from-red-600 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaFilePdf />
                {isExporting ? '导出中...' : '导出 PDF'}
              </motion.button>

              <motion.button
                onClick={copyToClipboard}
                disabled={!markdownContent.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-2 text-white transition-all duration-200 hover:from-green-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaCopy />
                复制内容
              </motion.button>

              <motion.button
                onClick={clearContent}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 px-4 py-2 text-white transition-all duration-200 hover:from-gray-600 hover:to-gray-700"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <FaTrash />
                清空内容
              </motion.button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-sm">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
                <div className="flex items-center gap-2">
                  <FaFileAlt className="text-lg" />
                  <h3 className="text-lg font-semibold">Markdown 编辑器</h3>
                </div>
              </div>
              <div className="p-4">
                <textarea
                  value={markdownContent}
                  onChange={(event) => setMarkdownContent(event.target.value)}
                  className="h-96 w-full resize-none rounded-xl border border-gray-300 p-4 font-mono text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="在这里输入 Markdown 内容..."
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-sm">
              <div className="bg-gradient-to-r from-green-600 to-green-700 p-4 text-white">
                <div className="flex items-center gap-2">
                  <FaEye className="text-lg" />
                  <h3 className="text-lg font-semibold">实时预览</h3>
                </div>
              </div>
              <div className="p-4">
                <div
                  ref={previewRef}
                  className="h-96 overflow-y-auto rounded-xl border border-gray-300 bg-white p-4"
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
        </motion.div>

        <motion.div
          className="rounded-2xl border border-white/20 bg-white/80 p-6 shadow-xl backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800">
            <FaUpload className="text-blue-600" />
            使用说明
          </h3>
          <div className="grid grid-cols-1 gap-6 text-sm text-gray-600 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold text-gray-800">支持的 Markdown 能力</h4>
              <ul className="list-inside list-disc space-y-1">
                <li>标题、列表、引用、表格</li>
                <li>代码块高亮与复制</li>
                <li>KaTeX 数学公式</li>
                <li>Mermaid 图表</li>
                <li>链接与基础排版元素</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-gray-800">导出说明</h4>
              <ul className="list-inside list-disc space-y-1">
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
      </div>
    </div>
  );
};

export default MarkdownExportPage;
