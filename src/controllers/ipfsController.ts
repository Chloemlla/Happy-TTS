import axios from "axios";
import type { Request, Response } from "express";
import { IPFSService } from "../services/ipfsService";
import { TransactionService } from "../services/transactionService";
import logger from "../utils/logger";

export class IPFSController {
  /**
   * 上传图片到IPFS
   */
  public static async uploadImage(req: Request, res: Response) {
    try {
      const ip = IPFSController.getClientIp(req);

      logger.info("收到IPFS上传请求", {
        ip,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      // 检查是否有文件上传
      if (!req.file) {
        return res.status(400).json({
          error: "请选择要上传的图片文件",
        });
      }

      const { buffer, originalname, mimetype } = req.file;

      // 使用事务包装整个上传过程，确保数据一致性
      const result = await TransactionService.executeTransaction(async (_session) => {
        const shortLinkFlag = req.body && req.body.source === "imgupload";
        const userId = (req as any).user?.id || "admin";
        const username = (req as any).user?.username || "admin";
        const isAdmin = (req as any).user?.role === "admin";
        const authenticatedByApiKey = Boolean((req as any).apiKey);

        // 检查是否为本地开发环境的管理员请求
        const isLocalIp = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
        const isDev = process.env.NODE_ENV !== "production";
        const shouldSkipTurnstile = authenticatedByApiKey || (isAdmin && isLocalIp && isDev);

        if (shouldSkipTurnstile) {
          logger.info("认证上传请求，将跳过Turnstile验证", {
            ip,
            userId,
            username,
            isAdmin,
            authenticatedByApiKey,
            isDev,
            environment: process.env.NODE_ENV || "development",
          });
        }

        // 从请求中提取cfToken（Turnstile验证token）
        const cfToken = req.body.cfToken;

        // ImageBed (scdn.io v1.php) 透传参数
        const passwordEnabled =
          req.body.password_enabled === "true" || req.body.password_enabled === true;
        const useLegacyIpfs =
          req.body.useLegacyIpfs === "true" || req.body.useLegacyIpfs === true;

        // 使用IPFS服务上传文件（传递上下文用于本机管理员免除Turnstile验证）
        const uploadResult = await IPFSService.uploadFile(
          buffer,
          originalname,
          mimetype,
          {
            shortLink: !!shortLinkFlag,
            userId,
            username,
            outputFormat: typeof req.body.outputFormat === "string" ? req.body.outputFormat : undefined,
            cdnDomain:
              typeof req.body.cdn_domain === "string" && req.body.cdn_domain !== "default"
                ? req.body.cdn_domain
                : undefined,
            storageDestination:
              typeof req.body.storage_destination === "string"
                ? req.body.storage_destination
                : undefined,
            passwordEnabled,
            imagePassword: typeof req.body.image_password === "string" ? req.body.image_password : undefined,
            passwordType: typeof req.body.password_type === "string" ? req.body.password_type : undefined,
            passwordQuestion:
              typeof req.body.password_question === "string" ? req.body.password_question : undefined,
          },
          cfToken,
          {
            clientIp: ip,
            isAdmin,
            isDev,
            shouldSkipTurnstile,
            userAgent: req.headers["user-agent"] || "",
            useLegacyIpfs,
          },
        );

        logger.info("图片上传成功", {
          ip,
          filename: originalname,
          fileSize: buffer.length,
          remoteFilename: uploadResult.filename,
          cid: uploadResult.cid,
          url: uploadResult.url,
          web2url: uploadResult.web2url,
          storageBackend: uploadResult.storageBackend,
        });

        return uploadResult;
      });

      // 返回成功响应
      res.json({
        success: true,
        message: result.message || "图片上传成功",
        data: {
          cid: result.cid,
          url: result.url,
          web2url: result.web2url,
          fileSize: result.fileSize,
          filename: result.filename || originalname,
          shortUrl: result.shortUrl,
          storageBackend: result.storageBackend,
          passwordProtected: result.passwordProtected,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          compressionRatio: result.compressionRatio,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "上传失败";
      const ip = IPFSController.getClientIp(req);

      // 简单记录控制器层错误，详细错误处理已在service层完成
      logger.error("IPFS上传失败", {
        ip,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      const statusCode =
        /人机验证|Turnstile|请先完成/.test(errorMessage)
          ? 403
          : /文件|图片|格式|大小|SVG|配置未设置/.test(errorMessage)
            ? 400
            : 500;

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * 获取IPFS配置
   */
  public static async getConfig(req: Request, res: Response) {
    try {
      const ip = IPFSController.getClientIp(req);
      const userId = (req as any).user?.id || "unknown";

      logger.info("获取IPFS配置请求", {
        ip,
        userId,
        timestamp: new Date().toISOString(),
      });

      const ipfsUploadUrl = await IPFSService.getCurrentIPFSUploadURL().catch(() => "");
      const ipfsUa = await IPFSService.getCurrentIPFSUserAgent();
      const bypassUAKeyword = await IPFSService.getCurrentBypassUAKeyword();
      const allowAllFileTypes = await IPFSService.getCurrentAllowAllFileTypes();
      const imageBedApiUrl = await IPFSService.getCurrentImageBedApiUrl();
      const imageBedCdnDomain = await IPFSService.getCurrentImageBedDefaultCdn();
      const imageBedStorageDestination = await IPFSService.getCurrentImageBedDefaultStorage();
      const imageBedOutputFormat = await IPFSService.getCurrentImageBedDefaultOutputFormat();

      res.json({
        success: true,
        data: {
          ipfsUploadUrl,
          ipfsUa,
          bypassUAKeyword,
          allowAllFileTypes,
          imageBedApiUrl,
          imageBedCdnDomain,
          imageBedStorageDestination,
          imageBedOutputFormat,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取配置失败";

      logger.error("获取IPFS配置失败", {
        ip: IPFSController.getClientIp(req),
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * 设置IPFS配置
   */
  public static async setConfig(req: Request, res: Response) {
    try {
      const ip = IPFSController.getClientIp(req);
      const userId = (req as any).user?.id || "unknown";
      const {
        ipfsUploadUrl,
        ipfsUa,
        bypassUAKeyword,
        allowAllFileTypes,
        imageBedApiUrl,
        imageBedCdnDomain,
        imageBedStorageDestination,
        imageBedOutputFormat,
      } = req.body;

      logger.info("设置IPFS配置请求", {
        ip,
        userId,
        ipfsUploadUrl,
        ipfsUa,
        bypassUAKeyword,
        allowAllFileTypes,
        imageBedApiUrl,
        imageBedCdnDomain,
        imageBedStorageDestination,
        imageBedOutputFormat,
        timestamp: new Date().toISOString(),
      });

      // 至少需要提供一个可更新的字段
      const hasNonString = (v: any) => typeof v === "string" && v.trim().length > 0;
      if (
        !hasNonString(ipfsUploadUrl) &&
        !hasNonString(ipfsUa) &&
        !hasNonString(bypassUAKeyword) &&
        typeof allowAllFileTypes !== "boolean" &&
        !hasNonString(imageBedApiUrl) &&
        !hasNonString(imageBedCdnDomain) &&
        !hasNonString(imageBedStorageDestination) &&
        !hasNonString(imageBedOutputFormat)
      ) {
        return res.status(400).json({ success: false, error: "请提供至少一个配置项进行更新" });
      }

      // 更新各项配置
      if (hasNonString(ipfsUploadUrl)) {
        await IPFSService.setIPFSUploadURL(ipfsUploadUrl);
      }
      if (hasNonString(ipfsUa)) {
        await IPFSService.setIPFSUserAgent(ipfsUa);
      }
      if (hasNonString(bypassUAKeyword)) {
        await IPFSService.setBypassUAKeyword(bypassUAKeyword);
      }
      if (typeof allowAllFileTypes === "boolean") {
        await IPFSService.setAllowAllFileTypes(allowAllFileTypes);
      }
      if (hasNonString(imageBedApiUrl)) {
        await IPFSService.setImageBedApiUrl(imageBedApiUrl);
      }
      if (hasNonString(imageBedCdnDomain)) {
        await IPFSService.setImageBedDefaultCdn(imageBedCdnDomain);
      }
      if (hasNonString(imageBedStorageDestination)) {
        await IPFSService.setImageBedDefaultStorage(imageBedStorageDestination);
      }
      if (hasNonString(imageBedOutputFormat)) {
        await IPFSService.setImageBedDefaultOutputFormat(imageBedOutputFormat);
      }

      res.json({
        success: true,
        message: "IPFS配置设置成功",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "设置配置失败";

      logger.error("设置IPFS配置失败", {
        ip: IPFSController.getClientIp(req),
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * 测试ImageBed/IPFS配置
   */
  public static async testConfig(req: Request, res: Response) {
    try {
      const ip = IPFSController.getClientIp(req);
      const userId = (req as any).user?.id || "unknown";
      const target = (req.query.target as string) || (req.body && req.body.target) || "imagebed";

      logger.info("测试上传配置请求", {
        ip,
        userId,
        target,
        timestamp: new Date().toISOString(),
      });

      if (target === "ipfs") {
        const ipfsUploadUrl = await IPFSService.getCurrentIPFSUploadURL();
        const ipfsUa = await IPFSService.getCurrentIPFSUserAgent();
        const testBuffer = Buffer.from("IPFS配置测试文件", "utf-8");
        const testFilename = "test-ipfs-config.txt";
        const formData = new (require("form-data"))();
        formData.append("file", testBuffer, { filename: testFilename, contentType: "text/plain" });

        const response = await axios.post(
          `${ipfsUploadUrl}?stream-channels=true&pin=false&wrap-with-directory=false&progress=false`,
          formData,
          {
            headers: { ...formData.getHeaders(), "User-Agent": ipfsUa },
            timeout: 10000,
          },
        );

        if (response.data?.Hash) {
          return res.json({
            success: true,
            message: `IPFS配置测试成功，CID: ${response.data.Hash}`,
          });
        }
        throw new Error("IPFS服务返回格式异常");
      }

      // 默认测试 ImageBed（scdn.io v1.php）
      const apiUrl = await IPFSService.getCurrentImageBedApiUrl();
      // 1x1 透明 PNG
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const testBuffer = Buffer.from(pngBase64, "base64");
      const formData = new (require("form-data"))();
      formData.append("image", testBuffer, { filename: "test-imagebed.png", contentType: "image/png" });

      const response = await axios.post(apiUrl, formData, {
        headers: { ...formData.getHeaders() },
        timeout: 15000,
        validateStatus: (s: number) => s >= 200 && s < 500,
      });

      const body: any = response.data || {};
      if (body && body.success === true) {
        const url = body.url || body.data?.url || "";
        return res.json({
          success: true,
          message: `ImageBed 配置测试成功，URL: ${url}`,
          data: body.data || null,
        });
      }

      const errMsg = body?.error || body?.message || `HTTP ${response.status}`;
      throw new Error(`ImageBed 返回失败: ${errMsg}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "测试配置失败";

      logger.error("测试上传配置失败", {
        ip: IPFSController.getClientIp(req),
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        error: `配置测试失败: ${errorMessage}`,
      });
    }
  }

  /**
   * 获取客户端IP地址
   */
  private static getClientIp(req: Request): string {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown";

    return ip.replace(/^::ffff:/, "");
  }
}
