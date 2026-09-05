import type { RouteModule } from "./index";
import qqGuardRoutes from "./qqGuardRoutes.js";

/**
 * QQ 群纪律审查控制通道（bot ↔ Synapse，机器对机器）。
 * 机器人携带 x-qqg-* HMAC 签名直连；鉴权在 qqGuardRoutes 的 qqGuardAuth 中间件内完成
 * （验签 + 时间窗 + nonce 一次性消费），不经过用户 JWT 体系，因此声明为 public。
 */
export const qqGuardRouteModules: RouteModule[] = [
  {
    name: "qq-guard-routes",
    path: "/api/qq-guard",
    router: qqGuardRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["qqGuardLimiter"],
      note: "控制通道每个端点都挂在 qqGuardLimiter 上；/moderate 的内容审查、/audit 回推、/commands 轮询共享同一限流分组。",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "审查内容是被 AI 判定的用户原话，含分号/括号/尖括号等字符，仅作为模型输入转发，绝不在本地求值。",
      },
      ipVerification: {
        value: true,
        reason: "控制通道来自湖北服务器上的机器人进程（服务端调用），没有浏览器 IP 验证上下文；身份由 HMAC 共享密钥保证。",
      },
    },
  },
];
