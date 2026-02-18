import speakeasy from "speakeasy";
import { TOTPService } from "../services/totpService";

describe("TOTP密钥问题诊断", () => {
  const testUsername = "testuser";
  const testServiceName = "Happy TTS";

  describe("密钥生成问题诊断", () => {
    test("诊断密钥长度问题", () => {
      // 测试不同的密钥长度
      const lengths = [16, 20, 32];

      lengths.forEach((length) => {
        const secret = speakeasy.generateSecret({
          name: `${testServiceName} (${testUsername})`,
          issuer: testServiceName,
          length: length,
        });

        console.log(`密钥长度 ${length} 字节 -> base32长度: ${secret.base32.length} 字符`);
        console.log(`密钥: ${secret.base32}`);

        // 验证base32格式
        const isValidBase32 = /^[A-Z2-7]+=*$/.test(secret.base32);
        console.log(`有效base32格式: ${isValidBase32}`);

        // 生成验证码
        const token = speakeasy.totp({
          secret: secret.base32,
          encoding: "base32",
          step: 30,
        });

        console.log(`生成的验证码: ${token}`);
        console.log("---");
      });
    });

    test("诊断手动输入vs扫码密钥差异", () => {
      // 模拟手动输入的密钥（标准32字符）
      const manualSecret = "JBSWY3DPEHPK3PXP";

      // 生成新的密钥（可能有问题）
      const generatedSecret = TOTPService.generateSecret(testUsername, testServiceName);

      console.log("手动输入密钥:", manualSecret);
      console.log("生成密钥:", generatedSecret);
      console.log("手动密钥长度:", manualSecret.length);
      console.log("生成密钥长度:", generatedSecret.length);

      // 生成验证码
      const manualToken = speakeasy.totp({
        secret: manualSecret,
        encoding: "base32",
        step: 30,
      });

      const generatedToken = speakeasy.totp({
        secret: generatedSecret,
        encoding: "base32",
        step: 30,
      });

      console.log("手动密钥验证码:", manualToken);
      console.log("生成密钥验证码:", generatedToken);

      // 验证两个密钥是否都能正确工作
      const manualValid = TOTPService.verifyToken(manualToken, manualSecret);
      const generatedValid = TOTPService.verifyToken(generatedToken, generatedSecret);

      console.log("手动密钥验证结果:", manualValid);
      console.log("生成密钥验证结果:", generatedValid);

      expect(manualValid).toBe(true);
      expect(generatedValid).toBe(true);
    });
  });

  describe("otpauth URL问题诊断", () => {
    test("诊断URL中的密钥问题", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);

      console.log("原始密钥:", secret);
      console.log("otpauth URL:", otpauthUrl);

      // 从URL中提取密钥
      const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
      const extractedSecret = secretMatch ? secretMatch[1] : null;

      console.log("URL中提取的密钥:", extractedSecret);
      console.log("密钥匹配:", secret === extractedSecret);

      // 验证URL格式
      const url = new URL(otpauthUrl.replace("otpauth://", "http://"));
      const params = url.searchParams;

      console.log("URL参数:");
      console.log("- secret:", params.get("secret"));
      console.log("- issuer:", params.get("issuer"));
      console.log("- algorithm:", params.get("algorithm"));
      console.log("- digits:", params.get("digits"));
      console.log("- period:", params.get("period"));

      expect(secret).toBe(extractedSecret);
    });

    test("诊断特殊字符处理", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 测试包含特殊字符的用户名和服务名
      const specialUsername = "test@user.com";
      const specialServiceName = "Happy TTS & Co.";

      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, specialUsername, specialServiceName);

      console.log("特殊用户名:", specialUsername);
      console.log("特殊服务名:", specialServiceName);
      console.log("生成的URL:", otpauthUrl);

      // 验证特殊字符是否被正确处理
      expect(otpauthUrl).toContain("test_user_com");
      expect(otpauthUrl).toContain("Happy-TTS---Co-");
      expect(otpauthUrl).toContain(`secret=${secret}`);
    });
  });

  describe("验证码生成问题诊断", () => {
    test("诊断时间同步问题", () => {
      const secret = TOTPService.generateSecret(testUsername, testServiceName);

      // 生成多个时间窗口的验证码
      const now = Math.floor(Date.now() / 1000);
      const step = 30;

      for (let i = -2; i <= 2; i++) {
        const time = now + i * step;
        const token = speakeasy.totp({
          secret,
          encoding: "base32",
          step: 30,
          time: time,
        });

        console.log(`时间窗口 ${i}: ${token} (时间: ${new Date(time * 1000).toISOString()})`);
      }

      // 验证当前时间窗口的验证码
      const currentToken = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
      });

      const isValid = TOTPService.verifyToken(currentToken, secret);
      console.log("当前验证码:", currentToken);
      console.log("验证结果:", isValid);

      expect(isValid).toBe(true);
    });

    test("诊断不同密钥的验证码差异", () => {
      // 测试多个不同的密钥
      const secrets = [
        "JBSWY3DPEHPK3PXP", // 标准密钥
        TOTPService.generateSecret(testUsername, testServiceName), // 生成的密钥
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", // 另一个测试密钥
      ];

      secrets.forEach((secret, index) => {
        const token = speakeasy.totp({
          secret,
          encoding: "base32",
          step: 30,
        });

        const isValid = TOTPService.verifyToken(token, secret);

        console.log(`密钥 ${index + 1}:`);
        console.log(`  密钥: ${secret}`);
        console.log(`  长度: ${secret.length}`);
        console.log(`  验证码: ${token}`);
        console.log(`  验证结果: ${isValid}`);
        console.log("---");

        expect(isValid).toBe(true);
      });
    });
  });

  describe("问题总结和建议", () => {
    test("生成问题诊断报告", () => {
      console.log("\n=== TOTP密钥问题诊断报告 ===");

      // 1. 密钥长度问题
      const secret = TOTPService.generateSecret(testUsername, testServiceName);
      console.log(`1. 密钥长度: ${secret.length} 字符 (应该是32字符)`);

      // 2. URL格式问题
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, testUsername, testServiceName);
      const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
      const urlSecret = secretMatch ? secretMatch[1] : null;
      console.log(`2. URL密钥匹配: ${secret === urlSecret}`);

      // 3. 验证码生成问题
      const token = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
      });
      const isValid = TOTPService.verifyToken(token, secret);
      console.log(`3. 验证码生成和验证: ${isValid ? "正常" : "异常"}`);

      // 4. 建议
      console.log("\n=== 建议 ===");
      if (secret.length !== 32) {
        console.log("- 密钥长度不是32字符，可能导致兼容性问题");
      }
      if (secret !== urlSecret) {
        console.log("- URL中的密钥与原始密钥不匹配");
      }
      if (!isValid) {
        console.log("- 验证码验证失败");
      }

      console.log("- 确保使用标准的32字符base32编码密钥");
      console.log("- 检查认证器应用是否正确解析URL");
      console.log("- 验证时间同步是否正确");

      // 所有测试都应该通过
      expect(secret.length).toBe(32);
      expect(secret).toBe(urlSecret);
      expect(isValid).toBe(true);
    });
  });
});
