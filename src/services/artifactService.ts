/**
 * Artifact 服务层
 * 处理 artifacts 分享功能的业务逻辑
 */
import crypto from "crypto";
import bcrypt from "bcrypt";
import logger from "../utils/logger";
import {
  ArtifactModel,
  ArtifactVersionModel,
  ArtifactViewModel,
  type IArtifact,
} from "../models/artifactModel";

// ========== 工具函数 ==========

/** 生成短链接 ID */
function generateShortId(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/** 计算内容哈希 */
function calculateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** 解码 base64 内容 */
function decodeContent(content: string): string {
  try {
    return Buffer.from(content, "base64").toString("utf-8");
  } catch {
    return content; // 如果不是 base64,直接返回
  }
}

// ========== 服务类 ==========

export class ArtifactService {
  /**
   * 创建 Artifact
   */
  static async createArtifact(params: {
    userId: string;
    title: string;
    contentType: string;
    content: string; // base64 编码
    language?: string;
    visibility?: "public" | "private" | "password";
    password?: string;
    description?: string;
    tags?: string[];
    expiresInDays?: number;
  }): Promise<{
    id: string;
    shortId: string;
    shareUrl: string;
    embedUrl: string;
    createdAt: Date;
    expiresAt?: Date;
  }> {
    try {
      const {
        userId,
        title,
        contentType,
        content: encodedContent,
        language,
        visibility = "public",
        password,
        description,
        tags = [],
        expiresInDays,
      } = params;

      // 解码内容
      const content = decodeContent(encodedContent);

      // 计算内容哈希
      const contentHash = calculateContentHash(content);

      // 生成唯一短链接 ID
      let shortId = generateShortId();
      let attempts = 0;
      while (await ArtifactModel.findOne({ shortId })) {
        shortId = generateShortId();
        attempts++;
        if (attempts > 10) {
          throw new Error("无法生成唯一短链接 ID");
        }
      }

      // 处理密码
      let passwordHash: string | undefined;
      if (visibility === "password" && password) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      // 计算过期时间
      let expiresAt: Date | undefined;
      if (expiresInDays && expiresInDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // 创建 artifact
      const artifact = await ArtifactModel.create({
        shortId,
        userId,
        title,
        contentType,
        language,
        content,
        contentHash,
        visibility,
        passwordHash,
        description,
        tags,
        expiresAt,
        viewCount: 0,
      });

      // 创建第一个版本
      await ArtifactVersionModel.create({
        artifactId: artifact._id.toString(),
        versionNumber: 1,
        content,
        contentHash,
      });

      logger.info(`[Artifact] Created artifact ${shortId} for user ${userId}`);

      const baseUrl = process.env.BASE_URL || "http://localhost:3001";
      return {
        id: artifact._id.toString(),
        shortId: artifact.shortId,
        shareUrl: `${baseUrl}/artifacts/${shortId}`,
        embedUrl: `${baseUrl}/artifacts/embed/${shortId}`,
        createdAt: artifact.createdAt,
        expiresAt: artifact.expiresAt,
      };
    } catch (error) {
      logger.error("[Artifact] createArtifact error:", error);
      throw error;
    }
  }

  /**
   * 获取 Artifact
   */
  static async getArtifact(
    shortId: string,
    password?: string
  ): Promise<IArtifact | null> {
    try {
      const artifact = await ArtifactModel.findOne({ shortId }).lean();

      if (!artifact) {
        return null;
      }

      // 检查是否过期
      if (artifact.expiresAt && new Date() > artifact.expiresAt) {
        return null;
      }

      // 检查密码保护
      if (artifact.visibility === "password") {
        if (!password) {
          const error: any = new Error("需要密码");
          error.code = "PASSWORD_REQUIRED";
          throw error;
        }
        if (artifact.passwordHash) {
          const isValid = await bcrypt.compare(password, artifact.passwordHash);
          if (!isValid) {
            const error: any = new Error("密码错误");
            error.code = "INVALID_PASSWORD";
            throw error;
          }
        }
      }

      return artifact as IArtifact;
    } catch (error) {
      logger.error("[Artifact] getArtifact error:", error);
      throw error;
    }
  }

  /**
   * 更新 Artifact
   */
  static async updateArtifact(
    shortId: string,
    userId: string,
    updates: {
      title?: string;
      visibility?: "public" | "private" | "password";
      password?: string;
      description?: string;
      tags?: string[];
      expiresInDays?: number;
    }
  ): Promise<IArtifact | null> {
    try {
      const artifact = await ArtifactModel.findOne({ shortId, userId });

      if (!artifact) {
        return null;
      }

      // 更新字段
      if (updates.title) artifact.title = updates.title;
      if (updates.visibility) artifact.visibility = updates.visibility;
      if (updates.description !== undefined) artifact.description = updates.description;
      if (updates.tags) artifact.tags = updates.tags;

      // 处理密码
      if (updates.visibility === "password" && updates.password) {
        artifact.passwordHash = await bcrypt.hash(updates.password, 10);
      } else if (updates.visibility !== "password") {
        artifact.passwordHash = undefined;
      }

      // 更新过期时间
      if (updates.expiresInDays !== undefined) {
        if (updates.expiresInDays > 0) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + updates.expiresInDays);
          artifact.expiresAt = expiresAt;
        } else {
          artifact.expiresAt = undefined;
        }
      }

      await artifact.save();

      logger.info(`[Artifact] Updated artifact ${shortId}`);
      return artifact;
    } catch (error) {
      logger.error("[Artifact] updateArtifact error:", error);
      throw error;
    }
  }

  /**
   * 删除 Artifact
   */
  static async deleteArtifact(shortId: string, userId: string): Promise<boolean> {
    try {
      const artifact = await ArtifactModel.findOne({ shortId, userId });

      if (!artifact) {
        return false;
      }

      const artifactId = artifact._id.toString();

      // 删除版本和访问日志
      await Promise.all([
        ArtifactVersionModel.deleteMany({ artifactId }),
        ArtifactViewModel.deleteMany({ artifactId }),
        artifact.deleteOne(),
      ]);

      logger.info(`[Artifact] Deleted artifact ${shortId}`);
      return true;
    } catch (error) {
      logger.error("[Artifact] deleteArtifact error:", error);
      throw error;
    }
  }

  /**
   * 获取用户的 Artifacts 列表
   */
  static async listArtifacts(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      sort?: string;
      order?: "asc" | "desc";
    } = {}
  ): Promise<{
    artifacts: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const sort = options.sort || "createdAt";
      const order = options.order || "desc";

      const skip = (page - 1) * limit;
      const sortObj: any = { [sort]: order === "desc" ? -1 : 1 };

      const [artifacts, total] = await Promise.all([
        ArtifactModel.find({ userId })
          .select("shortId title contentType visibility viewCount createdAt expiresAt")
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .lean(),
        ArtifactModel.countDocuments({ userId }),
      ]);

      return {
        artifacts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error("[Artifact] listArtifacts error:", error);
      throw error;
    }
  }

  /**
   * 记录访问
   */
  static async recordView(
    shortId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      referer?: string;
    }
  ): Promise<void> {
    try {
      const artifact = await ArtifactModel.findOne({ shortId });

      if (!artifact) {
        return;
      }

      // 增加访问计数
      artifact.viewCount += 1;
      artifact.lastViewedAt = new Date();
      await artifact.save();

      // 记录访问日志
      await ArtifactViewModel.create({
        artifactId: artifact._id.toString(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        referer: metadata.referer,
      });

      logger.info(`[Artifact] Recorded view for ${shortId}`);
    } catch (error) {
      logger.error("[Artifact] recordView error:", error);
      // 不抛出错误,避免影响主流程
    }
  }
}
