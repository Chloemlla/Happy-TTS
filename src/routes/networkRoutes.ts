// OpenAPI/Swagger specs for these endpoints live in
// `src/routes/openapi/networkRoutes.tools.openapi.ts` and
// `src/routes/openapi/networkRoutes.utils.openapi.ts` (same swagger-jsdoc glob, `src/routes/**/*.ts`).
import axios from "axios";
import express from "express";
import { NetworkController } from "../controllers/networkController";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { getClientIP } from "../utils/ipUtils";

const router = express.Router();
const networkApiKeyAuth = apiKeyAuth("network");

// codeql[js/missing-rate-limiting] rate-limited at mount: networkLimiter on /api/network (routeLimiterModules network-limiter); no in-router duplicate
router.use(networkApiKeyAuth);

router.get("/tcping", NetworkController.tcpPing);
router.get("/ping", NetworkController.ping);
router.get("/speed", NetworkController.speedTest);
router.get("/portscan", NetworkController.portScan);
router.get("/ipquery", NetworkController.ipQuery);
router.get("/yiyan", NetworkController.randomQuote);
router.get("/douyinhot", NetworkController.douyinHot);
router.get("/hash", NetworkController.hashEncrypt);
router.get("/base64", NetworkController.base64Operation);
router.get("/bmi", NetworkController.bmiCalculate);
router.get("/flactomp3", NetworkController.flacToMp3);
router.get("/jiakao", NetworkController.randomJiakao);

// 新增：获取公网IP的代理接口
// G3-31: 加 3s 超时 + 一次退避重试 + 字段白名单，上游失败时降级返回请求方 IP 而不是 500
router.get("/get-ip", async (req, res) => {
  try {
    let response: { data: Record<string, unknown> };
    try {
      response = await axios.get("https://ip.useragentinfo.com/json", { timeout: 3000 });
    } catch {
      // 一次退避重试
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await axios.get("https://ip.useragentinfo.com/json", { timeout: 3000 });
    }
    const data = response.data || {};
    res.json({
      ip: typeof data.ip === "string" ? data.ip : getClientIP(req),
      country: typeof data.country === "string" ? data.country : "",
      province: typeof data.province === "string" ? data.province : "",
      city: typeof data.city === "string" ? data.city : "",
    });
  } catch (_error) {
    // 降级：返回服务端视角的客户端 IP
    res.json({ ip: getClientIP(req), country: "", province: "", city: "" });
  }
});

export default router;
