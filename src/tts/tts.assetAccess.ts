import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { config } from "../config/config";
import { AuditLogService } from "../services/auditLogService";
import logger from "../utils/logger";
import { ttsAudioAssetStore } from "./tts.asset";

export interface TtsAssetAccessClaims {
  v: 1;
  fileName: string;
  taskId?: string;
  userId?: string;
  fingerprintHash?: string;
  exp: number;
  allowDownload: boolean;
  allowShare: boolean;
  watermarkId?: string;
  policyVersion?: string;
}

export interface TtsAssetAccessUrlOptions {
  fileName: string;
  taskId?: string;
  userId?: string;
  fingerprint?: string;
  allowDownload?: boolean;
  allowShare?: boolean;
  watermarkId?: string;
  policyVersion?: string;
  ttlSeconds?: number;
}

interface AssetRequestContext {
  req: Request;
  res: Response;
  fileName: string;
  accessToken: string;
  download: boolean;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !["false", "0", "no", "off", ""].includes(raw.trim().toLowerCase());
}

function parseNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function hashValue(value?: string): string | undefined {
  if (!value || value === "unknown") return undefined;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveMimeType(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/opus";
    case "pcm":
      return "audio/pcm";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

export class TtsAssetAccessService {
  private readonly secret = process.env.TTS_ASSET_ACCESS_SECRET || config.jwtSecret;
  private readonly audioDir = path.resolve(config.audioDir);

  public getDefaultTtlSeconds(): number {
    return parseNumberEnv("TTS_ASSET_TOKEN_TTL_SECONDS", 12 * 60 * 60, 60, 7 * 24 * 60 * 60);
  }

  public isDownloadEnabled(): boolean {
    return parseBooleanEnv("TTS_DOWNLOADS_ENABLED", true);
  }

  public isShareEnabled(): boolean {
    return parseBooleanEnv("TTS_ASSET_SHARE_ENABLED", false);
  }

  public buildWatermarkId(params: {
    contentHash: string;
    fileName: string;
    userId?: string;
    taskId?: string;
    fingerprint?: string;
  }): string {
    const material = [
      params.contentHash,
      params.fileName,
      params.userId || "anonymous",
      params.taskId || "no-task",
      hashValue(params.fingerprint) || "no-fingerprint",
    ].join("|");
    return `wm_${crypto.createHmac("sha256", this.secret).update(material).digest("hex").slice(0, 24)}`;
  }

  public signClaims(claims: TtsAssetAccessClaims): string {
    const payload = base64url(JSON.stringify(claims));
    const signature = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  public buildAccessUrl(options: TtsAssetAccessUrlOptions): string {
    const ttlSeconds = options.ttlSeconds ?? this.getDefaultTtlSeconds();
    const allowDownload = options.allowDownload ?? this.isDownloadEnabled();
    const allowShare = options.allowShare ?? this.isShareEnabled();
    const claims: TtsAssetAccessClaims = {
      v: 1,
      fileName: this.sanitizeFileName(options.fileName),
      taskId: options.taskId,
      userId: options.userId,
      fingerprintHash: hashValue(options.fingerprint),
      exp: Date.now() + ttlSeconds * 1000,
      allowDownload,
      allowShare,
      watermarkId: options.watermarkId,
      policyVersion: options.policyVersion,
    };
    const token = this.signClaims(claims);
    return `${config.baseUrl}/api/tts/assets/${encodeURIComponent(claims.fileName)}?accessToken=${encodeURIComponent(token)}`;
  }

  public verifyToken(fileName: string, accessToken: string, download: boolean): TtsAssetAccessClaims {
    if (!accessToken || !accessToken.includes(".")) {
      throw new Error("TTS_ASSET_TOKEN_MISSING");
    }

    const [payload, signature] = accessToken.split(".");
    if (!payload || !signature) {
      throw new Error("TTS_ASSET_TOKEN_INVALID");
    }

    const expectedSignature = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    if (!safeEqual(signature, expectedSignature)) {
      throw new Error("TTS_ASSET_TOKEN_INVALID");
    }

    let claims: TtsAssetAccessClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TtsAssetAccessClaims;
    } catch {
      throw new Error("TTS_ASSET_TOKEN_INVALID");
    }

    if (claims.v !== 1 || claims.fileName !== this.sanitizeFileName(fileName)) {
      throw new Error("TTS_ASSET_TOKEN_SCOPE_MISMATCH");
    }
    if (Date.now() > claims.exp) {
      throw new Error("TTS_ASSET_TOKEN_EXPIRED");
    }
    if (download && !claims.allowDownload) {
      throw new Error("TTS_ASSET_DOWNLOAD_FORBIDDEN");
    }

    return claims;
  }

  public async ensureAssetAvailable(fileName: string): Promise<boolean> {
    const safeFileName = this.sanitizeFileName(fileName);
    const filePath = this.resolveAudioPath(safeFileName);

    if (fs.existsSync(filePath)) {
      return true;
    }

    await ttsAudioAssetStore.restoreAudioAssetToDisk(safeFileName, this.audioDir);
    return fs.existsSync(filePath);
  }

  public async serveAsset(context: AssetRequestContext): Promise<void> {
    let claims: TtsAssetAccessClaims;
    try {
      claims = this.verifyToken(context.fileName, context.accessToken, context.download);
    } catch (error) {
      await this.auditAssetAccess(context.req, "failure", error instanceof Error ? error.message : "TTS_ASSET_FORBIDDEN", {
        fileName: this.safeAuditFileName(context.fileName),
        download: context.download,
      });
      context.res.status(403).json({
        success: false,
        error: "Audio access is not authorized or has expired",
        code: error instanceof Error ? error.message : "TTS_ASSET_FORBIDDEN",
      });
      return;
    }

    const safeFileName = this.sanitizeFileName(context.fileName);
    const filePath = this.resolveAudioPath(safeFileName);

    if (!(await this.ensureAssetAvailable(safeFileName))) {
      context.res.status(404).json({
        success: false,
        error: "Audio asset not found",
        code: "TTS_ASSET_NOT_FOUND",
      });
      return;
    }

    const metadata = await ttsAudioAssetStore.getAudioAssetMetadata(safeFileName);
    const watermarkId = claims.watermarkId || metadata?.watermarkId;

    context.res.setHeader("Content-Type", resolveMimeType(safeFileName));
    context.res.setHeader("Cache-Control", "private, no-store");
    context.res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (watermarkId) {
      context.res.setHeader("X-TTS-Watermark-Id", watermarkId);
    }
    context.res.setHeader("X-TTS-Asset-Expires-At", new Date(claims.exp).toISOString());

    if (context.download) {
      await this.auditAssetAccess(context.req, "success", undefined, {
        fileName: safeFileName,
        taskId: claims.taskId,
        watermarkId,
        download: true,
      });
      context.res.download(filePath, safeFileName);
      return;
    }

    context.res.sendFile(filePath, (error: Error | undefined) => {
      if (error) {
        logger.warn("TTS audio send failed", { error, fileName: safeFileName });
      }
    });
  }

  private sanitizeFileName(fileName: string): string {
    const safe = path.basename(String(fileName || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, ""));
    if (!/^[a-zA-Z0-9_.-]+\.(mp3|opus|aac|flac|wav|pcm)$/i.test(safe)) {
      throw new Error("TTS_ASSET_FILE_INVALID");
    }
    return safe;
  }

  private safeAuditFileName(fileName: string): string {
    try {
      return this.sanitizeFileName(fileName);
    } catch {
      return path.basename(String(fileName || "invalid")).slice(0, 120);
    }
  }

  private resolveAudioPath(fileName: string): string {
    const resolved = path.resolve(this.audioDir, fileName);
    if (resolved !== this.audioDir && !resolved.startsWith(`${this.audioDir}${path.sep}`)) {
      throw new Error("TTS_ASSET_PATH_INVALID");
    }
    return resolved;
  }

  private async auditAssetAccess(
    req: Request,
    result: "success" | "failure",
    errorMessage?: string,
    detail?: Record<string, unknown>,
  ) {
    const user = (req as any).user;
    await AuditLogService.log({
      requestId: (req as any).requestId,
      userId: user?.id || user?._id || "asset-token",
      username: user?.username || user?.name || "asset-token",
      role: user?.role || "asset-token",
      action: "tts.asset.access",
      module: "tts",
      result,
      errorMessage,
      detail,
      ip: req.ip || req.socket.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"],
      path: req.originalUrl || req.path,
      method: req.method,
    });
  }
}

export const ttsAssetAccessService = new TtsAssetAccessService();
