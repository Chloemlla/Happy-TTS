import express from "express";
import { batchSearchRecords, bindUid, getSearchChanges, getSettings, getUid, putSettings, unbindUid } from "../controllers/bilibiliSyncController";
import { authenticateToken } from "../middleware/authenticateToken";
import { bilibiliSyncLimiter } from "../middleware/routeLimiters";

const router = express.Router();

router.use(authenticateToken, bilibiliSyncLimiter);

router.get("/uid", getUid);
router.post("/uid", bindUid);
router.delete("/uid", unbindUid);
router.get("/settings", getSettings);
router.put("/settings", putSettings);
router.post("/search-records/batch", batchSearchRecords);
router.get("/search-records/changes", getSearchChanges);

export default router;

