import { describe, it, expect } from '@jest/globals';
import { JSDOM } from 'jsdom';

// 模拟IPFS服务的安全清理函数
class MockIPFSService {
    static sanitizeSVGContent(content: string): string {
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const root = doc.documentElement;
            if (!root || root.tagName.toLowerCase() !== 'svg') return '';

            // 移除注释
            const commentWalker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_COMMENT);
            const comments: Comment[] = [] as unknown as Comment[];
            while (commentWalker.nextNode()) comments.push(commentWalker.currentNode as Comment);
            comments.forEach((n) => n.parentNode?.removeChild(n));

            // 移除 CDATA 节点
            const removeCData = (node: Node) => {
                const children = Array.from((node as Element).childNodes);
                for (const child of children) {
                    if (child.nodeType === dom.window.Node.CDATA_SECTION_NODE) {
                        child.parentNode?.removeChild(child);
                    } else if (child.nodeType === dom.window.Node.ELEMENT_NODE) {
                        removeCData(child);
                    }
                }
            };
            removeCData(root);

            // 危险标签
            const dangerousTags = ['script','iframe','object','embed','link','meta','style','foreignObject'];
            for (const tag of dangerousTags) {
                doc.querySelectorAll(tag).forEach((el) => el.parentNode?.removeChild(el));
            }

            // 遍历元素，移除 on* 事件、危险协议与外部引用
            const elements = root.querySelectorAll('*');
            elements.forEach((el) => {
                // 移除事件处理器
                Array.from(el.attributes)
                    .filter((a) => /^on/i.test(a.name))
                    .forEach((a) => el.removeAttribute(a.name));

                Array.from(el.attributes).forEach((a) => {
                    const name = a.name.toLowerCase();
                    const value = a.value.trim();

                    // 危险协议
                    const proto = value.match(/^\s*([a-zA-Z][a-zA-Z0-9+.-]*)\s*:\s*/);
                    if (proto) {
                        el.removeAttribute(a.name);
                        return;
                    }

                    // 外部引用，仅允许片段标识符
                    if (name === 'href' || name === 'xlink:href' || name === 'src') {
                        if (!value.startsWith('#')) {
                            el.removeAttribute(a.name);
                            return;
                        }
                    }

                    // 样式中的外部 url 或协议
                    if (name === 'style') {
                        const v = value.toLowerCase();
                        if (/url\s*\(\s*(?:["'])?https?:\/\//.test(v) || /javascript\s*:/.test(v) || /vbscript\s*:/.test(v) || /data\s*:/.test(v)) {
                            el.removeAttribute('style');
                        }
                    }
                });
            });

            return root.outerHTML;
        } catch {
            return '';
        }
    }

    // 以下方法改为基于 DOM 的实现，避免使用正则
    private static removeEventHandlers(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        doc.querySelectorAll('*').forEach((el) => {
            Array.from(el.attributes)
                .filter((a) => /^on/i.test(a.name))
                .forEach((a) => (el as Element).removeAttribute(a.name));
        });
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeDangerousProtocols(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        doc.querySelectorAll('*').forEach((el) => {
            Array.from(el.attributes).forEach((a) => {
                const value = a.value.trim();
                if (/^\s*([a-zA-Z][a-zA-Z0-9+.-]*)\s*:\s*/.test(value)) {
                    (el as Element).removeAttribute(a.name);
                }
            });
        });
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeExternalReferences(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        doc.querySelectorAll('*').forEach((el) => {
            ['href','xlink:href','src'].forEach((name) => {
                const v = (el as Element).getAttribute(name);
                if (v && !v.startsWith('#')) (el as Element).removeAttribute(name);
            });
            const style = (el as Element).getAttribute('style');
            if (style && /url\s*\(\s*(?:["'])?https?:\/\//i.test(style)) {
                (el as Element).removeAttribute('style');
            }
        });
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeDataAttributes(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        doc.querySelectorAll('*').forEach((el) => {
            Array.from(el.attributes)
                .filter((a) => /^data-/i.test(a.name))
                .forEach((a) => (el as Element).removeAttribute(a.name));
        });
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeExternalUrls(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        doc.querySelectorAll('*').forEach((el) => {
            ['href','src'].forEach((name) => {
                const v = (el as Element).getAttribute(name);
                if (v && /^\s*https?:\/\//i.test(v)) (el as Element).removeAttribute(name);
            });
            const style = (el as Element).getAttribute('style');
            if (style && /url\s*\(\s*(?:["'])?https?:\/\//i.test(style)) {
                (el as Element).removeAttribute('style');
            }
        });
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeComments(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        const walker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_COMMENT);
        const toRemove: Comment[] = [] as unknown as Comment[];
        while (walker.nextNode()) toRemove.push(walker.currentNode as Comment);
        toRemove.forEach((n) => n.parentNode?.removeChild(n));
        return doc.documentElement ? doc.documentElement.outerHTML : content;
    }

    private static removeCDATA(content: string): string {
        const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        const root = doc.documentElement;
        if (root) {
            const walk = (node: Node) => {
                const children = Array.from((node as Element).childNodes);
                for (const child of children) {
                    if (child.nodeType === dom.window.Node.CDATA_SECTION_NODE) {
                        child.parentNode?.removeChild(child);
                    } else if (child.nodeType === dom.window.Node.ELEMENT_NODE) {
                        walk(child);
                    }
                }
            };
            walk(root);
        }
        return root ? root.outerHTML : content;
    }

    static validateSVGContent(content: string): boolean {
        // 文件大小
        if (content.length > 1024 * 1024) return false;
        try {
            const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
            const doc = dom.window.document;
            const root = doc.documentElement;
            if (!root || root.tagName.toLowerCase() !== 'svg') return false;

            // 禁止的标签
            const forbidden = ['script','iframe','object','embed','link','meta','style','foreignObject'];
            if (forbidden.some((t) => root.querySelector(t))) return false;

            // 事件处理器与危险/外部引用
            const elements = root.querySelectorAll('*');
            for (const el of Array.from(elements)) {
                for (const a of Array.from((el as Element).attributes)) {
                    const name = a.name.toLowerCase();
                    const value = a.value;
                    if (/^on/i.test(name)) return false;
                    if (name === 'href' || name === 'xlink:href' || name === 'src') {
                        if (!value.startsWith('#')) return false;
                    }
                    if (/^\s*([a-zA-Z][a-zA-Z0-9+.-]*)\s*:\s*/.test(value)) return false;
                    if (name === 'style') {
                        const v = value.toLowerCase();
                        if (/url\s*\(/.test(v)) return false;
                        if (/javascript\s*:|vbscript\s*:|data\s*:/.test(v)) return false;
                    }
                }
            }

            return true;
        } catch {
            return false;
        }
    }
}

describe('IPFS Security Tests', () => {
    describe('SVG Content Sanitization', () => {
        it('should remove script tags', () => {
            const maliciousSVG = `
                <svg>
                    <script>alert('xss')</script>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).toContain('<circle');
        });

        it('should remove event handlers', () => {
            const maliciousSVG = `
                <svg>
                    <circle cx="50" cy="50" r="40" onclick="alert('xss')"/>
                    <rect x="10" y="10" width="80" height="80" onmouseover="alert('xss')"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('onclick');
            expect(sanitized).not.toContain('onmouseover');
            expect(sanitized).toContain('<circle');
            expect(sanitized).toContain('<rect');
        });

        it('should remove javascript protocol', () => {
            const maliciousSVG = `
                <svg>
                    <a href="javascript:alert('xss')">Click me</a>
                    <image href="javascript:alert('xss')"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('javascript:');
        });

        it('should remove iframe tags', () => {
            const maliciousSVG = `
                <svg>
                    <iframe src="http://evil.com"></iframe>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('<iframe');
            expect(sanitized).toContain('<circle');
        });

        it('should remove external references', () => {
            const maliciousSVG = `
                <svg>
                    <image href="http://evil.com/image.png"/>
                    <use href="http://evil.com/defs.svg#icon"/>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('http://evil.com');
            expect(sanitized).toContain('<circle');
        });

        it('should remove data URLs', () => {
            const maliciousSVG = `
                <svg>
                    <image href="data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgnc3NzJyk8L3NjcmlwdD4="/>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('data:');
            expect(sanitized).toContain('<circle');
        });

        it('should remove comments', () => {
            const maliciousSVG = `
                <svg>
                    <!-- <script>alert('xss')</script> -->
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('<!--');
            expect(sanitized).not.toContain('-->');
            expect(sanitized).toContain('<circle');
        });

        it('should remove CDATA sections', () => {
            const maliciousSVG = `
                <svg>
                    <![CDATA[<script>alert('xss')</script>]]>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('<![CDATA[');
            expect(sanitized).not.toContain(']]>');
            expect(sanitized).toContain('<circle');
        });
    });

    describe('SVG Content Validation', () => {
        it('should accept valid SVG', () => {
            const validSVG = `
                <svg width="100" height="100">
                    <circle cx="50" cy="50" r="40" fill="red"/>
                    <rect x="10" y="10" width="80" height="80" fill="blue"/>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(validSVG)).toBe(true);
        });

        it('should reject SVG with script tags', () => {
            const maliciousSVG = `
                <svg>
                    <script>alert('xss')</script>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with event handlers', () => {
            const maliciousSVG = `
                <svg>
                    <circle cx="50" cy="50" r="40" onclick="alert('xss')"/>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with javascript protocol', () => {
            const maliciousSVG = `
                <svg>
                    <a href="javascript:alert('xss')">Click me</a>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with external references', () => {
            const maliciousSVG = `
                <svg>
                    <image href="http://evil.com/image.png"/>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with encoded javascript', () => {
            const maliciousSVG = `
                <svg>
                    <script>&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert('xss')</script>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with Unicode encoded javascript', () => {
            const maliciousSVG = `
                <svg>
                    <script>\\u006a\\u0061\\u0076\\u0061\\u0073\\u0063\\u0072\\u0069\\u0070\\u0074:alert('xss')</script>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });

        it('should reject SVG with mixed encoding', () => {
            const maliciousSVG = `
                <svg>
                    <script>j\\u0061v\\u0061s\\u0063r\\u0069pt:alert('xss')</script>
                </svg>
            `;
            
            expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty SVG', () => {
            const emptySVG = '<svg></svg>';
            expect(MockIPFSService.validateSVGContent(emptySVG)).toBe(true);
        });

        it('should handle SVG without closing tag', () => {
            const incompleteSVG = '<svg><circle cx="50" cy="50" r="40"/>';
            expect(MockIPFSService.validateSVGContent(incompleteSVG)).toBe(false);
        });

        it('should handle very large SVG', () => {
            const largeSVG = '<svg>' + 'a'.repeat(1024 * 1024 + 1) + '</svg>';
            expect(MockIPFSService.validateSVGContent(largeSVG)).toBe(false);
        });

        it('should handle SVG with nested dangerous content', () => {
            const maliciousSVG = `
                <svg>
                    <g>
                        <script>alert('xss')</script>
                    </g>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;
            
            const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).toContain('<circle');
        });
    });
}); 