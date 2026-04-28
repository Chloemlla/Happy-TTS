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
import { startServer } from "./app/startup";

const app = express();

registerCoreMiddleware(app);
registerSecurityMiddleware(app);
registerApiRoutes(app);
registerStaticRoutes(app);
registerErrorHandlers(app);

if (process.env.NODE_ENV !== "test") {
  void startServer(app);
}

export default app;
