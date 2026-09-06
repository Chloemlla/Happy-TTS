import { Router } from "express";
import { lcCompatLimiter } from "../middleware/routeLimiters";
import { libreChatService } from "../services/libreChatService";

const router = Router();

router.get("/lc", lcCompatLimiter, (_req, res) => {
  try {
    const record = libreChatService.getLatestRecord();
    if (record) {
      return res.json({
        update_time: record.updateTime,
        image_name: record.imageUrl,
        update_time_shanghai: record.updateTimeShanghai,
      });
    }
    return res.status(404).json({ error: "No data available." });
  } catch (_error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// 旧外部契约：302 指向的内部 /api/libre-chat/librechat-image 现在要求登录，公开端点
// 自打脸会 401；改为内联返回与旧内部响应一致的 { image_url }，不依赖需登录的路由。
router.get("/librechat-image", lcCompatLimiter, (_req, res) => {
  try {
    const record = libreChatService.getLatestRecord();
    if (record) {
      return res.json({ image_url: record.imageUrl });
    }
    return res.status(404).json({ error: "No data available." });
  } catch (_error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;

