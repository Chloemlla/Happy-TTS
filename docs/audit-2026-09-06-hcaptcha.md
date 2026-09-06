# 缺陷汇总：/api/turnstile/hcaptcha-verify 必败（2026-09-06）

取证来源：生产 tts-node 容器日志（raksmart，2026-09-06 12:53:50 / 12:58:56 两次浏览器尝试，traceId `mtpc6wzz-…` / `mtpcdgw0-…`）+ 用户提供的 curl 复现（token 实测 2578 字符）+ 本地量化模拟。

## H1 hCaptcha token 超长被截断 → siteverify 判 malformed → 验证必败

- 位置：`src/services/turnstile/validators.ts:40`（`validateToken` 内 `sanitizeString(token, 2000)`）
- 类型：输入校验缺陷——对不透明外部凭据做破坏性"清洗"（截断 + 模式剥离）
- 详细错误信息：
  - 症状：`POST /api/turnstile/hcaptcha-verify` 始终返回 `{"success":false,"details":{"error_codes":["verification-failed"]}}`，重试无解；浏览器正常通过 hCaptcha 人机挑战后仍必败
  - 生产日志：hCaptcha siteverify 返回 `errorCodes: ['invalid-input-response']`（= response 参数 invalid or malformed），`remoteIp: '203.10.99.35'` 正常传递，排除密钥/限流/IP 封禁路径
  - 根因：hCaptcha 现行签发的 `P1_` 形态 token 实测 **2578 字符**；`validateToken` 经 `sanitizeString(token, 2000)` 把 token `substring(0,2000)` 截断，残缺 token 送 siteverify 必判 malformed。凡 >2000 字符的 token 100% 失败，且当前 hCaptcha 签发的 token 普遍超限 ⇒ 全站 hcaptcha-verify 功能性瘫痪
  - 顺带语义错误：`DANGEROUS_PATTERNS`（`[<>{}]`、`data:`、`on\w+=` 等）对 token 做模式剥离会损坏含这些字符的合法 token——captcha token 是必须原样透传的不透明凭据，不是用户自由文本输入
  - 复现条件：任意长度 >2000 的 token；<2000 字符且不含被剥离字符的 token 不受影响（隐藏性极强）
- 建议改法：`validateToken` 改为 trim + 长度界 `[10, 4096]` 检查，原样返回，不做模式剥离与截断。上限 4096 防滥用（express body 100KB 是真兜底），同时覆盖 Turnstile（历史文档 ~2048）与 hCaptcha（实测 2578）——Turnstile 路径存在同款截断隐患
- 影响面：`verifyHCaptchaToken`（hcaptcha.ts）、`verifyToken` / `verifyTokenDetailed` / `verifyTempFingerprint`（verify.ts）、`verifyAccessToken`（accessToken.ts）五个调用方全部为 captcha token 或自家签发 access token，语义均应原样校验；无任何调用方依赖剥离行为（token 只进 URLSearchParams body 与前 8 字符日志预览，无渲染/存储依赖）
- 测试影响：`turnstileMissingSecret.test.ts` 用 17 字符 token，不受影响；无 turnstile validators 直接测试
- 去向：已修（本批次唯一缺陷，commit 见 git log）
