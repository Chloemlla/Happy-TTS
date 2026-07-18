import express from "express";
import { imageDataController } from "../controllers/imageDataController";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/routeLimiters";

const router = express.Router();

// 图片数据相关接口限速器
const imageDataLimiter = createLimiter({
  name: "imageData",
  profile: "verification",
  category: "public-api",
  message: "图片数据接口请求过于频繁，请稍后再试",
});

// 验证单个图片数据
router.post("/validate", imageDataLimiter, authenticateToken, imageDataController.validateImageData);

// 批量验证图片数据
router.post("/validate-batch", imageDataLimiter, authenticateToken, imageDataController.validateBatchImageData);

// 获取图片数据信息
router.get("/info/:imageId", imageDataLimiter, authenticateToken, imageDataController.getImageDataInfo);

// 记录图片数据到数据库
router.post("/record", imageDataLimiter, authenticateToken, imageDataController.recordImageData);

export default router;
