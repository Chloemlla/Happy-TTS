import { TOTPService } from "../services/totpService";

describe("TOTP服务测试", () => {
  test("生成密钥和otpauth URL的一致性", async () => {
    const username = "testuser";
    const serviceName = "Test Service";

    // 1. 生成密钥
    const secret = TOTPService.generateSecret(username, serviceName);
    console.log("生成的密钥:", secret);

    // 2. 生成otpauth URL
    const otpauthUrl = TOTPService.generateOTPAuthURL(secret, username, serviceName);
    console.log("生成的otpauth URL:", otpauthUrl);

    // 3. 从URL中提取密钥
    const secretMatch = otpauthUrl.match(/secret=([^&]+)/);
    const extractedSecret = secretMatch ? secretMatch[1] : null;
    const decodedSecret = extractedSecret ? decodeURIComponent(extractedSecret) : null;

    console.log("URL中提取的密钥:", extractedSecret);
    console.log("URL解码后的密钥:", decodedSecret);
    console.log("密钥匹配:", secret === decodedSecret);

    // 4. 生成二维码
    const qrCodeDataUrl = await TOTPService.generateQRCodeDataURL(secret, username, serviceName);
    console.log("生成的二维码Data URL长度:", qrCodeDataUrl.length);

    // 5. 验证TOTP令牌
    const token1 = require("speakeasy").totp({
      secret: secret,
      encoding: "base32",
      step: 30,
    });

    const token2 = require("speakeasy").totp({
      secret: decodedSecret!,
      encoding: "base32",
      step: 30,
    });

    console.log("原始密钥生成的验证码:", token1);
    console.log("URL密钥生成的验证码:", token2);
    console.log("验证码匹配:", token1 === token2);

    // 断言
    expect(secret).toBeDefined();
    expect(secret.length).toBe(32); // base32密钥应该是32字符
    expect(otpauthUrl).toBeDefined();
    expect(decodedSecret).toBeDefined();
    expect(decodedSecret).toBe(secret); // URL中的密钥应该与原始密钥一致
    expect(qrCodeDataUrl).toBeDefined();
    expect(qrCodeDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(token1).toBe(token2); // 两个密钥应该生成相同的TOTP
  });

  test("验证TOTP令牌", () => {
    const secret = TOTPService.generateSecret("testuser", "Test Service");

    // 生成当前时间的TOTP令牌
    const token = require("speakeasy").totp({
      secret: secret,
      encoding: "base32",
      step: 30,
    });

    console.log("生成的TOTP令牌:", token);

    // 验证令牌
    const isValid = TOTPService.verifyToken(token, secret);
    console.log("令牌验证结果:", isValid);

    expect(isValid).toBe(true);
  });

  test("生成备用恢复码", async () => {
    const backupCodes = TOTPService.generateBackupCodes();

    expect(backupCodes).toBeDefined();
    expect(backupCodes.length).toBe(10);
    expect(backupCodes.every((code) => /^[A-Z0-9]{8}$/.test(code))).toBe(true);

    // G2-14：verifyBackupCode 是 async，返回 { matched, remainingHashes }，
    // 报废的是返回里的副本，入参不变（旧明文条目走恒时比较的兼容分支）。
    const testCode = backupCodes[0];
    const result = await TOTPService.verifyBackupCode(testCode, backupCodes);

    expect(result.matched).toBe(true);
    expect(result.remainingHashes).toHaveLength(9);
    expect(backupCodes).toHaveLength(10);

    // 从已报废的副本里再验证一次同一码，必须不命中。
    const replay = await TOTPService.verifyBackupCode(testCode, result.remainingHashes);
    expect(replay.matched).toBe(false);
  });
});
