// 设置时区为上海
process.env.TZ = "Asia/Shanghai";

import express from "express";
import {
  registerApiRoutes,
  registerCoreMiddleware,
  registerErrorHandlers,
  registerSecurityMiddleware,
  registerStaticRoutes,
} from "./app/assembly";
import { profilingService } from "./services/profilingService";
import { startServer } from "./app/startup";
import logger from "./utils/logger";

const app = express();
profilingService.start();

registerCoreMiddleware(app);
registerSecurityMiddleware(app);
registerApiRoutes(app);
registerStaticRoutes(app);
registerErrorHandlers(app);

if (process.env.NODE_ENV !== "test") {
  void startServer(app).catch((error) => {
    logger.error("[启动] 服务启动失败，进程即将退出", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default app;
