import type { Router } from "express";
import multer from "multer";
import { authMiddlewareV2 as authMiddleware, isAdminRole } from "../../middleware/auth";
import { IPFSService } from "../../services/ipfsService";
import { getClientIP } from "../../utils/ipUtils";
import { UserStorage } from "../../utils/userStorage";

export function registerProfileAvatarRoutes(router: Router): void {
  const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB限制
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || "").toLowerCase();
      const name = (file.originalname || "").toLowerCase();
      if (mime === "image/svg+xml" || mime === "image/svg" || name.endsWith(".svg")) {
        return cb(new Error("出于安全考虑，已禁止上传 SVG 文件"));
      }
      cb(null, true);
    },
  });

  // 用户头像上传接口（支持文件上传到IPFS）
  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.post("/user/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });
      if (!req.file) return res.status(400).json({ error: "未上传头像文件" });

      // 验证文件类型和大小
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/svg+xml",
      ];
      if (!allowedTypes.includes(req.file.mimetype.toLowerCase())) {
        return res.status(400).json({ error: "不支持的文件格式，请上传图片文件（JPEG、PNG、GIF、WebP、BMP、SVG）" });
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "文件大小不能超过5MB" });
      }

      // 直接调用ipfsService上传图片
      let result;
      try {
        console.log(`[avatar upload] 开始上传头像: ${req.file.originalname}, 大小: ${req.file.size} bytes`);
        const clientIp = getClientIP(req);
        result = await IPFSService.uploadFile(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          undefined,
          undefined,
          {
            clientIp,
            isAdmin: isAdminRole((req as any).user?.role),
            shouldSkipTurnstile: isAdminRole((req as any).user?.role),
          },
        );
        if (!result?.web2url) {
          console.error("[avatar upload] IPFS上传失败，返回值:", result);
          return res.status(500).json({ error: "IPFS上传失败，请稍后重试" });
        }
        console.log(`[avatar upload] IPFS上传成功: ${result.web2url}`);
      } catch (ipfsErr) {
        // 兼容 TS 类型，安全打印错误堆栈
        console.error(
          "[avatar upload] IPFS上传异常:",
          ipfsErr && typeof ipfsErr === "object" && "stack" in ipfsErr ? ipfsErr.stack : ipfsErr,
        );

        // 根据错误类型提供不同的错误信息
        let errorMessage = "头像上传失败，请稍后重试";
        if (ipfsErr instanceof Error) {
          if (ipfsErr.message.includes("503") || ipfsErr.message.includes("服务暂时不可用")) {
            errorMessage = "图床服务暂时不可用，请稍后重试";
          } else if (ipfsErr.message.includes("timeout") || ipfsErr.message.includes("超时")) {
            errorMessage = "上传超时，请检查网络连接后重试";
          } else if (ipfsErr.message.includes("网络") || ipfsErr.message.includes("network")) {
            errorMessage = "网络连接异常，请检查网络后重试";
          }
        }

        return res.status(500).json({
          error: errorMessage,
          detail: ipfsErr instanceof Error ? ipfsErr.message : String(ipfsErr),
          retryable: true,
        });
      }

      // 存储图片web2url，删除base64
      await UserStorage.updateUser(user.id, { avatarUrl: result.web2url, avatarBase64: undefined } as any);
      res.json({ success: true, avatarUrl: result.web2url });
    } catch (e) {
      console.error("[avatar upload] 头像上传接口异常:", String(e));
      res.status(500).json({
        error: "头像上传失败，请稍后重试",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // 用户头像是否存在接口（需登录）
  // 逻辑：如果数据库中 avatarUrl 字段不存在或为空，返回 hasAvatar: false，前端可回退到默认 SVG
  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.get("/user/avatar/exist", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });
      const dbUser = await UserStorage.getUserById(user.id);
      // avatarUrl 不存在或为空字符串时，hasAvatar 为 false
      const hasAvatar = !!(dbUser && typeof dbUser.avatarUrl === "string" && dbUser.avatarUrl.length > 0);
      res.json({ hasAvatar });
    } catch (_e) {
      res.status(500).json({ error: "查询头像状态失败" });
    }
  });
}
