import speakeasy from "speakeasy";
import { TOTPService } from "../services/totpService";
import { TOTPDebugger } from "../utils/totpDebugger";

// 简单的base32解码函数
function base32Decode(str: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const padding = "=";

  // 移除填充字符
  str = str.replace(new RegExp(`${padding}+$`), "");

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i].toUpperCase();
    const index = alphabet.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

describe("TOTP密钥调试测试", () => {
  const testUsername = "testuser";
  const testServiceName = "Happy TTS";

  describe("密钥生成和验证", () => {
    test("应该生成有效的TOTP密钥", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);

      // 验证密钥格式
      const validation = TOTPDebugger.validateTOTPSecret(secret);
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test("生成的密钥应该能正确验证TOTP令牌", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 生成当前时间窗口的验证码
      const token = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
      });

      // 验证令牌
      const isValid = TOTPService.verifyToken(token, secret);
      expect(isValid).toBe(true);
    });
  });

  describe("otpauth URL生成", () => {
    test("应该生成有效的otpauth URL", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);

      expect(otpauthUrl).toBeDefined();
      expect(typeof otpauthUrl).toBe("string");
      expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(otpauthUrl).toContain("secret=");
      expect(otpauthUrl).toContain("issuer=");
      expect(otpauthUrl).toContain("algorithm=SHA1");
      expect(otpauthUrl).toContain("digits=6");
      expect(otpauthUrl).toContain("period=30");
    });

    test("otpauth URL中的密钥应该与原始密钥一致", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);

      // 从URL中提取密钥
      const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
      expect(secretMatch).toBeDefined();
      expect(secretMatch?.[1]).toBe(secret);
    });
  });

  describe("密钥格式问题诊断", () => {
    test("应该检测无效的密钥格式", () => {
      const invalidSecrets = [
        "", // 空字符串
        "123", // 太短
        "INVALID_CHARS!@#", // 包含非法字符
      ];

      invalidSecrets.forEach((secret) => {
        const validation = TOTPDebugger.validateTOTPSecret(secret);
        expect(validation.isValid).toBe(false);
        expect(validation.issues.length).toBeGreaterThan(0);
      });
    });

    test("应该检测有效的密钥格式", () => {
      const validSecrets = [
        "JBSWY3DPEHPK3PXP", // 标准长度
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", // 32字符
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=", // 带填充
      ];

      validSecrets.forEach((secret) => {
        const validation = TOTPDebugger.validateTOTPSecret(secret);
        expect(validation.isValid).toBe(true);
        expect(validation.issues).toHaveLength(0);
      });
    });
  });

  describe("时间同步问题诊断", () => {
    test("应该生成多个时间窗口的验证码", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 生成当前、前一个、下一个时间窗口的验证码
      const currentToken = TOTPDebugger.generateTestToken(secret, 0);
      const prevToken = TOTPDebugger.generateTestToken(secret, -30);
      const nextToken = TOTPDebugger.generateTestToken(secret, 30);

      expect(currentToken).toBeDefined();
      expect(prevToken).toBeDefined();
      expect(nextToken).toBeDefined();
      expect(currentToken).toMatch(/^\d{6}$/);
      expect(prevToken).toMatch(/^\d{6}$/);
      expect(nextToken).toMatch(/^\d{6}$/);
    });

    test("不同时间窗口的验证码应该不同", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      const currentToken = TOTPDebugger.generateTestToken(secret, 0);
      const prevToken = TOTPDebugger.generateTestToken(secret, -30);
      const nextToken = TOTPDebugger.generateTestToken(secret, 30);

      // 验证码应该不同（除非在时间窗口边界）
      const tokens = [currentToken, prevToken, nextToken];
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBeGreaterThan(1);
    });
  });

  describe("完整TOTP流程测试", () => {
    test("完整的TOTP设置和验证流程", async () => {
      // 1. 生成密钥
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      expect(secret).toBeDefined();

      // 2. 生成otpauth URL
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);
      expect(otpauthUrl).toBeDefined();

      // 3. 生成QR码
      const qrCodeDataUrl = await TOTPService.generateQRCodeDataURL(secret, testUsername, testServiceName);
      expect(qrCodeDataUrl).toBeDefined();
      expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      // 4. 生成验证码
      const token = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
      });
      expect(token).toMatch(/^\d{6}$/);

      // 5. 验证令牌
      const isValid = TOTPService.verifyToken(token, secret);
      expect(isValid).toBe(true);
    });
  });

  describe("密钥编码问题诊断", () => {
    test("应该正确处理base32编码的密钥", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 验证密钥是有效的base32格式
      const base32Pattern = /^[A-Z2-7]+=*$/;
      expect(secret).toMatch(base32Pattern);

      // 尝试解码base32
      try {
        const decoded = base32Decode(secret);
        expect(decoded.length).toBeGreaterThan(0);
      } catch (_error) {
        fail("密钥不是有效的base32编码");
      }
    });

    test("应该检测base32解码错误", () => {
      const invalidBase32Secrets = [
        "INVALID!@#", // 包含非法字符
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ2345678", // 长度不是8的倍数
      ];

      invalidBase32Secrets.forEach((secret) => {
        expect(() => {
          base32Decode(secret);
        }).toThrow();
      });
    });
  });

  describe("URL编码问题诊断", () => {
    test("otpauth URL应该正确编码特殊字符", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 测试包含特殊字符的用户名和服务名
      const specialUsername = "test@user.com";
      const specialServiceName = "Happy TTS & Co.";

      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, specialUsername, specialServiceName);

      // URL应该被正确编码
      expect(otpauthUrl).toContain("test_user_com"); // 特殊字符被替换为下划线
      expect(otpauthUrl).toContain("Happy-TTS---Co-"); // 特殊字符被替换为中划线
      expect(otpauthUrl).toContain(`secret=${secret}`); // 密钥应该保持不变
    });
  });

  describe("调试信息生成", () => {
    test("应该生成完整的调试信息", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      const token = "123456"; // 测试令牌

      const diagnosis = TOTPDebugger.diagnoseTOTPVerification(token, secret, testUsername);

      expect(diagnosis).toBeDefined();
      expect(diagnosis.isValid).toBeDefined();
      expect(diagnosis.issues).toBeDefined();
      expect(diagnosis.suggestions).toBeDefined();
      expect(diagnosis.debugInfo).toBeDefined();

      // 验证调试信息包含必要字段
      expect(diagnosis.debugInfo.currentTime).toBeDefined();
      expect(diagnosis.debugInfo.expectedToken).toBeDefined();
      expect(diagnosis.debugInfo.prevToken).toBeDefined();
      expect(diagnosis.debugInfo.nextToken).toBeDefined();
      expect(diagnosis.debugInfo.matches).toBeDefined();
    });
  });

  describe("TOTP密钥问题诊断", () => {
    test("诊断手动输入vs扫码密钥差异", () => {
      // 模拟手动输入的密钥
      const manualSecret = "JBSWY3DPEHPK3PXP";

      // 模拟扫码获取的密钥（可能有问题）
      const scannedSecret = "JBSWY3DPEHPK3PXP";

      // 生成验证码
      const manualToken = speakeasy.totp({
        secret: manualSecret,
        encoding: "base32",
        step: 30,
      });

      const scannedToken = speakeasy.totp({
        secret: scannedSecret,
        encoding: "base32",
        step: 30,
      });

      // 验证两个密钥生成的验证码是否相同
      expect(manualToken).toBe(scannedToken);

      // 验证两个密钥是否都能正确验证
      const manualValid = TOTPService.verifyToken(manualToken, manualSecret);
      const scannedValid = TOTPService.verifyToken(scannedToken, scannedSecret);

      expect(manualValid).toBe(true);
      expect(scannedValid).toBe(true);
    });

    test("检查密钥长度和格式", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      console.log("生成的密钥:", secret);
      console.log("密钥长度:", secret.length);
      console.log("密钥格式:", /^[A-Z2-7]+=*$/.test(secret) ? "有效base32" : "无效base32");

      // 验证密钥长度应该是32字符（标准TOTP密钥长度）
      expect(secret.length).toBe(32);

      // 验证密钥格式
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    test("检查otpauth URL格式", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);

      console.log("otpauth URL:", otpauthUrl);

      // 解析URL参数
      const url = new URL(otpauthUrl.replace("otpauth://", "http://"));
      const params = url.searchParams;

      console.log("URL参数:");
      console.log("- secret:", params.get("secret"));
      console.log("- issuer:", params.get("issuer"));
      console.log("- algorithm:", params.get("algorithm"));
      console.log("- digits:", params.get("digits"));
      console.log("- period:", params.get("period"));

      // 验证所有必要参数都存在
      expect(params.get("secret")).toBe(secret);
      expect(params.get("issuer")).toBe("Happy-TTS");
      expect(params.get("algorithm")).toBe("SHA1");
      expect(params.get("digits")).toBe("6");
      expect(params.get("period")).toBe("30");
    });
  });
});
