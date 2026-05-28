import * as accessToken from "./turnstile/accessToken";
import * as config from "./turnstile/config";
import * as fingerprint from "./turnstile/fingerprint";
import * as hcaptcha from "./turnstile/hcaptcha";
import * as ipBan from "./turnstile/ipBan";
import * as verify from "./turnstile/verify";

export class TurnstileService {
  // 配置
  static isEnabled = config.isEnabled;
  static getConfig = config.getConfig;
  static updateConfig = config.updateConfig;
  static deleteConfig = config.deleteConfig;

  // IP 封禁
  static isIpBanned = ipBan.isIpBanned;
  static recordViolation = ipBan.recordViolation;
  static manualBanIp = ipBan.manualBanIp;
  static unbanIp = ipBan.unbanIp;
  static cleanupExpiredIpBans = ipBan.cleanupExpiredIpBans;
  static getIpBanStats = ipBan.getIpBanStats;

  // 访问密钥
  static generateAccessToken = accessToken.generateAccessToken;
  static generateDevToken = accessToken.generateDevToken;
  static verifyAccessToken = accessToken.verifyAccessToken;
  static hasValidAccessToken = accessToken.hasValidAccessToken;
  static cleanupExpiredAccessTokens = accessToken.cleanupExpiredAccessTokens;
  static getAccessTokenStats = accessToken.getAccessTokenStats;

  // 临时指纹
  static reportTempFingerprint = fingerprint.reportTempFingerprint;
  static checkTempFingerprintVerificationStatus = fingerprint.checkTempFingerprintVerificationStatus;
  static checkTempFingerprintStatus = fingerprint.checkTempFingerprintStatus;
  static cleanupExpiredFingerprints = fingerprint.cleanupExpiredFingerprints;
  static getTempFingerprintStats = fingerprint.getTempFingerprintStats;

  // Turnstile 验证
  static verifyToken = verify.verifyToken;
  static verifyTokenDetailed = verify.verifyTokenDetailed;
  static verifyTempFingerprint = verify.verifyTempFingerprint;

  // hCaptcha
  static verifyHCaptchaToken = hcaptcha.verifyHCaptchaToken;
  static isHCaptchaEnabled = hcaptcha.isHCaptchaEnabled;
  static getHCaptchaConfig = hcaptcha.getHCaptchaConfig;
  static updateHCaptchaConfig = hcaptcha.updateHCaptchaConfig;
  static deleteHCaptchaConfig = hcaptcha.deleteHCaptchaConfig;
}
