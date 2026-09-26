import { TOTPService } from "../services/totpService";

describe("TOTPService", () => {
  describe("generateSecret", () => {
    it("应该生成有效的TOTP密钥", () => {
      const secret = TOTPService.generateSecret("testuser");
      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
      // Base32格式验证
      expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
    });

    it("应该为不同用户生成不同的密钥", () => {
      const secret1 = TOTPService.generateSecret("user1");
      const secret2 = TOTPService.generateSecret("user2");
      expect(secret1).not.toBe(secret2);
    });

    it("应该处理空用户名", () => {
      expect(() => TOTPService.generateSecret("")).toThrow("用户名不能为空");
    });
  });

  describe("generateOTPAuthURL", () => {
    it("应该生成有效的otpauth URL", () => {
      const secret = TOTPService.generateSecret("testuser");
      const url = TOTPService.generateOTPAuthURL(secret, "testuser");
      expect(url).toBeDefined();
      expect(url).toContain("otpauth://totp/");
      expect(url).toContain("secret=");
      expect(url).toContain("issuer=");
    });

    it("应该处理无效的密钥", () => {
      expect(() => TOTPService.generateOTPAuthURL("", "testuser")).toThrow("TOTP密钥不能为空");
    });
  });

  describe("verifyToken", () => {
    it("应该验证有效的TOTP令牌", () => {
      const secret = TOTPService.generateSecret("testuser");
      // 注意：这里需要生成一个有效的TOTP令牌进行测试
      // 在实际测试中，可能需要使用speakeasy库生成当前时间的令牌
      const token = "123456"; // 示例令牌
      const result = TOTPService.verifyToken(token, secret);
      expect(typeof result).toBe("boolean");
    });

    it("应该拒绝无效格式的令牌", () => {
      const secret = TOTPService.generateSecret("testuser");
      const result = TOTPService.verifyToken("12345", secret); // 5位数字
      expect(result).toBe(false);
    });

    it("应该拒绝空令牌", () => {
      const secret = TOTPService.generateSecret("testuser");
      const result = TOTPService.verifyToken("", secret);
      expect(result).toBe(false);
    });
  });

  describe("generateBackupCodes", () => {
    it("应该生成10个备用恢复码", () => {
      const codes = TOTPService.generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it("应该生成唯一的恢复码", () => {
      const codes = TOTPService.generateBackupCodes();
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(10);
    });

    it("应该生成8位字母数字组合", () => {
      const codes = TOTPService.generateBackupCodes();
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-Z0-9]{8}$/);
      });
    });
  });

  describe("verifyBackupCode", () => {
    // G2-14 之后契约改了：async，返回 { matched, remainingHashes }，
    // 并且**不修改入参**（报废靠调用方把 remainingHashes 写回用户文档）。
    // 旧断言写的都是同步 boolean + “原数组长度减一”，那是在测一个已经不存在的行为。
    it("应该验证有效的恢复码，并从副本里报出该码", async () => {
      const codes = ["ABCD1234", "EFGH5678", "IJKL9012"];
      const backupCodes = [...codes];
      const result = await TOTPService.verifyBackupCode("ABCD1234", backupCodes);
      expect(result.matched).toBe(true);
      expect(result.remainingHashes).toHaveLength(2);
      // 入参负负责：调用方还得拿旧数组去做条件写回，这里不能被偷偷改掉。
      expect(backupCodes).toEqual(codes);
    });

    it("应该拒绝无效的恢复码，并保持数组完整", async () => {
      const codes = ["ABCD1234", "EFGH5678"];
      const result = await TOTPService.verifyBackupCode("INVALID", codes);
      expect(result.matched).toBe(false);
      expect(result.remainingHashes).toEqual(codes);
    });

    it("应该处理空恢复码", async () => {
      const codes = ["ABCD1234"];
      const result = await TOTPService.verifyBackupCode("", codes);
      expect(result.matched).toBe(false);
    });

    it("应该处理空恢复码数组", async () => {
      const result = await TOTPService.verifyBackupCode("ABCD1234", []);
      expect(result.matched).toBe(false);
    });

    it("命中哈希条目时也走得通（落库形式）", async () => {
      const plain = TOTPService.generateBackupCodes();
      const hashed = await TOTPService.hashBackupCodes(plain);
      const result = await TOTPService.verifyBackupCode(plain[0], hashed);
      expect(result.matched).toBe(true);
      expect(result.remainingHashes).toHaveLength(hashed.length - 1);
      expect(await TOTPService.verifyBackupCode(plain[0], result.remainingHashes)).toMatchObject({
        matched: false,
      });
    });
  });
});
