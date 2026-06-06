import { Router } from "express";
import { LifeController } from "../controllers/lifeController";
import { apiKeyAuth } from "../middleware/apiKeyAuth";

const router = Router();

router.use(apiKeyAuth("life"));

/**
 * @route GET /api/life/phone-address
 * @desc 手机号码归属地查询
 * @access Public
 * @param {string} phone - 手机号码
 */
router.get("/phone-address", LifeController.phoneAddress);

/**
 * @route GET /api/life/oil-price
 * @desc 油价查询
 * @access Public
 * @param {string} city - 城市名称（可选）
 */
router.get("/oil-price", LifeController.oilPrice);

export default router;
