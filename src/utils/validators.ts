/**
 * FBI通缉犯数据验证工具函数
 * 提供全面的输入验证和清理功能
 */

/**
 * 安全的输入清理函数
 * @param str 输入字符串
 * @param maxLength 最大长度限制
 * @returns 清理后的字符串
 */
export function sanitizeInput(str: string | undefined | null, maxLength: number = 500): string {
  if (typeof str !== "string" || !str) {
    return "";
  }

  // 1. 限制长度
  let cleaned = str.substring(0, maxLength);

  // 2. 移除HTML标签（迭代清理防止嵌套绕过）
  const maxIterations = 10;
  let previousCleaned = "";

  for (let i = 0; i < maxIterations && cleaned !== previousCleaned; i++) {
    previousCleaned = cleaned;
    cleaned = cleaned.replace(/<[^>]*>/g, "");
  }

  // 3. 移除潜在的脚本注入（合并模式，迭代替换直到完全清理）
  // 单个正则表达式包含所有危险模式，避免不完整的多字符清理漏洞
  previousCleaned = "";

  for (let i = 0; i < maxIterations && cleaned !== previousCleaned; i++) {
    previousCleaned = cleaned;
    // 每次都创建新的正则实例，避免全局标志的 lastIndex 状态问题
    cleaned = cleaned.replace(/javascript:|vbscript:|data:|on\w+\s*=/gi, "");
  }

  // 4. 转义特殊字符
  cleaned = cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  // 5. 移除控制字符
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, "");

  // 6. trim空白字符
  return cleaned.trim();
}

/**
 * 验证悬赏金额
 */
export function validateReward(reward: any): { valid: boolean; value?: number; error?: string } {
  if (reward === undefined || reward === null) {
    return { valid: false, error: "悬赏金额不能为空" };
  }

  const num = Number(reward);

  if (isNaN(num)) {
    return { valid: false, error: "悬赏金额必须是有效数字" };
  }

  if (!isFinite(num)) {
    return { valid: false, error: "悬赏金额不能为无穷大" };
  }

  if (num < 0) {
    return { valid: false, error: "悬赏金额不能为负数" };
  }

  if (num > 999999999) {
    return { valid: false, error: "悬赏金额超出范围（最大9.99亿）" };
  }

  return { valid: true, value: num };
}

/**
 * 验证年龄
 */
export function validateAge(age: any): { valid: boolean; value?: number; error?: string } {
  if (age === undefined || age === null || age === "") {
    return { valid: true, value: 0 }; // 年龄可选
  }

  const num = Number(age);

  if (isNaN(num)) {
    return { valid: false, error: "年龄必须是有效数字" };
  }

  if (!isFinite(num)) {
    return { valid: false, error: "年龄不能为无穷大" };
  }

  if (num < 0) {
    return { valid: false, error: "年龄不能为负数" };
  }

  if (num > 150) {
    return { valid: false, error: "年龄不能超过150岁" };
  }

  return { valid: true, value: Math.floor(num) };
}

/**
 * 验证指控数组
 */
export function validateCharges(charges: any): { valid: boolean; error?: string } {
  if (!Array.isArray(charges)) {
    return { valid: false, error: "指控必须是数组" };
  }

  if (charges.length === 0) {
    return { valid: false, error: "至少需要一条指控" };
  }

  if (charges.length > 50) {
    return { valid: false, error: "指控数量不能超过50条" };
  }

  // 检查每条指控
  for (const charge of charges) {
    if (typeof charge !== "string") {
      return { valid: false, error: "每条指控必须是字符串" };
    }

    const trimmed = charge.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: "指控内容不能为空" };
    }

    if (trimmed.length > 500) {
      return { valid: false, error: "单条指控长度不能超过500字符" };
    }
  }

  return { valid: true };
}

/**
 * 验证姓名
 */
export function validateName(name: any): { valid: boolean; error?: string } {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "姓名不能为空" };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: "姓名至少需要2个字符" };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: "姓名不能超过100个字符" };
  }

  // 检查是否包含非法字符或危险模式
  // 使用统一的危险模式检测，防止 XSS 和脚本注入
  if (/<|>|javascript:|vbscript:|data:|on\w+\s*=/i.test(trimmed)) {
    return { valid: false, error: "姓名包含非法字符" };
  }

  return { valid: true };
}

/**
 * 验证危险等级
 */
export function validateDangerLevel(level: any): { valid: boolean; error?: string } {
  const allowedLevels = ["LOW", "MEDIUM", "HIGH", "EXTREME"];

  if (typeof level !== "string" || !allowedLevels.includes(level)) {
    return {
      valid: false,
      error: `危险等级必须是: ${allowedLevels.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * 验证状态
 */
export function validateStatus(status: any): { valid: boolean; error?: string } {
  const allowedStatus = ["ACTIVE", "CAPTURED", "DECEASED", "REMOVED"];

  if (typeof status !== "string" || !allowedStatus.includes(status)) {
    return {
      valid: false,
      error: `状态必须是: ${allowedStatus.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * 验证别名数组
 */
export function validateAliases(aliases: any): { valid: boolean; error?: string } {
  if (!Array.isArray(aliases)) {
    return { valid: false, error: "别名必须是数组" };
  }

  if (aliases.length > 20) {
    return { valid: false, error: "别名数量不能超过20个" };
  }

  for (const alias of aliases) {
    if (typeof alias !== "string") {
      return { valid: false, error: "每个别名必须是字符串" };
    }

    if (alias.trim().length > 100) {
      return { valid: false, error: "单个别名长度不能超过100字符" };
    }
  }

  return { valid: true };
}

/**
 * 验证字符串数组（通用）
 */
export function validateStringArray(
  arr: any,
  fieldName: string,
  maxLength: number = 50,
  maxItemLength: number = 500,
): { valid: boolean; error?: string } {
  if (!Array.isArray(arr)) {
    return { valid: false, error: `${fieldName}必须是数组` };
  }

  if (arr.length > maxLength) {
    return { valid: false, error: `${fieldName}数量不能超过${maxLength}个` };
  }

  for (const item of arr) {
    if (typeof item !== "string") {
      return { valid: false, error: `${fieldName}的每个元素必须是字符串` };
    }

    if (item.trim().length > maxItemLength) {
      return { valid: false, error: `${fieldName}的单个元素长度不能超过${maxItemLength}字符` };
    }
  }

  return { valid: true };
}

/**
 * 验证URL（可选）
 */
export function validateURL(url: any, required: boolean = false): { valid: boolean; error?: string } {
  if (!url || url === "") {
    if (required) {
      return { valid: false, error: "URL不能为空" };
    }
    return { valid: true };
  }

  if (typeof url !== "string") {
    return { valid: false, error: "URL必须是字符串" };
  }

  if (url.length > 2000) {
    return { valid: false, error: "URL长度不能超过2000字符" };
  }

  // 严格的URL格式验证 - 必须以http://或https://开头
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { valid: false, error: "URL必须以http://或https://开头" };
  }

  // 检查危险协议
  const lowerUrl = url.toLowerCase();
  const dangerousSchemes = ["javascript:", "data:", "vbscript:", "file:", "about:"];
  for (const scheme of dangerousSchemes) {
    if (lowerUrl.includes(scheme)) {
      return { valid: false, error: "URL包含不安全的协议" };
    }
  }

  // URL格式验证
  try {
    const urlObj = new URL(url);
    // 只允许http和https协议
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return { valid: false, error: "只允许http和https协议" };
    }
  } catch (error) {
    return { valid: false, error: "URL格式不正确" };
  }

  return { valid: true };
}

/**
 * 验证日期
 */
export function validateDate(date: any, required: boolean = false): { valid: boolean; value?: Date; error?: string } {
  if (!date || date === "") {
    if (required) {
      return { valid: false, error: "日期不能为空" };
    }
    return { valid: true, value: undefined };
  }

  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: "日期格式不正确" };
  }

  // 检查日期是否在合理范围内（1900-2100）
  const year = dateObj.getFullYear();
  if (year < 1900 || year > 2100) {
    return { valid: false, error: "日期必须在1900-2100年之间" };
  }

  return { valid: true, value: dateObj };
}

/**
 * 批量验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 收集多个验证结果
 */
export function collectValidationErrors(...results: Array<{ valid: boolean; error?: string }>): ValidationResult {
  const errors: string[] = [];

  for (const result of results) {
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
