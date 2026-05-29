import { Router } from "express";
import { statusLimiter } from "../middleware/routeLimiters";
import { DiagnosticsController } from "../controllers/diagnosticsController";

const router = Router();

router.get("/", statusLimiter, DiagnosticsController.getFrontendConfig);

export default router;

