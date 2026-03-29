import { User } from "../utils/userStorage";
import { libreChatService } from "./libreChatService";
import { mongoose } from "./mongoService";
import * as userService from "./userService";
import logger from "../utils/logger";

// 常见违规词汇库（作为 AI 的辅助参考或后备方案）
const BANNED_WORDS = [
  "草", "操", "尼玛", "傻逼", "妈的", "滚", "死", "垃圾", "智障", "脑残",
  "fuck", "shit", "bitch", "asshole", "bastard"
];

export interface ModerationResult {
  isViolated: boolean;
  bannedWords: string[];
  reason?: string;
}

// MongoDB 审查日志 Schema
const ModerationLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  username: { type: String },
  content: { type: String },
  isViolated: { type: Boolean, required: true, index: true },
  reason: { type: String },
  bannedWords: [String],
  type: { type: String, enum: ["ai_check", "punishment", "manual"], default: "ai_check" },
  punishment: { type: String }, // 若有处罚，记录处罚描述
  createdAt: { type: Date, default: Date.now, index: true }
}, { collection: "moderation_logs" });

const ModerationLogModel = mongoose.models.ModerationLog || mongoose.model("ModerationLog", ModerationLogSchema);

export class ModerationService {
  /**
   * 记录审查事件到 MongoDB
   */
  private static async logEvent(data: {
    userId: string;
    username?: string;
    content?: string;
    isViolated: boolean;
    reason?: string;
    bannedWords?: string[];
    type?: "ai_check" | "punishment" | "manual";
    punishment?: string;
  }) {
    try {
      if (mongoose.connection.readyState !== 1) return;
      await ModerationLogModel.create(data);
    } catch (err) {
      logger.error("记录审查日志失败:", err);
    }
  }

  /**
   * 使用 AI 检查内容是否违规 (第一步：判定 true/false)
   */
  public static async checkContentWithAi(content: string, userId?: string, username?: string): Promise<boolean> {
    if (!content) return false;

    let isViolated = false;
    let reason = "";

    try {
      const prompt = `你是一个言论审查专家。请分析以下内容是否包含：脏话、人身攻击、仇恨言论、色情、违法信息或严重的社区违规。
内容: "${content}"
只需要回复 "true" (违规) 或 "false" (不违规)，不要回复任何其他内容。`;

      const response = await libreChatService.sendMessage(
        "moderation_check",
        prompt,
        "system_moderator",
        undefined,
        "admin"
      );

      isViolated = response.toLowerCase().includes("true");
    } catch (error) {
      logger.error("AI 审查判定失败，回退到本地检查:", error);
      // 后备方案：本地关键词检查
      const contentLower = content.toLowerCase();
      isViolated = BANNED_WORDS.some(word => contentLower.includes(word.toLowerCase()));
      reason = isViolated ? "触发本地关键词过滤" : "";
    }

    // 只有违规时才自动记录日志，或者针对特定用户记录
    if (isViolated && userId) {
      this.logEvent({
        userId,
        username,
        content,
        isViolated,
        reason: reason || "AI 判定违规",
        type: "ai_check"
      });
    }

    return isViolated;
  }

  /**
   * 获取 AI 的违规原因 (第二步)
   */
  public static async getAiViolationReason(content: string): Promise<string> {
    try {
      const prompt = `你是一个言论审查专家。用户刚才提交的内容已被判定为违规。请详细列出该内容中涉及的违规词汇或违规原因。
内容: "${content}"
请用中文直接回复原因，字数控制在 50 字以内。`;

      const response = await libreChatService.sendMessage(
        "moderation_reason",
        prompt,
        "system_moderator",
        undefined,
        "admin"
      );

      return response || "内容违反社区准则。";
    } catch (error) {
      return "内容包含违规词汇或不当言论。";
    }
  }

  /**
   * 检查内容是否包含违规词汇 (保留原有逻辑作为后备)
   */
  public static checkContent(content: string): ModerationResult {
    if (!content) return { isViolated: false, bannedWords: [] };

    const contentLower = content.toLowerCase();
    const foundWords = BANNED_WORDS.filter(word => contentLower.includes(word.toLowerCase()));

    return {
      isViolated: foundWords.length > 0,
      bannedWords: foundWords,
      reason: foundWords.length > 0 ? `内容包含敏感词汇: ${foundWords.join(", ")}` : undefined
    };
  }

  /**
   * 检查用户是否正处于封禁期
   */
  public static isUserBanned(user: User): { isBanned: boolean; remainingTime?: string } {
    if (!user.ticketBannedUntil) return { isBanned: false };

    const banTime = new Date(user.ticketBannedUntil);
    const now = new Date();

    if (banTime > now) {
      const diffMs = banTime.getTime() - now.getTime();
      const diffMins = Math.ceil(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      let remaining = "";
      if (diffHours > 0) {
        remaining = `${diffHours}小时${diffMins % 60}分钟`;
      } else {
        remaining = `${diffMins}分钟`;
      }

      return { isBanned: true, remainingTime: remaining };
    }

    return { isBanned: false };
  }

  /**
   * 处理用户违规，应用梯度处罚并持久化到 MongoDB
   */
  public static async handleViolation(user: User, reason?: string): Promise<string> {
    const newCount = (user.ticketViolationCount || 0) + 1;
    let banDurationHours = 0;
    let punishmentMsg = "";

    switch (newCount) {
      case 1:
        punishmentMsg = "首次违规警告。";
        break;
      case 2:
        banDurationHours = 1;
        punishmentMsg = "第二次违规，封禁 1 小时。";
        break;
      case 3:
        banDurationHours = 24;
        punishmentMsg = "第三次违规，封禁 24 小时。";
        break;
      default:
        banDurationHours = 24 * 365 * 99; // 永久封禁
        punishmentMsg = "多次违规，永久封禁。";
        break;
    }

    const updates: Partial<User> = {
      ticketViolationCount: newCount
    };

    if (banDurationHours > 0) {
      const bannedUntil = new Date();
      bannedUntil.setHours(bannedUntil.getHours() + banDurationHours);
      updates.ticketBannedUntil = bannedUntil.toISOString();
    }

    // 持久化到用户数据
    await userService.updateUser(user.id, updates);

    // 记录处罚日志
    await this.logEvent({
      userId: user.id,
      username: user.username,
      isViolated: true,
      reason: reason || "触发梯度处罚机制",
      type: "punishment",
      punishment: punishmentMsg
    });

    return punishmentMsg;
  }

  /**
   * 管理端查询审查日志
   */
  public static async adminGetLogs(query: {
    userId?: string;
    isViolated?: boolean;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    if (mongoose.connection.readyState !== 1) return { logs: [], total: 0 };

    const { userId, isViolated, type, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (isViolated !== undefined) filter.isViolated = isViolated;
    if (type) filter.type = type;

    const total = await ModerationLogModel.countDocuments(filter);
    const logs = await ModerationLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { logs, total };
  }
}

