import express from "express";
import { DeepLXController } from "../controllers/deeplxController";

const router = express.Router();

router.get("/config", DeepLXController.getConfig);
router.post("/translate", DeepLXController.translate);

export default router;
