import { Router } from "express";
// 不从 controllers/authController 这个 barrel 取：它会把 login/passkey/provider/registration
// 等全部处理器连同它们的服务依赖一起拉进来。本路由只需要 sessionHandlers 里那一个函数；
// 走 barrel 时一旦测试先导入该 controller，CJS 循环会让 logoutHandler 在求值时刻还是
// undefined，express 注册阶段直接抛 "argument handler must be a function"。
import { logoutHandler } from "../controllers/auth/sessionHandlers";

const router = Router();

router.post("/", logoutHandler);

export default router;

