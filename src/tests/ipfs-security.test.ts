import { describe, expect, it } from "@jest/globals";
import { sanitizeSvgContent, validateSvgContent } from "../utils/svgSecurity";

// 模拟IPFS服务的安全清理函数
class MockIPFSService {
  static sanitizeSVGContent(content: string): string {
    return sanitizeSvgContent(content);
  }

  static validateSVGContent(content: string): boolean {
    return validateSvgContent(content).valid;
  }
}

describe("IPFS Security Tests", () => {
  describe("SVG Content Sanitization", () => {
    it("should remove script tags", () => {
      const maliciousSVG = `
                <svg>
                    <script>alert('xss')</script>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("<circle");
    });

    it("should remove event handlers", () => {
      const maliciousSVG = `
                <svg>
                    <circle cx="50" cy="50" r="40" onclick="alert('xss')"/>
                    <rect x="10" y="10" width="80" height="80" onmouseover="alert('xss')"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("onclick");
      expect(sanitized).not.toContain("onmouseover");
      expect(sanitized).toContain("<circle");
      expect(sanitized).toContain("<rect");
    });

    it("should remove javascript protocol", () => {
      const maliciousSVG = `
                <svg>
                    <a href="javascript:alert('xss')">Click me</a>
                    <image href="javascript:alert('xss')"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("javascript:");
    });

    it("should remove iframe tags", () => {
      const maliciousSVG = `
                <svg>
                    <iframe src="http://evil.com"></iframe>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("<iframe");
      expect(sanitized).toContain("<circle");
    });

    it("should remove external references", () => {
      const maliciousSVG = `
                <svg>
                    <image href="http://evil.com/image.png"/>
                    <use href="http://evil.com/defs.svg#icon"/>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("http://evil.com");
      expect(sanitized).toContain("<circle");
    });

    it("should remove data URLs", () => {
      const maliciousSVG = `
                <svg>
                    <image href="data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgnc3NzJyk8L3NjcmlwdD4="/>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("data:");
      expect(sanitized).toContain("<circle");
    });

    it("should remove comments", () => {
      const maliciousSVG = `
                <svg>
                    <!-- <script>alert('xss')</script> -->
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("<!--");
      expect(sanitized).not.toContain("-->");
      expect(sanitized).toContain("<circle");
    });

    it("should remove CDATA sections", () => {
      const maliciousSVG = `
                <svg>
                    <![CDATA[<script>alert('xss')</script>]]>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("<![CDATA[");
      expect(sanitized).not.toContain("]]>");
      expect(sanitized).toContain("<circle");
    });
    it("should handle incomplete comment blocks safely", () => {
      const maliciousSVG = `<svg><!--<script>alert('xss')</script>`;
      const sanitized = sanitizeSvgContent(maliciousSVG);
      expect(sanitized).not.toContain("<!--");
      expect(sanitized).not.toContain("<script>");
      expect(validateSvgContent(sanitized)).toEqual({ valid: true });
    });

    it("should handle incomplete CDATA sections safely", () => {
      const maliciousSVG = `<svg><![CDATA[<script>alert('xss')</script>`;
      const sanitized = sanitizeSvgContent(maliciousSVG);
      expect(sanitized).not.toContain("<![CDATA[");
      expect(sanitized).not.toContain("<script>");
      expect(validateSvgContent(sanitized)).toEqual({ valid: true });
    });  });

  describe("SVG Content Validation", () => {
    it("should accept valid SVG", () => {
      const validSVG = `
                <svg width="100" height="100">
                    <circle cx="50" cy="50" r="40" fill="red"/>
                    <rect x="10" y="10" width="80" height="80" fill="blue"/>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(validSVG)).toBe(true);
    });

    it("should reject SVG with script tags", () => {
      const maliciousSVG = `
                <svg>
                    <script>alert('xss')</script>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with event handlers", () => {
      const maliciousSVG = `
                <svg>
                    <circle cx="50" cy="50" r="40" onclick="alert('xss')"/>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with javascript protocol", () => {
      const maliciousSVG = `
                <svg>
                    <a href="javascript:alert('xss')">Click me</a>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with external references", () => {
      const maliciousSVG = `
                <svg>
                    <image href="http://evil.com/image.png"/>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with encoded javascript", () => {
      const maliciousSVG = `
                <svg>
                    <script>&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert('xss')</script>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with Unicode encoded javascript", () => {
      const maliciousSVG = `
                <svg>
                    <script>\\u006a\\u0061\\u0076\\u0061\\u0073\\u0063\\u0072\\u0069\\u0070\\u0074:alert('xss')</script>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });

    it("should reject SVG with mixed encoding", () => {
      const maliciousSVG = `
                <svg>
                    <script>j\\u0061v\\u0061s\\u0063r\\u0069pt:alert('xss')</script>
                </svg>
            `;

      expect(MockIPFSService.validateSVGContent(maliciousSVG)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty SVG", () => {
      const emptySVG = "<svg></svg>";
      expect(MockIPFSService.validateSVGContent(emptySVG)).toBe(true);
    });

    it("should handle SVG without closing tag", () => {
      const incompleteSVG = '<svg><circle cx="50" cy="50" r="40"/>';
      expect(MockIPFSService.validateSVGContent(incompleteSVG)).toBe(false);
    });

    it("should handle very large SVG", () => {
      const largeSVG = `<svg>${"a".repeat(1024 * 1024 + 1)}</svg>`;
      expect(MockIPFSService.validateSVGContent(largeSVG)).toBe(false);
    });

    it("should handle SVG with nested dangerous content", () => {
      const maliciousSVG = `
                <svg>
                    <g>
                        <script>alert('xss')</script>
                    </g>
                    <circle cx="50" cy="50" r="40"/>
                </svg>
            `;

      const sanitized = MockIPFSService.sanitizeSVGContent(maliciousSVG);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("<circle");
    });
  });
});
