import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaFileAlt, FaDownload, FaEye, FaFileWord, FaFilePdf, FaUpload, FaCopy, FaTrash } from 'react-icons/fa';
import { marked } from 'marked';
// marked-katex-extension 改为按需动态加载，避免初始包体积
// jspdf 与 html2canvas 改为按需动态加载，仅在导出PDF时加载
import DOMPurify from 'dompurify';
// 拆分：按 CommandManager 方式将逻辑拆到独立文件
import MarkdownPreview from './MarkdownExportPage/MarkdownPreview';
import { useKatex } from './MarkdownExportPage/useKatex';
import { exportToPdf as exportPdfUtil } from './MarkdownExportPage/pdfExport';

// 简单的DOCX导出实现（使用RTF格式作为替代）

// KaTeX 逻辑已拆分至 useKatex 钩子与独立模块

const MarkdownExportPage: React.FC = () => {
    // 使用拆分的 KaTeX 钩子
    const [isExporting, setIsExporting] = useState(false);
    const [markdownContent, setMarkdownContent] = useState(`# 示例文档

## 介绍
这是一个Markdown文档示例，您可以编辑左侧的内容，右侧会实时预览渲染效果。

## 功能特性
- **导出PDF**：将内容导出为PDF文件
- **语法高亮**：支持代码块语法高亮

## 代码示例
\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

## LaTeX公式示例
行内公式：$E = mc^2$

块级公式：
$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

复杂公式：
$$\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u$$

矩阵示例：
$$\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}$$

## 列表示例
1. 第一项
2. 第二项
   - 子项目A
   - 子项目B
3. 第三项

## 表格示例
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
| 数据4 | 数据5 | 数据6 |

> 这是一个引用块示例

**粗体文本** 和 *斜体文本*

[链接示例](https://example.com)
`);

    const previewRef = useRef<HTMLDivElement>(null);
    const isKatexLoaded = useKatex(markdownContent);

    // 简单转义函数，避免将纯文本解释为HTML
    const escapeHtml = (text: string) =>
        text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    // 渲染Markdown为安全的HTML
    const renderMarkdown = (markdown: string): string => {
        try {
            const rawHtml = marked.parse(markdown, { async: false } as any) as unknown as string;
            // 仅允许安全标签与必要属性（包含KaTeX渲染所需class）
            return DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: [
                    'p','br','pre','code','span','div','h1','h2','h3','h4','h5','h6',
                    'ul','ol','li','strong','em','table','thead','tbody','tr','th','td',
                    'a','img','blockquote'
                ],
                ALLOWED_ATTR: ['href','title','alt','src','class','id','target','rel']
            });
        } catch (error) {
            console.warn('Markdown parsing error:', error);
            // 如果解析失败，返回转义后的纯文本包裹在<pre>
            const safeText = escapeHtml(markdown);
            return `<pre>${safeText}</pre>`;
        }
    };

    // 导出为DOCX（使用RTF格式作为替代）
    const exportToDocx = async () => {
        setIsExporting(true);
        try {
            // 预处理Markdown内容，提取LaTeX公式
            let processedMarkdown = markdownContent;
            
            // 提取并标记行内LaTeX公式
            processedMarkdown = processedMarkdown.replace(/\$([^$\n]+)\$/g, (match, formula) => {
                return `[INLINE_MATH]${formula}[/INLINE_MATH]`;
            });
            
            // 提取并标记块级LaTeX公式
            processedMarkdown = processedMarkdown.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
                return `[BLOCK_MATH]${formula}[/BLOCK_MATH]`;
            });
            
            // 将处理后的Markdown转换为HTML（已消毒）
            const htmlContent = await renderMarkdown(processedMarkdown);
            
            // 创建一个临时div来解析HTML并提取文本
            const tempDiv = document.createElement('div');
            // 再次确保赋值到DOM前进行消毒
            tempDiv.innerHTML = DOMPurify.sanitize(htmlContent, {
                ALLOWED_TAGS: [
                    'p','br','pre','code','span','div','h1','h2','h3','h4','h5','h6',
                    'ul','ol','li','strong','em','table','thead','tbody','tr','th','td',
                    'a','img','blockquote'
                ],
                ALLOWED_ATTR: ['href','title','alt','src','class','id','target','rel']
            });
            
            // 简单的RTF格式转换
            let rtfContent = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}{\\f1 Courier New;}}\\f0\\fs24';
            
            // 递归处理HTML元素转换为RTF
            const processNode = (node: Node): string => {
                let result = '';
                if (node.nodeType === Node.TEXT_NODE) {
                    let textContent = node.textContent || '';
                    
                    // 处理标记的LaTeX公式
                    textContent = textContent.replace(/\[INLINE_MATH\]([^[]+)\[\/INLINE_MATH\]/g, (match, formula) => {
                        return `[行内公式: $${formula}$]`;
                    });
                    
                    textContent = textContent.replace(/\[BLOCK_MATH\]([^[]+)\[\/BLOCK_MATH\]/g, (match, formula) => {
                        return `\\par[块级公式: $$${formula}$$]\\par`;
                    });
                    
                    // 正确处理RTF转义字符
                    return textContent.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');
                }
                
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as Element;
                    const tagName = element.tagName.toLowerCase();
                    
                    switch (tagName) {
                        case 'h1':
                        case 'h2':
                        case 'h3':
                        case 'h4':
                        case 'h5':
                        case 'h6':
                            const headingSize = tagName === 'h1' ? '\\fs36' : tagName === 'h2' ? '\\fs32' : '\\fs28';
                            result += `\\par${headingSize}\\b `;
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\b0\\fs24\\par';
                            break;
                        case 'p':
                            result += '\\par ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\par';
                            break;
                        case 'strong':
                        case 'b':
                            result += '\\b ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\b0';
                            break;
                        case 'em':
                        case 'i':
                            result += '\\i ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\i0';
                            break;
                        case 'code':
                            result += '\\f1 ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\f0';
                            break;
                        case 'ul':
                        case 'ol':
                            let listIndex = 1;
                            for (const child of Array.from(element.childNodes)) {
                                if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === 'li') {
                                    const bullet = tagName === 'ul' ? '• ' : `${listIndex}. `;
                                    result += `\\par\\li360 ${bullet}`;
                                    for (const liChild of Array.from(child.childNodes)) {
                                        result += processNode(liChild);
                                    }
                                    result += '\\li0';
                                    listIndex++;
                                }
                            }
                            result += '\\par';
                            break;
                        case 'blockquote':
                            result += '\\par\\li720 ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\li0\\par';
                            break;
                        case 'table':
                            result += '\\par';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\par';
                            break;
                        case 'tr':
                            result += '\\par';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                                result += ' | ';
                            }
                            break;
                        case 'th':
                        case 'td':
                            result += '\\b ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\b0';
                            break;
                        case 'pre':
                            result += '\\par\\f1 ';
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            result += '\\f0\\par';
                            break;
                        case 'br':
                            result += '\\par';
                            break;
                        // 处理KaTeX渲染的数学公式
                        case 'span':
                            if (element.classList.contains('katex')) {
                                // 提取LaTeX源码
                                const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
                                if (annotation) {
                                    result += `[数学公式: ${annotation.textContent}]`;
                                } else {
                                    // 如果没有找到源码，使用显示文本
                                    result += `[数学公式: ${element.textContent}]`;
                                }
                            } else {
                                for (const child of Array.from(element.childNodes)) {
                                    result += processNode(child);
                                }
                            }
                            break;
                        case 'math':
                            // 处理MathML格式的数学公式
                            const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
                            if (annotation) {
                                result += `[数学公式: ${annotation.textContent}]`;
                            } else {
                                result += `[数学公式: ${element.textContent}]`;
                            }
                            break;
                        default:
                            for (const child of Array.from(element.childNodes)) {
                                result += processNode(child);
                            }
                            break;
                    }
                }
                return result;
            };
            
            for (const child of Array.from(tempDiv.childNodes)) {
                rtfContent += processNode(child);
            }
            
            rtfContent += '}';
            
            // 创建Blob并下载
            const blob = new Blob([rtfContent], { type: 'application/rtf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `markdown-export-${new Date().getTime()}.rtf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出RTF失败:', error);
            alert('导出RTF失败，请检查内容格式');
        } finally {
            setIsExporting(false);
        }
    };

    // 导出为PDF
    const exportToPdf = async () => {
        setIsExporting(true);
        try {
            if (!previewRef.current) return;
            await exportPdfUtil(previewRef.current);
        } catch (error) {
            console.error('导出PDF失败:', error);
            alert('导出PDF失败，请检查内容格式');
        } finally {
            setIsExporting(false);
        }
    };

    // 清空内容
    const clearContent = () => {
        if (confirm('确定要清空所有内容吗？')) {
            setMarkdownContent('');
        }
    };

    // 复制内容到剪贴板
    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(markdownContent);
            alert('内容已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
            alert('复制失败，请手动选择复制');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 rounded-3xl">
            <div className="max-w-7xl mx-auto px-4 space-y-8">
                {/* 统一的标题头部 */}
                <motion.div
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                        <div className="text-center">
                            <motion.div
                                className="flex items-center justify-center gap-3 mb-4"
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <FaFileAlt className="text-4xl" />
                                <h1 className="text-4xl font-bold">Markdown 导出工具</h1>
                            </motion.div>
                            <motion.p
                                className="text-blue-100 text-lg"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                            >
                                编辑Markdown内容并导出为DOCX或PDF文件
                            </motion.p>
                        </div>
                    </div>

                    {/* 工具栏 */}
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex flex-wrap gap-3 justify-center">
                            <motion.button
                                onClick={exportToDocx}
                                disabled={isExporting || !markdownContent.trim()}
                                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <FaFileWord />
                                {isExporting ? '导出中...' : '导出RTF'}
                            </motion.button>

                            <motion.button
                                onClick={exportToPdf}
                                disabled={isExporting || !markdownContent.trim()}
                                className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-xl hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <FaFilePdf />
                                {isExporting ? '导出中...' : '导出PDF'}
                            </motion.button>

                            <motion.button
                                onClick={copyToClipboard}
                                disabled={!markdownContent.trim()}
                                className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-xl hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <FaCopy />
                                复制内容
                            </motion.button>

                            <motion.button
                                onClick={clearContent}
                                disabled={!markdownContent.trim()}
                                className="flex items-center gap-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-xl hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <FaTrash />
                                清空内容
                            </motion.button>
                        </div>
                    </div>
                </motion.div>

                {/* 编辑器和预览区域 */}
                <motion.div
                    className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    {/* Markdown编辑器 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-600 to-gray-700 text-white p-4">
                            <div className="flex items-center gap-2">
                                <FaFileAlt className="text-lg" />
                                <h3 className="text-lg font-semibold">Markdown 编辑器</h3>
                            </div>
                        </div>
                        <div className="p-4">
                            <textarea
                                value={markdownContent}
                                onChange={(e) => setMarkdownContent(e.target.value)}
                                className="w-full h-96 p-4 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                                placeholder="在这里输入Markdown内容..."
                            />
                        </div>
                    </div>

                    {/* 预览区域 */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4">
                            <div className="flex items-center gap-2">
                                <FaEye className="text-lg" />
                                <h3 className="text-lg font-semibold">实时预览</h3>
                            </div>
                        </div>
                        <div className="p-4">
                            <div
                                ref={previewRef}
                                className="h-96 overflow-y-auto border border-gray-300 rounded-xl p-4 bg-white prose prose-sm max-w-none"
                                style={{
                                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                                } as React.CSSProperties}
                            >
                                {isKatexLoaded ? (
                                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(markdownContent) }} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        <div className="text-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                            <p>正在加载数学公式渲染器...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 使用说明 */}
                <motion.div
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <FaUpload className="text-blue-600" />
                        使用说明
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
                        <div>
                            <h4 className="font-semibold text-gray-800 mb-2">支持的Markdown语法：</h4>
                            <ul className="space-y-1 list-disc list-inside">
                                <li>标题：# ## ### 等</li>
                                <li>粗体：**文本** 或 __文本__</li>
                                <li>斜体：*文本* 或 _文本_</li>
                                <li>代码：`行内代码` 或 ```代码块```</li>
                                <li>链接：[文本](URL)</li>
                                <li>图片：![alt](URL)</li>
                                <li>列表：- 或 1. 开头</li>
                                <li>表格：| 列1 | 列2 |</li>
                                <li>引用： 开头</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800 mb-2">导出功能：</h4>
                            <ul className="space-y-1 list-disc list-inside">
                                <li><strong>RTF导出：</strong>兼容Word的富文本格式文档</li>
                                <li><strong>PDF导出：</strong>高质量的PDF文件</li>
                                <li><strong>实时预览：</strong>编辑时即时查看效果</li>
                                <li><strong>复制功能：</strong>快速复制内容到剪贴板</li>
                                <li><strong>清空功能：</strong>快速清除所有内容</li>
                            </ul>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default MarkdownExportPage;
