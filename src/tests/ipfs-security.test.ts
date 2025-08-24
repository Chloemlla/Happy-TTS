import { describe, it, expect } from '@jest/globals';

// 模拟IPFS服务的安全清理函数
class MockIPFSService {
    static sanitizeSVGContent(content: string): string {
        // 移除所有危险标签和内容
        const dangerousTags = [
            'script', 'iframe', 'object', 'embed', 'link', 'meta', 'style'
        ];
        
        for (const tag of dangerousTags) {
            // 移除完整的标签及其内容
            const tagRegex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
            content = content.replace(tagRegex, '');
            // 移除自闭合标签
            const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
            content = content.replace(selfClosingRegex, '');
        }
        
        // 移除所有事件处理器属性 - 使用更严格的清理
        content = this.removeEventHandlers(content);
        
        // 移除所有危险协议 - 使用更严格的清理
        content = this.removeDangerousProtocols(content);
        
        // 移除所有外部引用 - 使用更严格的清理
        content = this.removeExternalReferences(content);
        
        // 移除所有data属性 - 使用更严格的清理
        content = this.removeDataAttributes(content);
        
        // 移除所有外部URL引用 - 使用更严格的清理
        content = this.removeExternalUrls(content);
        
        // 移除所有注释 - 使用更严格的清理
        content = this.removeComments(content);
        
        // 移除所有CDATA部分 - 使用更严格的清理
        content = this.removeCDATA(content);
        
        return content;
    }

    // 更安全的事件处理器清理方法
    private static removeEventHandlers(content: string): string {
        // 使用循环确保所有事件处理器都被移除
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
            content = content.replace(/\s+on\w+\s*=\s*[^>\s]+/gi, '');
        }
        return content;
    }

    // 更安全的危险协议清理方法
    private static removeDangerousProtocols(content: string): string {
        const dangerousProtocols = [
            'javascript:', 'vbscript:', 'data:', 'mocha:', 'livescript:'
        ];
        
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            for (const protocol of dangerousProtocols) {
                const protocolRegex = new RegExp(`\\s*${protocol.replace(':', '\\s*:')}\\s*`, 'gi');
                content = content.replace(protocolRegex, '');
            }
        }
        return content;
    }

    // 更安全的外部引用清理方法
    private static removeExternalReferences(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/\s*href\s*=\s*["'][^"']*["']/gi, '');
            content = content.replace(/\s*src\s*=\s*["'][^"']*["']/gi, '');
            content = content.replace(/\s*url\s*\(\s*["']?[^"')]*["']?\s*\)/gi, '');
        }
        return content;
    }

    // 更安全的data属性清理方法
    private static removeDataAttributes(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/\s*data-[^=]*\s*=\s*["'][^"']*["']/gi, '');
        }
        return content;
    }

    // 更安全的外部URL清理方法
    private static removeExternalUrls(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/url\s*\(\s*["']?https?:\/\//gi, 'url(');
            content = content.replace(/href\s*=\s*["']?https?:\/\//gi, 'href=');
            content = content.replace(/src\s*=\s*["']?https?:\/\//gi, 'src=');
        }
        return content;
    }

    // 更安全的注释清理方法
    private static removeComments(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/<!--[\s\S]*?-->/g, '');
        }
        return content;
    }

    // 更安全的CDATA清理方法
    private static removeCDATA(content: string): string {
        let previousContent = '';
        while (previousContent !== content) {
            previousContent = content;
            content = content.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
        }
        return content;
    }

    static validateSVGContent(content: string): boolean {
        // 检查是否包含基本的SVG标签
        if (!content.includes('<svg') || !content.includes('</svg>')) {
            return false;
        }
        
        // 检查文件大小
        if (content.length > 1024 * 1024) {
            return false;
        }
        
        // 检查是否包含潜在的危险内容 - 使用更严格的正则表达式
        const dangerousPatterns = [
            // 更严格的script标签检测，包括各种变体
            /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
            /<script\b[^>]*>[\s\S]*?<\/script>/gi,
            // 检测javascript协议的各种变体
            /javascript\s*:/gi,
            /javascript\s*:\s*/gi,
            // 检测事件处理器
            /on\w+\s*=/gi,
            // 检测危险标签的各种变体
            /<iframe\b[^>]*>/gi,
            /<object\b[^>]*>/gi,
            /<embed\b[^>]*>/gi,
            /<link\b[^>]*>/gi,
            /<meta\b[^>]*>/gi,
            /<style\b[^>]*>/gi,
            // 检测危险协议
            /data\s*:/gi,
            /vbscript\s*:/gi,
            // 检测外部URL引用
            /url\s*\(\s*["']?https?:\/\//gi,
            /href\s*=\s*["']?https?:\/\//gi,
            /src\s*=\s*["']?https?:\/\//gi
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(content)) {
                return false;
            }
        }
        
        // 检查编码的危险内容
        const nestedDangerousPatterns = [
            /<[^>]*script[^>]*>/gi,
            /&#x?6a;&#x?61;&#x?76;&#x?61;&#x?73;&#x?63;&#x?72;&#x?69;&#x?70;&#x?74;/gi,
            /\\u006a\\u0061\\u0076\\u0061\\u0073\\u0063\\u0072\\u0069\\u0070\\u0074/gi,
            /j\\u0061v\\u0061s\\u0063r\\u0069pt/gi
        ];
        
        for (const pattern of nestedDangerousPatterns) {
            if (pattern.test(content)) {
                return false;
            }
        }
        
        return true;
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