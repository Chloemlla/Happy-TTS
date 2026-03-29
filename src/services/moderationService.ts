import { User, UserStorage } from "../utils/userStorage";
import { libreChatService } from "./libreChatService";
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

export class ModerationService {
  /**
   * 使用 AI 检查内容是否违规 (第一步：判定 true/false)
   */
  public static async checkContentWithAi(content: string): Promise<boolean> {
    if (!content) return false;

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

      return response.toLowerCase().includes("true");
    } catch (error) {
      logger.error("AI 审查判定失败，回退到本地检查:", error);
      // 后备方案：本地关键词检查
      const contentLower = content.toLowerCase();
      return BANNED_WORDS.some(word => contentLower.includes(word.toLowerCase()));
    }
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
   * 处理用户违规，应用梯度处罚
   */
  public static async handleViolation(user: User): Promise<string> {
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

    await UserStorage.updateUser(user.id, updates);
    return punishmentMsg;
  }
}

