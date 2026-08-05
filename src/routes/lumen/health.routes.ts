import { Router, type Request, type Response, type NextFunction } from "express";
import { config } from "../../config/config";

const router = Router();

router.get("/", (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      status: "ok",
      service: "project-lumen-api",
      version: config.appVersion || "0.0.0",
    });
  } catch (error) {
    next(error);
  }
});

export default router;