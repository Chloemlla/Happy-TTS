# 安全最佳实践

## 二次校验（TOTP/Passkey）强制策略

- **所有环境（包括开发环境）下，只要用户开启了 TOTP 或 Passkey，登录时都必须进行二次校验。**
- 不再因本地 IP、内网 IP、白名单 IP 等跳过二次校验，防止被绕过。
- 二次校验接口（如 `/api/totp/status`、`/api/passkey/credentials`）禁止缓存，服务端强制返回最新状态，防止 304 响应导致安全绕过。
- 前端每次都强制刷新二次校验状态，确保安全。

## 本地 IP 自动登录限制

- 仅生产环境下允许本地 IP 自动获取管理员信息，开发环境（`NODE_ENV=development`）下该功能失效，防止开发调试时被本地 IP 绕过权限。
- 相关代码已在 `src/app.ts` 和 `src/controllers/authController.ts` 中实现。

## API 安全与缓存控制

- 敏感接口（如二次校验状态、用户凭证等）禁止设置 ETag/Last-Modified，始终返回 200 和最新数据，防止前端用本地缓存绕过安全校验。
- 服务端通过如下中间件实现：

```js
app.use(["/api/totp/status", "/api/passkey/credentials"], (req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.removeHeader && res.removeHeader("ETag");
  next();
});
```

## 其它安全建议

- 严格校验所有用户输入，防止类型错误和注入攻击。
- 生产环境与开发环境安全策略保持一致，避免因调试便利导致安全隐患。
- 所有二次认证相关逻辑均有详细日志，便于安全审计和问题追踪。
