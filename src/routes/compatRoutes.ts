import { Router } from "express";
import { lcCompatLimiter } from "../middleware/routeLimiters";

const router = Router();

router.get("/lc", lcCompatLimiter, (_req, res) => {
  try {
    const { libreChatService } = require("../services/libreChatService");
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

router.get("/librechat-image", lcCompatLimiter, (_req, res) =>
  res.redirect(302, "/api/libre-chat/librechat-image"),
);

export default router;

