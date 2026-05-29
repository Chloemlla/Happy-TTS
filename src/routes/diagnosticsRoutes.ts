import { Router } from "express";
import { docsTimeoutLimiter, integrityLimiter, serverStatusLimiter } from "../middleware/routeLimiters";
import { DiagnosticsController } from "../controllers/diagnosticsController";

const router = Router();

router.head("/proxy-test", integrityLimiter, DiagnosticsController.ok);
router.get("/proxy-test", integrityLimiter, DiagnosticsController.ok);
router.get("/timing-test", integrityLimiter, DiagnosticsController.ok);
router.post("/report-docs-timeout", docsTimeoutLimiter, DiagnosticsController.reportDocsTimeout);
router.post("/server_status", serverStatusLimiter, DiagnosticsController.getServerStatus);

export default router;

