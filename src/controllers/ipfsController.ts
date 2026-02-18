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

        // 检查是否为本地开发环境的管理员请求
        const isLocalIp = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
        const isDev = process.env.NODE_ENV !== "production";
        const shouldSkipTurnstile = isAdmin && isLocalIp && isDev;

        if (shouldSkipTurnstile) {
          logger.info("本地开发环境管理员请求，将跳过Turnstile验证", {
            ip,
            userId,
            username,
            isAdmin,
            isDev,
            environment: process.env.NODE_ENV || "development",
          });
        }

        // 从请求中提取cfToken（Turnstile验证token）
        const cfToken = req.body.cfToken;

        // 使用IPFS服务上传文件（传递上下文用于本机管理员免除Turnstile验证）
        const uploadResult = await IPFSService.uploadFile(
          buffer,
          originalname,
          mimetype,
          { shortLink: !!shortLinkFlag, userId, username },
          cfToken,
          {
            clientIp: ip,
            isAdmin,
            isDev,
            shouldSkipTurnstile,
            userAgent: req.headers["user-agent"] || "",
          },
        );

        logger.info("IPFS上传成功", {
          ip,
          filename: originalname,
          fileSize: buffer.length,
          cid: uploadResult.cid,
          web2url: uploadResult.web2url,
        });

        return uploadResult;
      });

      // 返回成功响应
      res.json({
        success: true,
        message: "图片上传成功",
        data: {
          cid: result.cid,
          url: result.url,
          web2url: result.web2url,
          fileSize: result.fileSize,
          filename: originalname,
          shortUrl: result.shortUrl,
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

      res.status(500).json({
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

      const ipfsUploadUrl = await IPFSService.getCurrentIPFSUploadURL();
      const ipfsUa = await IPFSService.getCurrentIPFSUserAgent();
      const bypassUAKeyword = await IPFSService.getCurrentBypassUAKeyword();
      const allowAllFileTypes = await IPFSService.getCurrentAllowAllFileTypes();

      res.json({
        success: true,
        data: {
          ipfsUploadUrl,
          ipfsUa,
          bypassUAKeyword,
          allowAllFileTypes,
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
      const { ipfsUploadUrl, ipfsUa, bypassUAKeyword, allowAllFileTypes } = req.body;

      logger.info("设置IPFS配置请求", {
        ip,
        userId,
        ipfsUploadUrl,
        ipfsUa,
        bypassUAKeyword,
        allowAllFileTypes,
        timestamp: new Date().toISOString(),
      });

      // 至少需要提供一个可更新的字段
      if (
        (!ipfsUploadUrl || typeof ipfsUploadUrl !== "string" || !ipfsUploadUrl.trim()) &&
        (!ipfsUa || typeof ipfsUa !== "string" || !ipfsUa.trim()) &&
        (!bypassUAKeyword || typeof bypassUAKeyword !== "string" || !bypassUAKeyword.trim()) &&
        typeof allowAllFileTypes !== "boolean"
      ) {
        return res.status(400).json({ success: false, error: "请提供至少一个配置项进行更新" });
      }

      // 更新各项配置
      if (ipfsUploadUrl && typeof ipfsUploadUrl === "string" && ipfsUploadUrl.trim()) {
        await IPFSService.setIPFSUploadURL(ipfsUploadUrl);
      }
      if (typeof ipfsUa === "string" && ipfsUa.trim()) {
        await IPFSService.setIPFSUserAgent(ipfsUa);
      }
      if (typeof bypassUAKeyword === "string" && bypassUAKeyword.trim()) {
        await IPFSService.setBypassUAKeyword(bypassUAKeyword);
      }
      if (typeof allowAllFileTypes === "boolean") {
        await IPFSService.setAllowAllFileTypes(allowAllFileTypes);
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
   * 测试IPFS配置
   */
  public static async testConfig(req: Request, res: Response) {
    try {
      const ip = IPFSController.getClientIp(req);
      const userId = (req as any).user?.id || "unknown";

      logger.info("测试IPFS配置请求", {
        ip,
        userId,
        timestamp: new Date().toISOString(),
      });

      const ipfsUploadUrl = await IPFSService.getCurrentIPFSUploadURL();
      const ipfsUa = await IPFSService.getCurrentIPFSUserAgent();

      // 创建一个简单的测试文件
      const testBuffer = Buffer.from("IPFS配置测试文件", "utf-8");
      const testFilename = "test-ipfs-config.txt";

      // 测试上传
      const formData = new (require("form-data"))();
      formData.append("file", testBuffer, {
        filename: testFilename,
        contentType: "text/plain",
      });

      const response = await axios.post(
        `${ipfsUploadUrl}?stream-channels=true&pin=false&wrap-with-directory=false&progress=false`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            "User-Agent": ipfsUa,
          },
          timeout: 10000, // 10秒超时
        },
      );

      if (response.data?.Hash) {
        logger.info("IPFS配置测试成功", {
          ip,
          userId,
          cid: response.data.Hash,
        });

        res.json({
          success: true,
          message: `IPFS配置测试成功，测试文件CID: ${response.data.Hash}`,
        });
      } else {
        throw new Error("IPFS服务返回格式异常");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "测试配置失败";

      logger.error("测试IPFS配置失败", {
        ip: IPFSController.getClientIp(req),
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        error: `IPFS配置测试失败: ${errorMessage}`,
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
