import axios from "axios";
import { logger } from "./logger";

interface ContentFilterResponse {
  text: string;
  is_prohibited: boolean;
  confidence: number;
  status: string;
  max_variant?: string;
  triggered_variants?: Array<{
    variant: string;
    probability: number;
  }>;
}

export class ContentFilterService {
  private static readonly API_URL = "https://v2.xxapi.cn/api/detect";
  private static readonly TIMEOUT = 5000; // 5秒超时

  /**
   * 检测文本内容是否包含违禁词
   * @param text 要检测的文本
   * @returns 检测结果
   */
  public static async detectProhibitedContent(text: string): Promise<{
    isProhibited: boolean;
    confidence: number;
    maxVariant?: string;
    triggeredVariants?: Array<{ variant: string; probability: number }>;
    error?: string;
  }> {
    try {
      // 空文本直接通过
      if (!text || text.trim().length === 0) {
        return { isProhibited: false, confidence: 0 };
      }

      // 调用违禁词检测API
      const response = await axios.get<ContentFilterResponse>(ContentFilterService.API_URL, {
        params: { text: text.trim() },
        timeout: ContentFilterService.TIMEOUT,
        headers: {
          "User-Agent": "Happy-TTS/1.0",
        },
      });

      const result = response.data;

      // 记录检测结果（仅在检测到违禁内容时）
      if (result.is_prohibited) {
        logger.log("检测到违禁内容", {
          text: result.text,
          confidence: result.confidence,
          maxVariant: result.max_variant,
          triggeredVariants: result.triggered_variants,
        });
      }

      return {
        isProhibited: result.is_prohibited,
        confidence: result.confidence,
        maxVariant: result.max_variant,
        triggeredVariants: result.triggered_variants,
      };
    } catch (error) {
      logger.error("违禁词检测API调用失败", {
        error: error instanceof Error ? error.message : String(error),
        text: text.substring(0, 100) + (text.length > 100 ? "..." : ""), // 只记录前100个字符
      });

      // API调用失败时，为了安全起见，可以选择：
      // 1. 拒绝请求（更安全）
      // 2. 允许请求（更宽松）
      // 这里选择拒绝请求，确保内容安全
      return {
        isProhibited: true,
        confidence: 1.0,
        error: "内容检测服务暂时不可用，请稍后重试",
      };
    }
  }

  /**
   * 批量检测多个文本
   * @param texts 要检测的文本数组
   * @returns 检测结果数组
   */
  public static async batchDetect(texts: string[]): Promise<
    Array<{
      text: string;
      isProhibited: boolean;
      confidence: number;
      error?: string;
    }>
  > {
    const results = [];

    for (const text of texts) {
      const result = await ContentFilterService.detectProhibitedContent(text);
      results.push({
        text,
        isProhibited: result.isProhibited,
        confidence: result.confidence,
        error: result.error,
      });
    }

    return results;
  }

  /**
   * 检查是否应该跳过内容检测（用于测试环境或特定场景）
   */
  public static shouldSkipDetection(): boolean {
    return process.env.NODE_ENV === "test" || process.env.SKIP_CONTENT_FILTER === "true";
  }
}
