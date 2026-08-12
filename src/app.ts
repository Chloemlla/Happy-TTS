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
import lumenRouter from "./routes/lumen/index.js";
import crashSdkRoutes from "./routes/crashSdkRoutes.js";

// 进程级错误处理 — 防止未处理异常/拒绝静默吞没
process.on("unhandledRejection", (reason) => {
  logger.error("[进程] 未处理的 Promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (error) => {
  logger.error("[进程] 未捕获的异常", {
    error: error.message,
    stack: error.stack,
  });
  // 未捕获异常后进程状态不可信，安全退出
  process.exit(1);
});

const app = express();
profilingService.start();

registerCoreMiddleware(app);
registerSecurityMiddleware(app);
registerApiRoutes(app);
app.use("/", lumenRouter);
app.use("/api/crash-sdk", crashSdkRoutes);
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
