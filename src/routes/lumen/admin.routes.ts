import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin, requireAdminActionOperator } from "../../middleware/lumen/index.js";
import { adminService, adminDashboardService } from "../../services/lumen/index.js";

const router = Router();

router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    const result = await adminService.createAdminSession(username, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/auth/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    const result = await adminService.refreshAdminSession(refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAdmin(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operator = req.lumenAdminOperator;
    res.json({
      id: operator,
      username: req.lumenAdminUsername,
      role: req.lumenAdminRole,
      createdAt: req.lumenAdminCreatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", requireAdmin(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminDashboardService.adminDashboardSnapshot();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/actions", requireAdmin(), requireAdminActionOperator(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, payload } = req.body;
    const operator = req.lumenAdminOperator;
    if (!operator) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await adminService.applyAdminAction(operator, action, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;