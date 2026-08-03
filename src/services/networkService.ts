import { createHash } from "node:crypto";
import axios from "axios";
import { config } from "../config/config";
import logger from "../utils/logger";

export interface NetworkTestResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class NetworkService {
  private static readonly BASE_URL = "https://v2.xxapi.cn/api";

  public static async tcpPing(address: string, port: number): Promise<NetworkTestResponse> {
    return NetworkService.tcpPingViaExternalApi(address, port);
  }

  private static async tcpPingViaExternalApi(address: string, port: number): Promise<NetworkTestResponse> {
    try {
      logger.info("开始TCP连接检测", { address, port });

      const response = await axios.get(`${NetworkService.BASE_URL}/tcping`, {
        params: { address, port },
        timeout: 10000,
      });

      logger.info("TCP连接检测完成", { address, port, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("TCP连接检测失败", { address, port, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `TCP连接检测失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "网络服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async ping(url: string): Promise<NetworkTestResponse> {
    return NetworkService.pingViaExternalApi(url);
  }

  private static async pingViaExternalApi(url: string): Promise<NetworkTestResponse> {
    try {
      logger.info("开始Ping检测", { url });

      const response = await axios.get(`${NetworkService.BASE_URL}/ping`, {
        params: { url },
        timeout: 15000,
      });

      logger.info("Ping检测完成", { url, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("Ping检测失败", { url, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `Ping检测失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "网络服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async speedTest(url: string): Promise<NetworkTestResponse> {
    return NetworkService.speedTestViaExternalApi(url);
  }

  private static async speedTestViaExternalApi(url: string): Promise<NetworkTestResponse> {
    try {
      logger.info("开始网站测速", { url });

      const response = await axios.get(`${NetworkService.BASE_URL}/speed`, {
        params: { url },
        timeout: 30000,
      });

      logger.info("网站测速完成", { url, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("网站测速失败", { url, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `网站测速失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "网络服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async portScan(address: string): Promise<NetworkTestResponse> {
    return NetworkService.portScanViaExternalApi(address);
  }

  private static async portScanViaExternalApi(address: string): Promise<NetworkTestResponse> {
    try {
      logger.info("开始端口扫描", { address });

      const response = await axios.get(`${NetworkService.BASE_URL}/portscan`, {
        params: { address },
        timeout: 60000,
      });

      logger.info("端口扫描完成", { address, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("端口扫描失败", { address, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `端口扫描失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "网络服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async ipQuery(ip: string): Promise<NetworkTestResponse> {
    try {
      logger.info("开始精准IP查询", { ip });

      const response = await axios.get(`${NetworkService.BASE_URL}/ipv2`, {
        params: { ip, key: process.env.IP_QUERY_KEY },
        timeout: 10000,
      });

      logger.info("精准IP查询完成", { ip, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("精准IP查询失败", { ip, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `精准IP查询失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "IP查询服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async randomQuote(type: "hitokoto" | "poetry"): Promise<NetworkTestResponse> {
    try {
      logger.info("开始获取随机一言古诗词", { type });

      const response = await axios.get(`${NetworkService.BASE_URL}/yiyan`, {
        params: { type },
        timeout: 8000,
      });

      logger.info("随机一言古诗词获取完成", { type, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("随机一言古诗词获取失败", { type, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `随机一言古诗词获取失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "一言古诗词服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static async douyinHot(): Promise<NetworkTestResponse> {
    try {
      logger.info("开始获取抖音热榜");

      const response = await axios.get(`${NetworkService.BASE_URL}/douyinhot`, {
        timeout: 15000,
      });

      logger.info("抖音热榜获取完成", { result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("抖音热榜获取失败", { error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `抖音热榜获取失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "抖音热榜服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  public static hashEncrypt(type: "md4" | "md5" | "sha1" | "sha256" | "sha512", text: string): NetworkTestResponse {
    try {
      if (!text || typeof text !== "string" || text.trim() === "") {
        return {
          success: false,
          error: "加密文本不能为空",
        };
      }

      logger.info("开始字符串Hash加密", { type, textLength: text.length });

      const validTypes = ["md4", "md5", "sha1", "sha256", "sha512"];
      if (!validTypes.includes(type)) {
        return {
          success: false,
          error: `不支持的加密算法: ${type}。支持的算法: ${validTypes.join(", ")}`,
        };
      }

      let hash: string;

      switch (type) {
        case "md4":
          hash = createHash("md5").update(text).digest("hex");
          logger.warn("MD4算法不可用，使用MD5替代", { originalType: type });
          break;
        case "md5":
          hash = createHash("md5").update(text).digest("hex");
          break;
        case "sha1":
          hash = createHash("sha1").update(text).digest("hex");
          break;
        case "sha256":
          hash = createHash("sha256").update(text).digest("hex");
          break;
        case "sha512":
          hash = createHash("sha512").update(text).digest("hex");
          break;
        default:
          return {
            success: false,
            error: `不支持的加密算法: ${type}`,
          };
      }

      logger.info("字符串Hash加密完成", { type, textLength: text.length, hashLength: hash.length });

      return {
        success: true,
        data: {
          code: 200,
          msg: "数据请求成功",
          data: hash,
        },
      };
    } catch (error) {
      logger.error("字符串Hash加密失败", {
        type,
        textLength: text ? text.length : 0,
        error: error instanceof Error ? error.message : "未知错误",
      });

      return {
        success: false,
        error: `Hash加密失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  public static base64Operation(type: "encode" | "decode", text: string): NetworkTestResponse {
    try {
      if (!text || typeof text !== "string") {
        return {
          success: false,
          error: "操作文本不能为空",
        };
      }

      if (!type || (type !== "encode" && type !== "decode")) {
        return {
          success: false,
          error: "操作类型必须是 encode(编码) 或 decode(解码)",
        };
      }

      logger.info("开始Base64操作", { type, textLength: text.length });

      let result: string;

      if (type === "encode") {
        result = Buffer.from(text, "utf8").toString("base64");
        logger.info("Base64编码完成", { type, textLength: text.length, resultLength: result.length });
      } else {
        const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
        if (!base64Regex.test(text)) {
          logger.error("Base64解码失败", { type, text, error: "格式非法" });
          return {
            success: false,
            error: "Base64解码失败：输入不是有效的Base64字符串",
          };
        }
        try {
          result = Buffer.from(text, "base64").toString("utf8");
          if (Buffer.from(result, "utf8").toString("base64").replace(/=+$/, "") !== text.replace(/=+$/, "")) {
            logger.error("Base64解码失败", { type, text, error: "内容不匹配" });
            return {
              success: false,
              error: "Base64解码失败：输入不是有效的Base64字符串",
            };
          }
          logger.info("Base64解码完成", { type, textLength: text.length, resultLength: result.length });
        } catch (decodeError) {
          logger.error("Base64解码异常", {
            type,
            text,
            error: decodeError instanceof Error ? decodeError.message : "未知错误",
          });
          return {
            success: false,
            error: "Base64解码失败：输入不是有效的Base64字符串",
          };
        }
      }

      return {
        success: true,
        data: {
          code: 200,
          msg: "数据请求成功",
          data: result,
        },
      };
    } catch (error) {
      logger.error("Base64操作失败", {
        type,
        textLength: text ? text.length : 0,
        error: error instanceof Error ? error.message : "未知错误",
      });

      return {
        success: false,
        error: `Base64操作失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  public static bmiCalculate(height: string, weight: string): NetworkTestResponse {
    if (!height || !weight) {
      return {
        success: false,
        error: "身高和体重参数不能为空",
      };
    }
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (Number.isNaN(h) || Number.isNaN(w) || h <= 0 || w <= 0) {
      return {
        success: false,
        error: "身高和体重必须为正数",
      };
    }
    const bmi = w / (h / 100) ** 2;
    const idealWeight = (22 * (h / 100) ** 2).toFixed(1);
    let msg = "";
    if (bmi < 18.5) {
      msg = `您的身体指数偏低，理想体重为${idealWeight}KG`;
    } else if (bmi < 24) {
      msg = "您的身体指数正常，继续保持";
    } else if (bmi < 28) {
      msg = `您的身体指数偏高，理想体重为${idealWeight}KG`;
    } else {
      msg = `您的身体指数过高，理想体重为${idealWeight}KG`;
    }
    return {
      success: true,
      data: {
        code: 200,
        msg: "数据请求成功",
        data: {
          bmi: Number(bmi.toFixed(2)),
          msg,
        },
      },
    };
  }

  public static async flacToMp3(url: string, returnType: "json" | "302" = "json"): Promise<NetworkTestResponse> {
    try {
      logger.info("开始FLAC转MP3转换", { url, returnType });

      if (!url || typeof url !== "string") {
        return {
          success: false,
          error: "URL参数不能为空",
        };
      }

      try {
        new URL(url);
      } catch {
        return {
          success: false,
          error: "URL格式不正确",
        };
      }

      const targetUrl = `${NetworkService.BASE_URL}/flactomp3`;
      const params = new URLSearchParams({
        url: url,
        return: returnType,
      });

      const response = await axios.get(`${targetUrl}?${params.toString()}`, {
        timeout: 60000,
        maxRedirects: 5,
      });

      logger.info("FLAC转MP3转换完成", { url, returnType, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("FLAC转MP3转换失败", {
        url,
        returnType,
        error: error instanceof Error ? error.message : "未知错误",
      });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `FLAC转MP3转换失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "音频转换服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: `FLAC转MP3转换失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  public static async randomJiakao(subject: "1" | "4"): Promise<NetworkTestResponse> {
    try {
      logger.info("开始获取随机驾考题目", { subject });

      if (!subject || (subject !== "1" && subject !== "4")) {
        return {
          success: false,
          error: "科目参数必须是 1(科目1) 或 4(科目4)",
        };
      }

      const targetUrl = `${NetworkService.BASE_URL}/jiakao`;
      const params = new URLSearchParams({
        subject: subject,
      });

      const response = await axios.get(`${targetUrl}?${params.toString()}`, {
        timeout: 15000,
        maxRedirects: 3,
      });

      logger.info("随机驾考题目获取完成", { subject, result: response.data });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error("随机驾考题目获取失败", { subject, error: error instanceof Error ? error.message : "未知错误" });

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return {
            success: false,
            error: `随机驾考题目获取失败: ${error.response.status} - ${error.response.data?.message || "服务器错误"}`,
          };
        } else if (error.request) {
          return {
            success: false,
            error: "驾考题目服务无响应，请稍后重试",
          };
        }
      }

      return {
        success: false,
        error: `随机驾考题目获取失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }
}