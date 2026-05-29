import { Router } from "express";
import { ipLocationLimiter, ipQueryLimiter, ipReportLimiter } from "../middleware/routeLimiters";
import { IpInfoController } from "../controllers/ipInfoController";

const router = Router();

router.get("/ip", ipQueryLimiter, IpInfoController.queryIpInfo);
router.post("/report-ip", ipReportLimiter, IpInfoController.reportClientIp);
router.get("/ip-location", ipLocationLimiter, IpInfoController.queryIpLocation);

export default router;

