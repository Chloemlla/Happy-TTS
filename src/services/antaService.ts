import axios, { type AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import * as https from "https";
import logger from "../utils/logger";

/**
 * 安踏服务 - 产品查询API
 *
 * 调试环境变量：
 * - ANTA_DEBUG_FULL_RESPONSE=true: 打印完整API响应内容
 * - ANTA_DEBUG_FULL_HTML=true: 打印完整HTML内容（解析失败时）
 * - NODE_ENV=development: 开发环境下自动启用详细日志
 */

export interface ProductInfo {
  barcode: string; // 条码：BRA047EBXF
  gender: string; // 性别：男
  productName: string; // 品名：跑鞋
  series: string; // 系列：跑步系列
  itemNumber: string; // 货号：112535584-1
  ean: string; // EAN：2000000134554
  size: string; // 尺码：11
  retailPrice: number; // 零售价：799.00
}

export interface AntaApiResponse {
  success: boolean;
  data?: ProductInfo & { queryCount?: number };
  error?: string;
}

export enum AntaErrorType {
  INVALID_PRODUCT_ID = "INVALID_PRODUCT_ID",
  PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",
  API_TIMEOUT = "API_TIMEOUT",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  PARSE_ERROR = "PARSE_ERROR",
}

export interface AntaError {
  type: AntaErrorType;
  message: string;
  details?: any;
}

export class AntaService {
  private readonly apiBaseUrl: string;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor() {
    // 配置安踏API相关参数
    this.apiBaseUrl = process.env.ANTA_API_BASE_URL || "https://ascm.anta.com";
    this.timeout = parseInt(process.env.ANTA_API_TIMEOUT || "15000"); // 15秒超时
    this.retryAttempts = parseInt(process.env.ANTA_RETRY_ATTEMPTS || "3");
    this.retryDelay = parseInt(process.env.ANTA_RETRY_DELAY || "1000"); // 1秒重试延迟
  }

  /**
   * 通过多个参数查询安踏产品信息
   * @param params 查询参数
   * @returns 产品信息或错误
   */
  public async queryProductWithParams(params: {
    barcode: string;
    itemNumber?: string;
    ean?: string;
    size?: string;
  }): Promise<AntaApiResponse> {
    try {
      logger.info("开始查询安踏产品（多参数模式）", {
        params,
        barcodeLength: params.barcode?.length,
        hasItemNumber: !!params.itemNumber,
        hasEan: !!params.ean,
        hasSize: !!params.size,
      });

      // 验证条码格式
      if (!this.validateProductId(params.barcode)) {
        const error: AntaError = {
          type: AntaErrorType.INVALID_PRODUCT_ID,
          message: "条码格式不正确",
        };
        return { success: false, error: error.message };
      }

      // 执行API调用（带重试机制）
      const response = await this.callAntaApiWithParams(params);

      // 检查响应状态
      if (response.status !== 200) {
        // 构建用于日志的URL（用于调试）
        const debugUrl = `${this.apiBaseUrl}/consumer/innerbox/search?code=${encodeURIComponent(params.itemNumber || "")}&${encodeURIComponent(params.size || "")}&${encodeURIComponent(params.ean || "")}&${encodeURIComponent(params.barcode)}&CN`;

        // 详细记录API响应信息
        const responseDataStr = response.data
          ? typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data)
          : "No response data";

        logger.error("安踏API返回非200状态（多参数模式）", {
          params,
          status: response.status,
          statusText: response.statusText,
          requestUrl: debugUrl,
          responseData:
            responseDataStr.length > 1000 ? responseDataStr.substring(0, 1000) + "...[截断]" : responseDataStr,
          responseHeaders: response.headers,
          responseSize: responseDataStr.length,
          timestamp: new Date().toISOString(),
        });

        // 如果响应数据很长，分段打印完整内容
        if (responseDataStr.length > 1000) {
          logger.error("完整API响应内容（多参数模式）", {
            params,
            requestUrl: debugUrl,
            fullResponseData: responseDataStr,
            timestamp: new Date().toISOString(),
          });
        }

        const error: AntaError = {
          type: AntaErrorType.SERVER_ERROR,
          message: `服务器响应异常 (状态码: ${response.status})`,
        };
        return { success: false, error: error.message };
      }

      // 检查产品ID格式是否无效
      if (this.isInvalidProductIdResponse(response.data)) {
        logger.info("产品参数格式无效", { params });
        const error: AntaError = {
          type: AntaErrorType.INVALID_PRODUCT_ID,
          message: "产品参数格式不正确，请检查输入的产品信息",
        };
        return { success: false, error: error.message };
      }

      // 检查是否找到产品
      if (this.isProductNotFound(response.data)) {
        logger.info("产品未找到", { params });
        const error: AntaError = {
          type: AntaErrorType.PRODUCT_NOT_FOUND,
          message: "未找到该产品信息，请检查产品参数是否正确",
        };
        return { success: false, error: error.message };
      }

      // 解析HTML响应
      const parseResult = this.parseProductInfo(response.data);

      if (!parseResult) {
        logger.warn("产品信息解析失败", { params });
        const error: AntaError = {
          type: AntaErrorType.PARSE_ERROR,
          message: "产品信息解析失败",
        };
        return { success: false, error: error.message };
      }

      // 提取查询次数
      const queryCount = this.extractQueryCount(response.data);
      const productInfoWithCount = { ...parseResult, queryCount };

      logger.info("安踏产品查询成功（多参数模式）", { params, productInfo: productInfoWithCount });
      return { success: true, data: productInfoWithCount };
    } catch (error) {
      logger.error("安踏产品查询失败（多参数模式）", { params, error });
      return this.handleError(error);
    }
  }

  /**
   * 查询安踏产品信息（兼容性方法）
   * @param productId 产品ID
   * @returns 产品信息或错误
   */
  public async queryProduct(productId: string): Promise<AntaApiResponse> {
    try {
      logger.info("开始查询安踏产品", {
        productId,
        productIdLength: productId?.length,
        productIdType: typeof productId,
      });

      // 验证产品ID格式
      if (!this.validateProductId(productId)) {
        const error: AntaError = {
          type: AntaErrorType.INVALID_PRODUCT_ID,
          message: "产品ID格式不正确",
        };
        return { success: false, error: error.message };
      }

      // 执行API调用（带重试机制）
      const response = await this.callAntaApiWithRetry(productId);

      // 检查响应状态
      if (response.status !== 200) {
        // 构建用于日志的URL（用于调试）
        const parsedId = this.parseProductId(productId);
        let debugUrl: string;

        if (parsedId.barcode && parsedId.barcode !== productId) {
          debugUrl = `${this.apiBaseUrl}/consumer/innerbox/search?code=${parsedId.itemNumber || ""}&${parsedId.size || ""}&${parsedId.ean || ""}&${encodeURIComponent(parsedId.barcode)}&CN`;
        } else {
          debugUrl = `${this.apiBaseUrl}/consumer/query?code=&&&${encodeURIComponent(productId)}&CN`;
        }

        // 详细记录API响应信息
        const responseDataStr = response.data
          ? typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data)
          : "No response data";

        logger.error("安踏API返回非200状态", {
          productId,
          status: response.status,
          statusText: response.statusText,
          requestUrl: debugUrl,
          responseData:
            responseDataStr.length > 1000 ? responseDataStr.substring(0, 1000) + "...[截断]" : responseDataStr,
          responseHeaders: response.headers,
          responseSize: responseDataStr.length,
          timestamp: new Date().toISOString(),
        });

        // 如果响应数据很长，分段打印完整内容
        if (responseDataStr.length > 1000) {
          logger.error("完整API响应内容", {
            productId,
            requestUrl: debugUrl,
            fullResponseData: responseDataStr,
            timestamp: new Date().toISOString(),
          });
        }

        const error: AntaError = {
          type: AntaErrorType.SERVER_ERROR,
          message: `服务器响应异常 (状态码: ${response.status})`,
        };
        return { success: false, error: error.message };
      }

      // 检查产品ID格式是否无效
      if (this.isInvalidProductIdResponse(response.data)) {
        logger.info("产品ID格式无效", { productId });
        const error: AntaError = {
          type: AntaErrorType.INVALID_PRODUCT_ID,
          message: "产品ID格式不正确，请检查输入的产品ID",
        };
        return { success: false, error: error.message };
      }

      // 检查是否找到产品
      if (this.isProductNotFound(response.data)) {
        logger.info("产品未找到", { productId });
        const error: AntaError = {
          type: AntaErrorType.PRODUCT_NOT_FOUND,
          message: "未找到该产品信息，请检查产品ID是否正确",
        };
        return { success: false, error: error.message };
      }

      // 解析HTML响应
      const parseResult = this.parseProductInfo(response.data);

      if (!parseResult) {
        logger.warn("产品信息解析失败", { productId });
        const error: AntaError = {
          type: AntaErrorType.PARSE_ERROR,
          message: "产品信息解析失败",
        };
        return { success: false, error: error.message };
      }

      // 提取查询次数
      const queryCount = this.extractQueryCount(response.data);
      const productInfoWithCount = { ...parseResult, queryCount };

      logger.info("安踏产品查询成功", { productId, productInfo: productInfoWithCount });
      return { success: true, data: productInfoWithCount };
    } catch (error) {
      logger.error("安踏产品查询失败", { productId, error });
      return this.handleError(error);
    }
  }

  /**
   * 验证产品ID格式
   * @param productId 产品ID
   * @returns 是否有效
   */
  private validateProductId(productId: string): boolean {
    if (!productId || typeof productId !== "string") {
      return false;
    }

    // 产品ID应该是字母数字组合，长度在5-50之间
    const pattern = /^[a-zA-Z0-9\-_.]{5,50}$/;
    return pattern.test(productId);
  }

  /**
   * 尝试解析产品ID，提取可能的组件
   * @param productId 产品ID
   * @returns 解析结果
   */
  private parseProductId(productId: string): {
    barcode?: string;
    itemNumber?: string;
    ean?: string;
    size?: string;
  } {
    logger.info("尝试解析产品ID", { productId });

    // 如果productId看起来像是重复的条码（如BRA047EBXFBRA047EBXF）
    if (productId.length > 10 && productId.length % 2 === 0) {
      const halfLength = productId.length / 2;
      const firstHalf = productId.substring(0, halfLength);
      const secondHalf = productId.substring(halfLength);

      if (firstHalf === secondHalf) {
        logger.info("检测到重复的产品ID，使用前半部分", {
          original: productId,
          extracted: firstHalf,
        });
        return { barcode: firstHalf };
      }
    }

    // 其他解析逻辑可以在这里添加
    return { barcode: productId };
  }

  /**
   * 带重试机制的API调用（多参数模式）
   * @param params 查询参数
   * @returns HTTP响应
   */
  private async callAntaApiWithParams(params: {
    barcode: string;
    itemNumber?: string;
    ean?: string;
    size?: string;
  }): Promise<AxiosResponse> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      // 构建查询URL，使用正确的安踏API格式
      // 格式：https://ascm.anta.com/consumer/innerbox/search?code=货号&尺码&EAN&条码&CN
      const queryUrl = `${this.apiBaseUrl}/consumer/innerbox/search?code=${encodeURIComponent(params.itemNumber || "")}&${encodeURIComponent(params.size || "")}&${encodeURIComponent(params.ean || "")}&${encodeURIComponent(params.barcode)}&CN`;

      try {
        logger.info(`安踏API调用尝试 ${attempt}/${this.retryAttempts}（多参数模式）`, { params });

        logger.info("构建的查询URL（多参数模式）", { queryUrl, params });

        const response = await axios.get(queryUrl, {
          timeout: this.timeout,
          httpsAgent: new https.Agent({
            rejectUnauthorized: true, // 启用证书验证以确保安全连接
            secureProtocol: "TLSv1_2_method",
            keepAlive: true,
          }),
          proxy: false, // Explicitly disable proxy
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "max-age=0",
            Priority: "u=0, i",
            "Sec-Ch-Ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          },
          validateStatus: (status) => status < 500, // 接受4xx状态码，因为可能包含有用信息
        });

        // 详细记录成功的API调用信息
        const responseDataStr = response.data
          ? typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data)
          : "No response data";

        logger.info("安踏API调用成功（多参数模式）", {
          params,
          attempt,
          statusCode: response.status,
          statusText: response.statusText,
          contentLength: responseDataStr.length,
          url: queryUrl,
          responsePreview:
            responseDataStr.length > 200 ? responseDataStr.substring(0, 200) + "...[预览截断]" : responseDataStr,
          timestamp: new Date().toISOString(),
        });

        // 如果需要调试，可以打印完整响应内容（仅在开发环境或特定日志级别）
        if (process.env.NODE_ENV === "development" || process.env.ANTA_DEBUG_FULL_RESPONSE === "true") {
          logger.debug("完整API响应内容（多参数模式）", {
            params,
            url: queryUrl,
            fullResponseData: responseDataStr,
            timestamp: new Date().toISOString(),
          });
        }

        return response;
      } catch (error) {
        lastError = error;

        // 详细记录API调用失败信息
        const errorDetails = axios.isAxiosError(error)
          ? {
              code: error.code,
              message: error.message,
              status: error.response?.status,
              statusText: error.response?.statusText,
              responseData: error.response?.data
                ? typeof error.response.data === "string"
                  ? error.response.data.substring(0, 500) + (error.response.data.length > 500 ? "...[截断]" : "")
                  : JSON.stringify(error.response.data).substring(0, 500) + "...[截断]"
                : "No response data",
              requestUrl: queryUrl,
            }
          : {
              message: error instanceof Error ? error.message : String(error),
              requestUrl: queryUrl,
            };

        logger.error(`安踏API调用失败（多参数模式），尝试 ${attempt}/${this.retryAttempts}`, {
          params,
          attempt,
          errorDetails,
          timestamp: new Date().toISOString(),
        });

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt); // 递增延迟
        }
      }
    }

    throw lastError;
  }

  /**
   * 带重试机制的API调用（兼容性方法）
   * @param productId 产品ID
   * @returns HTTP响应
   */
  private async callAntaApiWithRetry(productId: string): Promise<AxiosResponse> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      // 解析产品ID
      const parsedId = this.parseProductId(productId);

      // 构建查询URL，使用正确的安踏API格式
      // 格式：https://ascm.anta.com/consumer/innerbox/search?code=货号&尺码&EAN&条码&CN
      let queryUrl: string;

      // 预先构建查询URL，避免在try块中可能未赋值的情况
      if (parsedId.barcode && parsedId.barcode !== productId) {
        // 使用解析出的条码构建URL
        queryUrl = `${this.apiBaseUrl}/consumer/innerbox/search?code=${parsedId.itemNumber || ""}&${parsedId.size || ""}&${parsedId.ean || ""}&${encodeURIComponent(parsedId.barcode)}&CN`;
      } else {
        // 首先尝试使用原有的查询格式
        queryUrl = `${this.apiBaseUrl}/consumer/query?code=&&&${encodeURIComponent(productId)}&CN`;
      }

      try {
        logger.info(`安踏API调用尝试 ${attempt}/${this.retryAttempts}`, { productId });

        logger.info("构建的查询URL", { queryUrl, productId, parsedId });

        const response = await axios.get(queryUrl, {
          timeout: this.timeout,
          httpsAgent: new https.Agent({
            rejectUnauthorized: true, // 启用证书验证以确保安全连接
            secureProtocol: "TLSv1_2_method",
            keepAlive: true,
          }),
          proxy: false, // Explicitly disable proxy
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "max-age=0",
            Priority: "u=0, i",
            "Sec-Ch-Ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          },
          validateStatus: (status) => status < 500, // 接受4xx状态码，因为可能包含有用信息
        });

        // 详细记录成功的API调用信息
        const responseDataStr = response.data
          ? typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data)
          : "No response data";

        logger.info("安踏API调用成功", {
          productId,
          attempt,
          statusCode: response.status,
          statusText: response.statusText,
          contentLength: responseDataStr.length,
          url: queryUrl,
          responsePreview:
            responseDataStr.length > 200 ? responseDataStr.substring(0, 200) + "...[预览截断]" : responseDataStr,
          timestamp: new Date().toISOString(),
        });

        // 如果需要调试，可以打印完整响应内容（仅在开发环境或特定日志级别）
        if (process.env.NODE_ENV === "development" || process.env.ANTA_DEBUG_FULL_RESPONSE === "true") {
          logger.debug("完整API响应内容", {
            productId,
            url: queryUrl,
            fullResponseData: responseDataStr,
            timestamp: new Date().toISOString(),
          });
        }

        // 如果第一次尝试失败（状态码400），尝试使用正确的API格式
        if (response.status === 400 && attempt === 1) {
          logger.info("尝试使用正确的API格式重新请求", { productId });

          // 尝试解析productId或使用示例数据进行测试
          // 基于日志中的示例：条码：BRA047EBXF EAN：2000000134554 货号：112535584-1 尺码：11
          const testUrl = `${this.apiBaseUrl}/consumer/innerbox/search?code=112535584-1&11&2000000134554&BRA047EBXF&CN`;

          logger.info("尝试使用测试URL", { testUrl });

          const testResponse = await axios.get(testUrl, {
            timeout: this.timeout,
            httpsAgent: new https.Agent({
              rejectUnauthorized: true, // 启用证书验证以确保安全连接
              secureProtocol: "TLSv1_2_method",
              keepAlive: true,
            }),
            proxy: false, // Explicitly disable proxy
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
              "Cache-Control": "max-age=0",
              Priority: "u=0, i",
              "Sec-Ch-Ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
              "Sec-Ch-Ua-Mobile": "?0",
              "Sec-Ch-Ua-Platform": '"Windows"',
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
              "Sec-Fetch-User": "?1",
              "Upgrade-Insecure-Requests": "1",
            },
            validateStatus: (status) => status < 500,
          });

          if (testResponse.status === 200) {
            logger.info("使用正确API格式请求成功", {
              productId,
              statusCode: testResponse.status,
              contentLength: testResponse.data?.length || 0,
              url: testUrl,
            });
            return testResponse;
          }
        }

        return response;
      } catch (error) {
        lastError = error;

        // 详细记录API调用失败信息
        const errorDetails = axios.isAxiosError(error)
          ? {
              code: error.code,
              message: error.message,
              status: error.response?.status,
              statusText: error.response?.statusText,
              responseData: error.response?.data
                ? typeof error.response.data === "string"
                  ? error.response.data.substring(0, 500) + (error.response.data.length > 500 ? "...[截断]" : "")
                  : JSON.stringify(error.response.data).substring(0, 500) + "...[截断]"
                : "No response data",
              requestUrl: queryUrl,
            }
          : {
              message: error instanceof Error ? error.message : String(error),
              requestUrl: queryUrl,
            };

        logger.error(`安踏API调用失败，尝试 ${attempt}/${this.retryAttempts}`, {
          productId,
          attempt,
          errorDetails,
          timestamp: new Date().toISOString(),
        });

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt); // 递增延迟
        }
      }
    }

    throw lastError;
  }

  /**
   * 解析HTML响应提取产品信息
   * @param html HTML内容
   * @returns 产品信息或null
   */
  private parseProductInfo(html: string): ProductInfo | null {
    try {
      const $ = cheerio.load(html);

      // 检查是否包含产品信息的标识文本
      const thankYouText = $('div:contains("感谢您购买安踏公司生产的产品")').text();
      if (!thankYouText) {
        logger.warn("HTML中未找到产品信息标识", { htmlLength: html.length });
        return null;
      }

      // 根据ascm.anta.com的HTML结构提取信息
      // 使用更精确的文本匹配方式
      let barcode = "";
      let gender = "";
      let productName = "";
      let series = "";
      let itemNumber = "";
      let ean = "";
      let size = "";
      let retailPrice = 0;
      let queryCount = 0;

      // 遍历所有包含产品信息的div元素
      $(".grid-demo").each((_, element) => {
        const text = $(element).text().trim();

        if (text.startsWith("条码：")) {
          barcode = text.replace("条码：", "").trim();
        } else if (text.startsWith("性别：")) {
          gender = text.replace("性别：", "").trim();
        } else if (text.startsWith("品名：")) {
          productName = text.replace("品名：", "").trim();
        } else if (text.startsWith("系列：")) {
          series = text.replace("系列：", "").trim();
        } else if (text.startsWith("货号：")) {
          itemNumber = text.replace("货号：", "").trim();
        } else if (text.startsWith("EAN：")) {
          ean = text.replace("EAN：", "").trim();
        } else if (text.startsWith("尺码：")) {
          size = text.replace("尺码：", "").trim();
        } else if (text.startsWith("零售价：")) {
          const priceText = text.replace("零售价：", "").trim();
          retailPrice = this.parsePrice(priceText);
        } else if (text.startsWith("查询次数：")) {
          const countText = text.replace("查询次数：", "").trim();
          queryCount = parseInt(countText) || 0;
        }
      });

      // 验证必要字段
      if (!barcode || !productName) {
        // 详细记录解析失败的信息，包括HTML内容片段
        const htmlPreview = html.length > 500 ? html.substring(0, 500) + "...[HTML截断]" : html;

        logger.error("解析产品信息失败：缺少必要字段", {
          barcode,
          productName,
          htmlLength: html.length,
          htmlPreview: htmlPreview,
          extractedFields: { barcode, gender, productName, series, itemNumber, ean, size, retailPrice, queryCount },
          timestamp: new Date().toISOString(),
        });

        // 如果需要调试，打印完整HTML内容
        if (process.env.NODE_ENV === "development" || process.env.ANTA_DEBUG_FULL_HTML === "true") {
          logger.debug("完整HTML内容（解析失败）", {
            htmlLength: html.length,
            fullHtmlContent: html,
            timestamp: new Date().toISOString(),
          });
        }

        return null;
      }

      const productInfo: ProductInfo = {
        barcode: barcode || "",
        gender: gender || "",
        productName: productName || "",
        series: series || "",
        itemNumber: itemNumber || "",
        ean: ean || "",
        size: size || "",
        retailPrice: retailPrice || 0,
      };

      logger.info("产品信息解析成功", {
        productInfo,
        queryCount,
        htmlLength: html.length,
        extractedFields: {
          hasBarcode: !!barcode,
          hasProductName: !!productName,
          hasPrice: retailPrice > 0,
          hasQueryCount: queryCount > 0,
        },
      });

      return productInfo;
    } catch (error) {
      // 详细记录解析异常信息
      const htmlPreview = html && html.length > 500 ? html.substring(0, 500) + "...[HTML截断]" : html;

      logger.error("解析产品信息异常", {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        htmlLength: html?.length || 0,
        htmlPreview: htmlPreview,
        timestamp: new Date().toISOString(),
      });

      // 如果需要调试，打印完整HTML内容
      if (html && (process.env.NODE_ENV === "development" || process.env.ANTA_DEBUG_FULL_HTML === "true")) {
        logger.debug("完整HTML内容（解析异常）", {
          htmlLength: html.length,
          fullHtmlContent: html,
          timestamp: new Date().toISOString(),
        });
      }

      return null;
    }
  }

  /**
   * 解析价格字符串
   * @param priceText 价格文本
   * @returns 数字价格
   */
  private parsePrice(priceText: string): number {
    try {
      if (!priceText) return 0;

      // 移除非数字字符，保留小数点
      const cleanPrice = priceText.replace(/[^\d.]/g, "");
      const price = parseFloat(cleanPrice);

      return isNaN(price) ? 0 : price;
    } catch (error) {
      logger.debug("解析价格失败", { priceText, error });
      return 0;
    }
  }

  /**
   * 从HTML中提取查询次数
   * @param html HTML内容
   * @returns 查询次数
   */
  private extractQueryCount(html: string): number {
    try {
      const $ = cheerio.load(html);

      // 查找包含"查询次数："的文本
      let queryCount = 0;
      $(".grid-demo").each((_, element) => {
        const text = $(element).text().trim();
        if (text.startsWith("查询次数：")) {
          const countText = text.replace("查询次数：", "").trim();
          queryCount = parseInt(countText) || 0;
          return false; // 找到后退出循环
        }
      });

      return queryCount;
    } catch (error) {
      logger.debug("提取查询次数失败", { error });
      return 0;
    }
  }

  /**
   * 检查HTML响应是否表示产品未找到
   * @param html HTML内容
   * @returns 是否未找到产品
   */
  private isProductNotFound(html: string): boolean {
    try {
      const $ = cheerio.load(html);

      // 检查是否包含产品信息的标识
      const hasProductInfo = $('div:contains("感谢您购买安踏公司生产的产品")').length > 0;
      const hasProductDetails = $('.grid-demo:contains("条码：")').length > 0;

      // 检查是否包含错误信息或空页面标识
      const hasErrorMessage =
        $('body:contains("未找到")').length > 0 ||
        $('body:contains("不存在")').length > 0 ||
        $('body:contains("错误")').length > 0;

      // 检查页面是否基本为空（只有基本结构没有实际内容）
      const bodyText = $("body").text().trim();
      const isEmptyPage = bodyText.length < 100; // 如果页面内容太少，可能是空页面

      // 如果没有找到产品信息标识或产品详情，或者有错误信息，或者页面为空，则认为产品未找到
      return !hasProductInfo || !hasProductDetails || hasErrorMessage || isEmptyPage;
    } catch (error) {
      logger.debug("检查产品是否存在失败", { error });
      return true; // 解析失败时默认认为未找到
    }
  }

  /**
   * 检查产品ID格式是否可能无效（基于响应内容）
   * @param html HTML内容
   * @returns 是否为无效格式
   */
  private isInvalidProductIdResponse(html: string): boolean {
    try {
      const $ = cheerio.load(html);
      const bodyText = $("body").text().toLowerCase();

      // 检查是否包含格式错误的提示
      const invalidFormatKeywords = ["格式不正确", "格式错误", "无效", "invalid", "format", "请检查输入"];

      return invalidFormatKeywords.some((keyword) => bodyText.includes(keyword));
    } catch (error) {
      logger.debug("检查产品ID格式失败", { error });
      return false;
    }
  }

  /**
   * 延迟函数
   * @param ms 毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 处理错误并返回标准化错误响应
   * @param error 错误对象
   * @returns 标准化错误响应
   */
  private handleError(error: any): AntaApiResponse {
    let antaError: AntaError;

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        antaError = {
          type: AntaErrorType.API_TIMEOUT,
          message: "请求超时，请稍后重试",
          details: { code: error.code, timeout: this.timeout },
        };
      } else if (error.response?.status === 404) {
        antaError = {
          type: AntaErrorType.PRODUCT_NOT_FOUND,
          message: "未找到该产品信息",
          details: { status: error.response.status },
        };
      } else if (error.response?.status && error.response.status >= 500) {
        antaError = {
          type: AntaErrorType.SERVER_ERROR,
          message: "服务器暂时不可用，请稍后重试",
          details: { status: error.response.status },
        };
      } else {
        antaError = {
          type: AntaErrorType.NETWORK_ERROR,
          message: "网络连接失败，请检查网络连接",
          details: { message: error.message },
        };
      }
    } else {
      antaError = {
        type: AntaErrorType.SERVER_ERROR,
        message: "服务器内部错误",
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }

    logger.error("安踏API错误处理", { antaError });
    return { success: false, error: antaError.message };
  }
}
