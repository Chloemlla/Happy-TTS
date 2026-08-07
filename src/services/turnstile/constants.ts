export const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";
export const MAX_VIOLATIONS = 3;
export const BAN_DURATION = 60 * 60 * 1000;
// 未达到封禁阈值前的违规记录冷却时间：保留计数但不会被 isIpBanned 命中
export const VIOLATION_COOLDOWN = 5 * 60 * 1000;
