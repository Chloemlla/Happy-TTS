import speakeasy from "speakeasy";
import { TOTPDebugger } from "../utils/totpDebugger";

// 模拟logger
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe("TOTPDebugger", () => {
  let validSecret: string;
  let validToken: string;

  beforeEach(() => {
    // 生成有效的TOTP密钥和令牌用于测试
    const secretObj = speakeasy.generateSecret({
      name: "Test User",
      issuer: "Happy TTS",
      length: 32,
    });
    validSecret = secretObj.base32!;
    validToken = speakeasy.totp({
      secret: validSecret,
      encoding: "base32",
      step: 30,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe("diagnoseTOTPVerification", () => {
    it("应该正确诊断有效的TOTP验证", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, validSecret, "testuser");

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
      expect(result.debugInfo).toBeDefined();
      expect(result.debugInfo.expectedToken).toBe(validToken);
      expect(result.debugInfo.standardVerification).toBe(true);
    });

    it("应该检测无效的token格式", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification("12345", validSecret, "testuser");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("验证码格式错误：必须是6位数字");
      expect(result.suggestions).toContain("请确保输入的是6位数字验证码");
    });

    it("应该检测无效的secret", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, "", "testuser");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥无效");
      expect(result.suggestions).toContain("请重新生成TOTP设置");
    });

    it("应该检测无效的base32格式secret", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, "invalid-secret!@#", "testuser");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥格式错误：不是有效的base32编码");
    });

    it("应该检测时间窗口不匹配的情况", () => {
      // 使用一个明显错误的token
      const wrongToken = "999999";
      const result = TOTPDebugger.diagnoseTOTPVerification(wrongToken, validSecret, "testuser");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("验证码不匹配任何时间窗口");
      expect(result.suggestions).toContain("请检查认证器应用是否与服务器时间同步");
    });

    it("应该包含调试信息", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, validSecret, "testuser");

      expect(result.debugInfo).toHaveProperty("currentTime");
      expect(result.debugInfo).toHaveProperty("currentStep");
      expect(result.debugInfo).toHaveProperty("step");
      expect(result.debugInfo).toHaveProperty("expectedToken");
      expect(result.debugInfo).toHaveProperty("prevToken");
      expect(result.debugInfo).toHaveProperty("nextToken");
      expect(result.debugInfo).toHaveProperty("matches");
      expect(result.debugInfo).toHaveProperty("standardVerification");
    });

    it("应该生成otpauth URL", () => {
      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, validSecret, "testuser");

      expect(result.debugInfo.otpauthUrl).toBeDefined();
      expect(result.debugInfo.otpauthUrl).toContain("otpauth://totp/");
      expect(result.debugInfo.otpauthUrl).toContain("secret=***");
    });
  });

  describe("validateTOTPSecret", () => {
    it("应该验证有效的TOTP密钥", () => {
      const result = TOTPDebugger.validateTOTPSecret(validSecret);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it("应该检测空的密钥", () => {
      const result = TOTPDebugger.validateTOTPSecret("");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥为空或类型错误");
      expect(result.suggestions).toContain("请重新生成TOTP设置");
    });

    it("应该检测长度不足的密钥", () => {
      const result = TOTPDebugger.validateTOTPSecret("ABCD");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥长度不足");
    });

    it("应该检测无效的base32格式", () => {
      const result = TOTPDebugger.validateTOTPSecret("invalid-secret!@#");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥不是有效的base32编码");
    });

    it("应该检测包含非法字符的密钥", () => {
      const result = TOTPDebugger.validateTOTPSecret("ABCDEFGHIJKLMNOP!");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥包含非法字符");
    });

    it("应该检测解码后长度不足的密钥", () => {
      // 创建一个base32格式正确但解码后长度不足的密钥
      const shortSecret = "ABCDEFGHIJ"; // 10个字符，解码后可能不足
      const result = TOTPDebugger.validateTOTPSecret(shortSecret);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("TOTP密钥解码后长度不足");
    });
  });

  describe("generateTestToken", () => {
    it("应该生成当前时间的测试令牌", () => {
      const token = TOTPDebugger.generateTestToken(validSecret);

      expect(token).toBeDefined();
      expect(token).toHaveLength(6);
      expect(/^\d{6}$/.test(token)).toBe(true);
    });

    it("应该生成指定时间偏移的测试令牌", () => {
      const currentToken = TOTPDebugger.generateTestToken(validSecret, 0);
      const futureToken = TOTPDebugger.generateTestToken(validSecret, 30); // 30秒后
      const pastToken = TOTPDebugger.generateTestToken(validSecret, -30); // 30秒前

      expect(currentToken).toBeDefined();
      expect(futureToken).toBeDefined();
      expect(pastToken).toBeDefined();
      expect(currentToken).not.toBe(futureToken);
      expect(currentToken).not.toBe(pastToken);
    });

    it("应该在无效密钥时返回空字符串", () => {
      const token = TOTPDebugger.generateTestToken("invalid-secret");

      expect(token).toBe("");
    });
  });

  describe("checkTimeSync", () => {
    it("应该返回时间同步信息", () => {
      const result = TOTPDebugger.checkTimeSync();

      expect(result).toHaveProperty("serverTime");
      expect(result).toHaveProperty("timeZone");
      expect(result).toHaveProperty("timeOffset");
      expect(result).toHaveProperty("issues");
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it("应该检测时间偏移问题", () => {
      // 模拟一个大的时间偏移
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(360); // 6小时偏移

      const result = TOTPDebugger.checkTimeSync();

      expect(result.issues).toContain("服务器时间可能不准确");

      // 恢复原始方法
      Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
    });

    it("应该在正常时间偏移时不报告问题", () => {
      // 模拟正常的时间偏移和正确的时区
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(-60); // 1小时偏移，在300分钟阈值内
      Intl.DateTimeFormat.prototype.resolvedOptions = jest.fn().mockReturnValue({
        timeZone: "Asia/Shanghai",
      });

      const result = TOTPDebugger.checkTimeSync();

      expect(result.issues).toHaveLength(0);

      // 恢复原始方法
      Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
      Intl.DateTimeFormat.prototype.resolvedOptions = originalResolvedOptions;
    });
  });

  describe("集成测试", () => {
    it("应该能够诊断并验证完整的TOTP流程", () => {
      // 1. 验证密钥
      const secretValidation = TOTPDebugger.validateTOTPSecret(validSecret);
      expect(secretValidation.isValid).toBe(true);

      // 2. 生成测试令牌
      const testToken = TOTPDebugger.generateTestToken(validSecret);
      expect(testToken).toBeDefined();

      // 3. 诊断验证
      const diagnosis = TOTPDebugger.diagnoseTOTPVerification(testToken, validSecret, "testuser");
      expect(diagnosis.isValid).toBe(true);

      // 4. 检查时间同步
      const timeSync = TOTPDebugger.checkTimeSync();
      expect(timeSync).toBeDefined();
    });

    it("应该处理边界情况", () => {
      // 测试各种边界情况
      const emptyResult = TOTPDebugger.diagnoseTOTPVerification("", "", "");
      expect(emptyResult.isValid).toBe(false);

      const nullResult = TOTPDebugger.validateTOTPSecret(null as any);
      expect(nullResult.isValid).toBe(false);

      const undefinedResult = TOTPDebugger.generateTestToken(undefined as any);
      expect(undefinedResult).toBe("");

      // 测试空字符串
      const emptyStringResult = TOTPDebugger.generateTestToken("");
      expect(emptyStringResult).toBe("");

      // 测试无效的base32字符串
      const invalidBase32Result = TOTPDebugger.generateTestToken("invalid!@#");
      expect(invalidBase32Result).toBe("");
    });
  });

  describe("错误处理", () => {
    it("应该优雅地处理speakeasy库的错误", () => {
      // 使用jest.spyOn模拟speakeasy.totp抛出错误
      const totpSpy = jest.spyOn(speakeasy, "totp").mockImplementation(() => {
        throw new Error("Speakeasy error");
      });

      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, validSecret, "testuser");

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("诊断过程中发生错误: Speakeasy error");

      totpSpy.mockRestore();
    });

    it("应该处理otpauth URL生成错误", () => {
      // 使用jest.spyOn模拟speakeasy.otpauthURL抛出错误
      const otpauthURLSpy = jest.spyOn(speakeasy, "otpauthURL").mockImplementation(() => {
        throw new Error("URL generation error");
      });

      const result = TOTPDebugger.diagnoseTOTPVerification(validToken, validSecret, "testuser");

      expect(result.debugInfo.otpauthUrlError).toBe("URL generation error");

      otpauthURLSpy.mockRestore();
    });
  });
});
