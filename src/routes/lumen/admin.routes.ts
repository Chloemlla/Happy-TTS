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

router.get("/me", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operator = (req as any).operator;
    res.json({
      id: operator.id,
      username: operator.username,
      role: operator.role,
      createdAt: operator.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminDashboardService.adminDashboardSnapshot();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/actions", requireAdmin, requireAdminActionOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, payload } = req.body;
    const operator = (req as any).operator;
    const result = await adminService.applyAdminAction(operator.id, action, payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;