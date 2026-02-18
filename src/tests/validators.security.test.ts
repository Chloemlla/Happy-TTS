import { sanitizeInput } from "../utils/validators";

describe("sanitizeInput - Security Tests", () => {
  describe("防止不完整的多字符清理漏洞", () => {
    test("应该清理嵌套的 javascript: 协议", () => {
      const input = "jjavascript:avascript:alert(1)";
      const result = sanitizeInput(input);

      // 不应该包含任何 javascript: 字符串
      expect(result.toLowerCase()).not.toContain("javascript:");
    });

    test("应该清理多层嵌套的危险协议", () => {
      const input = "jjavajavascript:script:vbscript:alert(1)";
      const result = sanitizeInput(input);

      expect(result.toLowerCase()).not.toContain("javascript:");
      expect(result.toLowerCase()).not.toContain("vbscript:");
    });

    test("应该清理嵌套的 data: URI", () => {
      const input = "ddata:ata:text/html,<script>alert(1)</script>";
      const result = sanitizeInput(input);

      expect(result.toLowerCase()).not.toContain("data:");
      expect(result.toLowerCase()).not.toContain("script");
    });

    test("应该清理嵌套的事件处理器", () => {
      const input = "ononclick=click=alert(1)";
      const result = sanitizeInput(input);

      expect(result.toLowerCase()).not.toMatch(/on\w+\s*=/);
    });

    test("应该清理混合的嵌套攻击", () => {
      const input = "<img src=x ononerror=error=javascript:alert(1)>";
      const result = sanitizeInput(input);

      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result.toLowerCase()).not.toContain("javascript:");
      expect(result.toLowerCase()).not.toMatch(/on\w+\s*=/);
    });

    test("应该处理深度嵌套（最多10层）", () => {
      const input =
        "jjjjjjjjjjavascript:avascript:avascript:avascript:avascript:avascript:avascript:avascript:avascript:avascript:alert(1)";
      const result = sanitizeInput(input);

      // 即使嵌套很深，也应该被清理
      expect(result.toLowerCase()).not.toContain("javascript:");
    });

    test("应该防止通过大小写混合绕过", () => {
      const inputs = ["JaVaScRiPt:alert(1)", "VBSCRIPT:alert(1)", "DaTa:text/html,<script>", "OnClIcK=alert(1)"];

      inputs.forEach((input) => {
        const result = sanitizeInput(input);
        expect(result.toLowerCase()).not.toContain("javascript:");
        expect(result.toLowerCase()).not.toContain("vbscript:");
        expect(result.toLowerCase()).not.toContain("data:");
        expect(result.toLowerCase()).not.toMatch(/on\w+\s*=/);
      });
    });

    test("应该转义 HTML 特殊字符", () => {
      const input = '<script>alert("XSS");</script>';
      const result = sanitizeInput(input);

      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&quot;");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    test("应该正确处理合法输入", () => {
      const validInputs = ["John Doe", "FBI Most Wanted", "Dangerous criminal at large", "悬赏金额: $1,000,000"];

      validInputs.forEach((input) => {
        const result = sanitizeInput(input);
        // 合法输入应该被转义但不应该被完全移除
        expect(result.length).toBeGreaterThan(0);
      });
    });

    test("应该限制最大长度", () => {
      const longInput = "a".repeat(1000);
      const result = sanitizeInput(longInput, 100);

      expect(result.length).toBeLessThanOrEqual(100);
    });

    test("应该移除控制字符", () => {
      const input = "test\x00\x01\x02\x1F\x7Fstring";
      const result = sanitizeInput(input);

      expect(result).toBe("teststring");
    });

    test("应该处理空字符串和 null/undefined", () => {
      expect(sanitizeInput("")).toBe("");
      expect(sanitizeInput(null)).toBe("");
      expect(sanitizeInput(undefined)).toBe("");
    });
  });

  describe("性能测试", () => {
    test("应该在合理时间内完成清理（即使有嵌套）", () => {
      const input = `${"j".repeat(100) + "avascript:".repeat(50)}alert(1)`;
      const startTime = Date.now();

      sanitizeInput(input);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 应该在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });

    test("应该防止 ReDoS 攻击", () => {
      // 构造可能导致正则表达式回溯的输入
      const input = `on${"a".repeat(1000)}=`;
      const startTime = Date.now();

      sanitizeInput(input);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 应该快速完成，不应该有指数级回溯
      expect(duration).toBeLessThan(100);
    });
  });

  describe("真实攻击场景", () => {
    test("应该防止 XSS 攻击 - 图片标签", () => {
      const attacks = [
        "<img src=x onerror=alert(1)>",
        '<img src="javascript:alert(1)">',
        "<img src=x ononerror=error=alert(1)>",
        "<img/src=x/onerror=alert(1)>",
      ];

      attacks.forEach((attack) => {
        const result = sanitizeInput(attack);
        expect(result).not.toContain("<");
        expect(result).not.toContain(">");
        expect(result.toLowerCase()).not.toContain("javascript:");
      });
    });

    test("应该防止 XSS 攻击 - 脚本标签", () => {
      const attacks = [
        "<script>alert(1)</script>",
        "<SCRIPT>alert(1)</SCRIPT>",
        "<<script>script>alert(1)<</script>/script>",
        "<scr<script>ipt>alert(1)</script>",
      ];

      attacks.forEach((attack) => {
        const result = sanitizeInput(attack);
        expect(result.toLowerCase()).not.toContain("script");
        expect(result).not.toContain("<");
        expect(result).not.toContain(">");
      });
    });

    test("应该防止 XSS 攻击 - 事件处理器", () => {
      const attacks = [
        "onclick=alert(1)",
        "onload=alert(1)",
        "onerror=alert(1)",
        "onmouseover=alert(1)",
        "ononclick=click=alert(1)",
      ];

      attacks.forEach((attack) => {
        const result = sanitizeInput(attack);
        expect(result.toLowerCase()).not.toMatch(/on\w+\s*=/);
      });
    });

    test("应该防止 Data URI XSS", () => {
      const attacks = [
        "data:text/html,<script>alert(1)</script>",
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        "ddata:ata:text/html,<script>alert(1)</script>",
      ];

      attacks.forEach((attack) => {
        const result = sanitizeInput(attack);
        expect(result.toLowerCase()).not.toContain("data:");
        expect(result.toLowerCase()).not.toContain("script");
      });
    });

    test("应该防止混合协议攻击", () => {
      const input = "javascript:vbscript:data:alert(1)";
      const result = sanitizeInput(input);

      expect(result.toLowerCase()).not.toContain("javascript:");
      expect(result.toLowerCase()).not.toContain("vbscript:");
      expect(result.toLowerCase()).not.toContain("data:");
    });
  });
});
