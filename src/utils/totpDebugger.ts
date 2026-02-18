import speakeasy from "speakeasy";
import logger from "./logger";

// 确保时区设置为上海
if (process.env.TZ !== "Asia/Shanghai") {
  process.env.TZ = "Asia/Shanghai";
  logger.info("TOTP调试工具时区已设置为上海");
}

// 辅助函数：base32解码
function base32Decode(str: string): Buffer {
  // 移除填充字符
  const cleanStr = str.replace(/=/g, "");
  // 转换为大写
  const upperStr = cleanStr.toUpperCase();

  // base32字符集
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < upperStr.length; i++) {
    const char = upperStr[i];
    const index = base32Chars.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output += String.fromCharCode((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output, "binary");
}

export class TOTPDebugger {
  /**
   * 诊断TOTP验证问题
   */
  public static diagnoseTOTPVerification(
    token: string,
    secret: string,
    username: string,
  ): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
    debugInfo: any;
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const debugInfo: any = {};

    try {
      // 1. 检查token格式
      if (!/^\d{6}$/.test(token)) {
        issues.push("验证码格式错误：必须是6位数字");
        suggestions.push("请确保输入的是6位数字验证码");
      }

      // 2. 检查secret格式
      if (!secret || typeof secret !== "string") {
        issues.push("TOTP密钥无效");
        suggestions.push("请重新生成TOTP设置");
        return { isValid: false, issues, suggestions, debugInfo };
      }

      // 3. 检查secret是否为有效的base32格式
      try {
        // 尝试解码base32
        const decoded = base32Decode(secret);
        debugInfo.secretLength = secret.length;
        debugInfo.decodedLength = decoded.length;
      } catch (error) {
        const _errorMessage = error instanceof Error ? error.message : "Unknown error";
        issues.push("TOTP密钥格式错误：不是有效的base32编码");
        suggestions.push("请重新生成TOTP设置");
      }

      // 4. 获取当前时间戳
      const now = Math.floor(Date.now() / 1000);
      const step = 30; // 30秒一个周期
      const currentStep = Math.floor(now / step);

      debugInfo.currentTime = new Date().toISOString();
      debugInfo.currentStep = currentStep;
      debugInfo.step = step;

      // 5. 生成当前时间窗口的验证码
      const currentToken = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
      });

      debugInfo.expectedToken = currentToken;

      // 6. 检查前后时间窗口
      const prevStep = currentStep - 1;
      const nextStep = currentStep + 1;

      const prevToken = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
        time: prevStep * step,
      });

      const nextToken = speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
        time: nextStep * step,
      });

      debugInfo.prevToken = prevToken;
      debugInfo.nextToken = nextToken;

      // 7. 检查是否匹配任何时间窗口
      const isCurrentMatch = token === currentToken;
      const isPrevMatch = token === prevToken;
      const isNextMatch = token === nextToken;

      debugInfo.matches = {
        current: isCurrentMatch,
        previous: isPrevMatch,
        next: isNextMatch,
      };

      // 8. 使用标准验证方法
      const isValid = speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token,
        window: 2,
        step: 30,
      });

      debugInfo.standardVerification = isValid;

      // 9. 分析问题
      if (!isValid) {
        if (!isCurrentMatch && !isPrevMatch && !isNextMatch) {
          issues.push("验证码不匹配任何时间窗口");
          suggestions.push("请检查认证器应用是否与服务器时间同步");
          suggestions.push("请确保使用的是最新生成的验证码");
        }

        if (isCurrentMatch || isPrevMatch || isNextMatch) {
          issues.push("验证码格式正确但验证失败");
          suggestions.push("可能是TOTP密钥不匹配，请重新扫描QR码");
        }
      }

      // 10. 生成otpauth URL用于调试
      try {
        const otpauthUrl = speakeasy.otpauthURL({
          secret,
          label: username,
          issuer: "Happy TTS",
          algorithm: "sha1",
          digits: 6,
          period: 30,
        });
        debugInfo.otpauthUrl = otpauthUrl.replace(/secret=[^&]+/, "secret=***");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        debugInfo.otpauthUrlError = errorMessage;
      }

      return { isValid, issues, suggestions, debugInfo };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      issues.push(`诊断过程中发生错误: ${errorMessage}`);
      suggestions.push("请检查系统配置或联系管理员");
      return { isValid: false, issues, suggestions, debugInfo: { error: errorMessage } };
    }
  }

  /**
   * 验证TOTP密钥是否有效
   */
  public static validateTOTPSecret(secret: string): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
      // 检查是否为空
      if (!secret || typeof secret !== "string") {
        issues.push("TOTP密钥为空或类型错误");
        suggestions.push("请重新生成TOTP设置");
        return { isValid: false, issues, suggestions };
      }

      // 检查长度
      if (secret.length < 16) {
        issues.push("TOTP密钥长度不足");
        suggestions.push("请重新生成TOTP设置");
      }

      // 检查是否为有效的base32格式
      try {
        const decoded = base32Decode(secret);
        if (decoded.length < 10) {
          issues.push("TOTP密钥解码后长度不足");
          suggestions.push("请重新生成TOTP设置");
        }
      } catch (_error) {
        issues.push("TOTP密钥不是有效的base32编码");
        suggestions.push("请重新生成TOTP设置");
      }

      // 检查是否包含非法字符
      if (!/^[A-Z2-7]+=*$/.test(secret)) {
        issues.push("TOTP密钥包含非法字符");
        suggestions.push("请重新生成TOTP设置");
      }

      return {
        isValid: issues.length === 0,
        issues,
        suggestions,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      issues.push(`验证过程中发生错误: ${errorMessage}`);
      suggestions.push("请检查系统配置或联系管理员");
      return { isValid: false, issues, suggestions };
    }
  }

  /**
   * 生成测试验证码
   */
  public static generateTestToken(secret: string, timeOffset: number = 0): string {
    try {
      // 首先验证密钥是否有效
      const validation = TOTPDebugger.validateTOTPSecret(secret);
      if (!validation.isValid) {
        logger.error("生成测试验证码失败: 无效的TOTP密钥", { issues: validation.issues });
        return "";
      }

      const now = Math.floor(Date.now() / 1000) + timeOffset;
      const step = 30;
      const currentStep = Math.floor(now / step);

      return speakeasy.totp({
        secret,
        encoding: "base32",
        step: 30,
        time: currentStep * step,
      });
    } catch (error) {
      logger.error("生成测试验证码失败:", error);
      return "";
    }
  }

  /**
   * 检查时间同步问题
   */
  public static checkTimeSync(): {
    serverTime: string;
    timeZone: string;
    timeOffset: number;
    issues: string[];
    shanghaiTime: string;
    timeZoneInfo: any;
  } {
    const issues: string[] = [];
    const now = new Date();
    const serverTime = now.toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const shanghaiTime = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    // 检查时间偏移（这里可以根据NTP服务器进行更精确的检查）
    const timeOffset = now.getTimezoneOffset();

    // 获取详细的时区信息
    const timeZoneInfo = {
      current: timeZone,
      expected: "Asia/Shanghai",
      isCorrect: timeZone === "Asia/Shanghai",
      offset: timeOffset,
      shanghaiOffset: 480, // 上海时区偏移（分钟）
      difference: Math.abs(timeOffset + 480), // 与上海时区的差异
    };

    if (Math.abs(timeOffset) > 300) {
      // 5分钟偏移
      issues.push("服务器时间可能不准确");
    }

    if (timeZone !== "Asia/Shanghai") {
      issues.push(`时区设置不正确: 当前=${timeZone}, 期望=Asia/Shanghai`);
    }

    return {
      serverTime,
      timeZone,
      timeOffset,
      issues,
      shanghaiTime,
      timeZoneInfo,
    };
  }
}
