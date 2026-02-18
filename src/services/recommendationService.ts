/**
 * 推荐服务 - Recommendation Service
 * 提供个性化语音风格推荐、内容分析和建议功能
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import RecommendationHistoryModel from "../models/recommendationHistoryModel";
import UserPreferencesModel from "../models/userPreferencesModel";
import type {
  ChunkingStrategy,
  ContentSuggestion,
  GenerationRecord,
  Recommendation,
  VoiceStyle,
} from "../types/recommendation";
import logger from "../utils/logger";

// 情感关键词映射表
const EMOTIONAL_KEYWORDS: Record<string, string[]> = {
  happy: ["开心", "快乐", "高兴", "欢乐", "喜悦", "happy", "joy", "cheerful", "delighted", "兴奋", "激动"],
  sad: ["悲伤", "难过", "伤心", "忧郁", "哀伤", "sad", "sorrow", "grief", "melancholy", "失落", "沮丧"],
  angry: ["愤怒", "生气", "恼火", "暴怒", "angry", "furious", "rage", "irritated", "气愤", "恼怒"],
  calm: ["平静", "安宁", "宁静", "祥和", "calm", "peaceful", "serene", "tranquil", "放松", "舒缓"],
  excited: ["兴奋", "激动", "热情", "澎湃", "excited", "thrilled", "enthusiastic", "振奋", "热烈"],
  serious: ["严肃", "正式", "庄重", "认真", "serious", "formal", "solemn", "grave", "郑重", "严谨"],
  romantic: ["浪漫", "温馨", "甜蜜", "柔情", "romantic", "tender", "sweet", "loving", "温柔", "深情"],
  mysterious: ["神秘", "悬疑", "诡异", "mysterious", "enigmatic", "suspenseful", "奇幻", "玄幻"],
};

// 默认热门语音风格（用于新用户或历史不足时的降级方案）
const DEFAULT_POPULAR_STYLES: VoiceStyle[] = [
  {
    id: "popular-1",
    name: "标准女声",
    voice: "zh-CN-XiaoxiaoNeural",
    model: "neural",
    speed: 1.0,
    emotionalTone: "neutral",
    language: "zh-CN",
  },
  {
    id: "popular-2",
    name: "标准男声",
    voice: "zh-CN-YunxiNeural",
    model: "neural",
    speed: 1.0,
    emotionalTone: "neutral",
    language: "zh-CN",
  },
  {
    id: "popular-3",
    name: "温柔女声",
    voice: "zh-CN-XiaoyiNeural",
    model: "neural",
    speed: 0.9,
    emotionalTone: "calm",
    language: "zh-CN",
  },
  {
    id: "popular-4",
    name: "活力女声",
    voice: "zh-CN-XiaochenNeural",
    model: "neural",
    speed: 1.1,
    emotionalTone: "happy",
    language: "zh-CN",
  },
  {
    id: "popular-5",
    name: "英文女声",
    voice: "en-US-JennyNeural",
    model: "neural",
    speed: 1.0,
    emotionalTone: "neutral",
    language: "en-US",
  },
];

// 历史记录阈值：少于此数量时使用热门推荐
const HISTORY_THRESHOLD = 10;

// 默认推荐数量限制
const DEFAULT_RECOMMENDATION_LIMIT = 5;

// 长文本阈值（字符数）
const LONG_TEXT_THRESHOLD = 500;

// ContentSuggestion JSON Schema 用于验证
const _CONTENT_SUGGESTION_SCHEMA = {
  type: "object",
  required: ["voiceParameters", "emotionalMatch", "confidence"],
  properties: {
    voiceParameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        voice: { type: "string" },
        model: { type: "string" },
        speed: { type: "number" },
        emotionalTone: { type: "string" },
        language: { type: "string" },
      },
    },
    chunkingStrategy: {
      type: "object",
      properties: {
        chunkSize: { type: "number" },
        overlapSize: { type: "number" },
        breakPoints: { type: "array", items: { type: "string" } },
      },
    },
    emotionalMatch: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

/**
 * 推荐服务类
 */
export class RecommendationService {
  /**
   * 获取个性化推荐
   * Requirements: 1.1, 1.2
   *
   * @param userId 用户ID
   * @param limit 推荐数量限制（默认5）
   * @returns 推荐列表
   */
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = DEFAULT_RECOMMENDATION_LIMIT,
  ): Promise<Recommendation[]> {
    try {
      // 获取用户历史记录
      const history = await RecommendationHistoryModel.findOne({ userId }).lean();

      // 如果历史记录不足，返回热门推荐（Requirements 1.2）
      if (!history || history.generations.length < HISTORY_THRESHOLD) {
        logger.info(`[RecommendationService] 用户 ${userId} 历史记录不足，返回热门推荐`);
        const popularStyles = await this.getPopularStyles(limit);
        return popularStyles.map((style) => ({
          voiceStyle: style,
          similarityScore: 0.5,
          reason: "社区热门推荐",
          sampleAudioUrl: `/samples/${style.id}.mp3`,
        }));
      }

      // 获取用户偏好设置
      const preferences = await UserPreferencesModel.findOne({ userId }).lean();
      const disabledCategories = preferences?.recommendationSettings?.disabledCategories || [];

      // 分析用户历史，生成个性化推荐
      const recommendations = this.analyzeHistoryForRecommendations(history.generations, disabledCategories, limit);

      return recommendations;
    } catch (error) {
      logger.error("[RecommendationService] 获取个性化推荐失败:", error);
      // 降级方案：返回热门推荐
      const popularStyles = await this.getPopularStyles(limit);
      return popularStyles.map((style) => ({
        voiceStyle: style,
        similarityScore: 0.5,
        reason: "社区热门推荐",
        sampleAudioUrl: `/samples/${style.id}.mp3`,
      }));
    }
  }

  /**
   * 获取热门语音风格（降级方案）
   * Requirements: 1.2
   *
   * @param limit 数量限制
   * @returns 热门语音风格列表
   */
  async getPopularStyles(limit: number = DEFAULT_RECOMMENDATION_LIMIT): Promise<VoiceStyle[]> {
    try {
      // 从数据库聚合最常用的语音风格
      const aggregation = await RecommendationHistoryModel.aggregate([
        { $unwind: "$generations" },
        {
          $group: {
            _id: "$generations.voiceStyle.id",
            voiceStyle: { $first: "$generations.voiceStyle" },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]);

      if (aggregation.length > 0) {
        return aggregation.map((item) => item.voiceStyle);
      }

      // 如果没有数据，返回默认热门风格
      return DEFAULT_POPULAR_STYLES.slice(0, limit);
    } catch (error) {
      logger.error("[RecommendationService] 获取热门风格失败:", error);
      return DEFAULT_POPULAR_STYLES.slice(0, limit);
    }
  }

  /**
   * 记录用户选择
   * Requirements: 1.3
   *
   * @param userId 用户ID
   * @param styleId 选择的语音风格ID
   * @param textContent 文本内容
   * @param voiceStyle 完整的语音风格配置
   */
  async recordSelection(
    userId: string,
    styleId: string,
    textContent: string = "",
    voiceStyle?: VoiceStyle,
  ): Promise<void> {
    try {
      const now = new Date();
      const record: GenerationRecord = {
        id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        textContent: textContent.substring(0, 1000), // 限制存储长度
        textLength: textContent.length,
        contentType: this.detectContentType(textContent),
        language: this.detectLanguage(textContent),
        voiceStyle: voiceStyle || this.findStyleById(styleId),
        duration: 0, // 实际生成后更新
      };

      // 更新或创建用户历史记录
      await RecommendationHistoryModel.findOneAndUpdate(
        { userId },
        {
          $push: { generations: record },
          $inc: { totalCount: 1 },
          $set: { lastUpdated: now },
        },
        { upsert: true, new: true },
      );

      logger.info(`[RecommendationService] 记录用户 ${userId} 的选择: ${styleId}`);
    } catch (error) {
      logger.error("[RecommendationService] 记录选择失败:", error);
      throw error;
    }
  }

  /**
   * 分析文本内容并提供建议
   * Requirements: 2.1, 2.2, 2.3, 2.4
   *
   * @param text 文本内容
   * @returns 内容建议
   */
  async analyzeContent(text: string): Promise<ContentSuggestion> {
    const startTime = Date.now();

    try {
      // 检测情感关键词（Requirements 2.2）
      const emotionalMatch = this.detectEmotionalTone(text);

      // 检测语言
      const language = this.detectLanguage(text);

      // 根据情感匹配推荐语音参数
      const voiceParameters = this.getVoiceParametersForEmotion(emotionalMatch, language);

      // 检查是否需要分块策略（Requirements 2.3）
      let chunkingStrategy: ChunkingStrategy | undefined;
      if (text.length > LONG_TEXT_THRESHOLD) {
        chunkingStrategy = this.generateChunkingStrategy(text);
      }

      // 计算置信度
      const confidence = this.calculateConfidence(text, emotionalMatch);

      const suggestion: ContentSuggestion = {
        voiceParameters,
        chunkingStrategy,
        emotionalMatch,
        confidence,
      };

      const elapsed = Date.now() - startTime;
      logger.info(`[RecommendationService] 内容分析完成，耗时 ${elapsed}ms`);

      // 确保在2秒内完成（Requirements 2.1）
      if (elapsed > 2000) {
        logger.warn(`[RecommendationService] 内容分析超时: ${elapsed}ms`);
      }

      return suggestion;
    } catch (error) {
      logger.error("[RecommendationService] 内容分析失败:", error);
      // 返回默认建议
      return {
        voiceParameters: {
          speed: 1.0,
          emotionalTone: "neutral",
        },
        emotionalMatch: "neutral",
        confidence: 0.3,
      };
    }
  }

  /**
   * 序列化内容建议为JSON
   * Requirements: 2.5
   *
   * @param suggestion 内容建议对象
   * @returns JSON字符串
   */
  serializeContentSuggestion(suggestion: ContentSuggestion): string {
    return JSON.stringify(suggestion);
  }

  /**
   * 解析JSON为内容建议对象
   * Requirements: 2.6
   *
   * @param json JSON字符串
   * @returns 内容建议对象
   * @throws 如果JSON格式无效
   */
  parseContentSuggestion(json: string): ContentSuggestion {
    try {
      const parsed = JSON.parse(json);

      // 验证必需字段
      if (!this.validateContentSuggestion(parsed)) {
        throw new Error("Invalid ContentSuggestion format");
      }

      return parsed as ContentSuggestion;
    } catch (error) {
      logger.error("[RecommendationService] 解析ContentSuggestion失败:", error);
      throw new Error(`Failed to parse ContentSuggestion: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 分析历史记录生成推荐
   */
  private analyzeHistoryForRecommendations(
    generations: GenerationRecord[],
    disabledCategories: string[],
    limit: number,
  ): Recommendation[] {
    // 统计语音风格使用频率
    const styleFrequency = new Map<string, { style: VoiceStyle; count: number }>();

    for (const gen of generations) {
      const styleId = gen.voiceStyle.id;
      const existing = styleFrequency.get(styleId);
      if (existing) {
        existing.count++;
      } else {
        styleFrequency.set(styleId, { style: gen.voiceStyle, count: 1 });
      }
    }

    // 按频率排序
    const sortedStyles = Array.from(styleFrequency.values()).sort((a, b) => b.count - a.count);

    // 过滤禁用的类别
    const filteredStyles = sortedStyles.filter((item) => !disabledCategories.includes(item.style.emotionalTone));

    // 生成推荐
    const recommendations: Recommendation[] = filteredStyles.slice(0, limit).map((item, index) => ({
      voiceStyle: item.style,
      similarityScore: Math.max(0.5, 1 - index * 0.1),
      reason: `基于您的使用历史（使用${item.count}次）`,
      sampleAudioUrl: `/samples/${item.style.id}.mp3`,
    }));

    // 如果推荐不足，补充热门风格
    if (recommendations.length < limit) {
      const remaining = limit - recommendations.length;
      const existingIds = new Set(recommendations.map((r) => r.voiceStyle.id));
      const additionalStyles = DEFAULT_POPULAR_STYLES.filter(
        (s) => !existingIds.has(s.id) && !disabledCategories.includes(s.emotionalTone),
      ).slice(0, remaining);

      for (const style of additionalStyles) {
        recommendations.push({
          voiceStyle: style,
          similarityScore: 0.4,
          reason: "社区热门推荐",
          sampleAudioUrl: `/samples/${style.id}.mp3`,
        });
      }
    }

    return recommendations;
  }

  /**
   * 检测文本的情感基调
   */
  private detectEmotionalTone(text: string): string {
    const lowerText = text.toLowerCase();
    let maxScore = 0;
    let detectedEmotion = "neutral";

    for (const [emotion, keywords] of Object.entries(EMOTIONAL_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      if (score > maxScore) {
        maxScore = score;
        detectedEmotion = emotion;
      }
    }

    return detectedEmotion;
  }

  /**
   * 检测文本语言
   */
  private detectLanguage(text: string): string {
    // 简单的语言检测：检查中文字符比例
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const chineseRatio = chineseChars.length / text.length;

    if (chineseRatio > 0.3) {
      return "zh-CN";
    }
    return "en-US";
  }

  /**
   * 检测内容类型
   */
  private detectContentType(text: string): string {
    if (text.length < 50) return "short";
    if (text.length < 200) return "medium";
    if (text.length < 500) return "long";
    return "article";
  }

  /**
   * 根据情感获取推荐的语音参数
   */
  private getVoiceParametersForEmotion(emotion: string, language: string): Partial<VoiceStyle> {
    const emotionToParams: Record<string, Partial<VoiceStyle>> = {
      happy: { speed: 1.1, emotionalTone: "happy" },
      sad: { speed: 0.85, emotionalTone: "sad" },
      angry: { speed: 1.15, emotionalTone: "angry" },
      calm: { speed: 0.9, emotionalTone: "calm" },
      excited: { speed: 1.2, emotionalTone: "excited" },
      serious: { speed: 0.95, emotionalTone: "serious" },
      romantic: { speed: 0.85, emotionalTone: "romantic" },
      mysterious: { speed: 0.9, emotionalTone: "mysterious" },
      neutral: { speed: 1.0, emotionalTone: "neutral" },
    };

    const params = emotionToParams[emotion] || emotionToParams.neutral;
    return {
      ...params,
      language,
    };
  }

  /**
   * 生成分块策略
   */
  private generateChunkingStrategy(text: string): ChunkingStrategy {
    const textLength = text.length;

    // 根据文本长度确定分块大小
    let chunkSize: number;
    if (textLength < 1000) {
      chunkSize = 300;
    } else if (textLength < 3000) {
      chunkSize = 500;
    } else {
      chunkSize = 800;
    }

    // 重叠大小为分块大小的10%
    const overlapSize = Math.floor(chunkSize * 0.1);

    // 识别自然断点
    const breakPoints = this.findNaturalBreakPoints(text);

    return {
      chunkSize,
      overlapSize,
      breakPoints,
    };
  }

  /**
   * 查找文本的自然断点
   */
  private findNaturalBreakPoints(text: string): string[] {
    const breakPoints: string[] = [];

    // 段落分隔符
    if (text.includes("\n\n")) {
      breakPoints.push("paragraph");
    }

    // 句号分隔
    if (text.includes("。") || text.includes(".")) {
      breakPoints.push("sentence");
    }

    // 逗号分隔
    if (text.includes("，") || text.includes(",")) {
      breakPoints.push("clause");
    }

    return breakPoints.length > 0 ? breakPoints : ["sentence"];
  }

  /**
   * 计算建议的置信度
   */
  private calculateConfidence(text: string, emotion: string): number {
    let confidence = 0.5;

    // 文本长度影响置信度
    if (text.length > 100) confidence += 0.1;
    if (text.length > 300) confidence += 0.1;

    // 情感检测结果影响置信度
    if (emotion !== "neutral") confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * 根据ID查找语音风格
   */
  private findStyleById(styleId: string): VoiceStyle {
    const found = DEFAULT_POPULAR_STYLES.find((s) => s.id === styleId);
    if (found) return found;

    // 返回默认风格
    return {
      id: styleId,
      name: "自定义风格",
      voice: "zh-CN-XiaoxiaoNeural",
      model: "neural",
      speed: 1.0,
      emotionalTone: "neutral",
      language: "zh-CN",
    };
  }

  /**
   * 验证ContentSuggestion对象格式
   */
  private validateContentSuggestion(obj: any): boolean {
    if (!obj || typeof obj !== "object") return false;
    if (typeof obj.emotionalMatch !== "string") return false;
    if (typeof obj.confidence !== "number") return false;
    if (obj.confidence < 0 || obj.confidence > 1) return false;
    if (!obj.voiceParameters || typeof obj.voiceParameters !== "object") return false;

    // 验证可选的chunkingStrategy
    if (obj.chunkingStrategy !== undefined) {
      if (typeof obj.chunkingStrategy !== "object") return false;
      if (typeof obj.chunkingStrategy.chunkSize !== "number") return false;
      if (typeof obj.chunkingStrategy.overlapSize !== "number") return false;
      if (!Array.isArray(obj.chunkingStrategy.breakPoints)) return false;
    }

    return true;
  }
}

// 导出单例实例
export const recommendationService = new RecommendationService();
