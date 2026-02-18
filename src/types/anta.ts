/**
 * 安踏防伪查询系统类型定义
 * Anta Anti-Counterfeit System Type Definitions
 */

// 产品信息接口
export interface ProductInfo {
  barcode: string; // 条码：BRA047EBXF
  gender: string; // 性别：男
  productName: string; // 品名：跑鞋
  series: string; // 系列：跑步系列
  itemNumber: string; // 货号：112535584-1
  ean: string; // EAN：2000000134554
  size: string; // 尺码：11
  retailPrice: number; // 零售价：799.00
  queryCount: number; // 查询次数：167
}

// 查询统计接口
export interface QueryStats {
  productId: string;
  queryCount: number;
  firstQueried: Date;
  lastQueried: Date;
  ipAddresses: string[]; // 记录查询的IP地址（用于统计分析）
}

// 错误类型枚举
export enum AntiCounterfeitErrorType {
  INVALID_PRODUCT_ID = "INVALID_PRODUCT_ID",
  PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",
  API_TIMEOUT = "API_TIMEOUT",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  PARSING_ERROR = "PARSING_ERROR",
}

// 错误接口
export interface AntiCounterfeitError {
  type: AntiCounterfeitErrorType;
  message: string;
  details?: any;
}

// API请求接口
export interface QueryProductRequest {
  params: {
    productId: string;
  };
}

// API响应接口
export interface QueryProductResponse {
  success: boolean;
  data?: ProductInfo;
  error?: string;
  queryCount?: number;
}

// 查询统计响应接口
export interface QueryStatsResponse {
  success: boolean;
  data: {
    productId: string;
    queryCount: number;
    lastQueried: string;
  };
}

// 配置接口
export interface AntiCounterfeitConfig {
  apiBaseUrl: string; // 安踏API基础URL
  timeout: number; // 请求超时时间
  retryAttempts: number; // 重试次数
  cacheEnabled: boolean; // 是否启用缓存
  cacheTTL: number; // 缓存过期时间
}

// 原始HTML解析结果接口
export interface ParsedProductData {
  barcode?: string;
  gender?: string;
  productName?: string;
  series?: string;
  itemNumber?: string;
  ean?: string;
  size?: string;
  retailPrice?: string;
}

/**
 * 验证产品ID格式
 * @param productId 产品ID
 * @returns 是否有效
 */
export function validateProductId(productId: string): boolean {
  if (!productId || typeof productId !== "string") {
    return false;
  }

  // 产品ID应该是非空字符串，包含字母数字和特定符号
  const productIdRegex = /^[A-Za-z0-9\-_]+$/;
  return productIdRegex.test(productId.trim()) && productId.trim().length > 0;
}

/**
 * 验证并清理产品信息
 * @param data 原始产品数据
 * @returns 验证后的产品信息
 */
export function validateProductInfo(data: ParsedProductData): ProductInfo | null {
  if (!data) {
    return null;
  }

  // 检查必需字段
  if (!data.barcode || !data.productName) {
    return null;
  }

  try {
    const retailPrice = data.retailPrice ? parseFloat(data.retailPrice.replace(/[^\d.]/g, "")) : 0;

    return {
      barcode: data.barcode.trim(),
      gender: data.gender?.trim() || "未知",
      productName: data.productName.trim(),
      series: data.series?.trim() || "未知系列",
      itemNumber: data.itemNumber?.trim() || "未知",
      ean: data.ean?.trim() || "未知",
      size: data.size?.trim() || "未知",
      retailPrice: isNaN(retailPrice) ? 0 : retailPrice,
      queryCount: 0, // 初始查询次数为0，由统计服务更新
    };
  } catch (error) {
    return null;
  }
}

/**
 * 创建标准化错误对象
 * @param type 错误类型
 * @param message 错误消息
 * @param details 错误详情
 * @returns 标准化错误对象
 */
export function createAntiCounterfeitError(
  type: AntiCounterfeitErrorType,
  message: string,
  details?: any,
): AntiCounterfeitError {
  return {
    type,
    message,
    details,
  };
}

/**
 * 获取用户友好的错误消息
 * @param error 错误对象
 * @returns 用户友好的错误消息
 */
export function getErrorMessage(error: AntiCounterfeitError): string {
  switch (error.type) {
    case AntiCounterfeitErrorType.INVALID_PRODUCT_ID:
      return "产品ID格式不正确，请检查输入的产品ID";
    case AntiCounterfeitErrorType.PRODUCT_NOT_FOUND:
      return "未找到该产品信息，请确认产品ID是否正确";
    case AntiCounterfeitErrorType.API_TIMEOUT:
      return "查询超时，请稍后重试";
    case AntiCounterfeitErrorType.NETWORK_ERROR:
      return "网络连接异常，请检查网络连接后重试";
    case AntiCounterfeitErrorType.SERVER_ERROR:
      return "服务器暂时不可用，请稍后重试";
    case AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED:
      return "查询过于频繁，请稍后再试";
    case AntiCounterfeitErrorType.PARSING_ERROR:
      return "数据解析失败，请稍后重试";
    default:
      return error.message || "查询失败，请稍后重试";
  }
}

/**
 * 验证查询统计数据
 * @param stats 查询统计数据
 * @returns 是否有效
 */
export function validateQueryStats(stats: Partial<QueryStats>): stats is QueryStats {
  return !!(
    stats.productId &&
    typeof stats.queryCount === "number" &&
    stats.firstQueried instanceof Date &&
    stats.lastQueried instanceof Date &&
    Array.isArray(stats.ipAddresses)
  );
}
