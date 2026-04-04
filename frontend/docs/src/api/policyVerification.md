# 隐私同意本地存储说明

## 当前实现

文档站已移除对 `/api/policy/*` 的强制依赖，隐私同意状态现在只保存在浏览器本地：

- 存储键：`hapxtts_policy_consent`
- 展示状态键：`hapxtts_support_modal_shown`
- 校验方式：本地时间戳、版本号、指纹和校验和

这意味着：

1. 文档站不会再向后端提交或查询隐私同意记录。
2. 用户状态完全由当前浏览器本地存储决定。
3. 清空浏览器本地存储后，本地记录会一并消失。

## 数据结构

```json
{
  "timestamp": 1696636800000,
  "version": "2.0",
  "fingerprint": "abc12345",
  "checksum": "def67890"
}
```

## 前端行为

`policyVerification.ts` 现在只负责：

- 生成本地指纹
- 生成和校验本地 checksum
- 读写 `localStorage`
- 提供兼容旧调用的方法名

## 不再使用

以下后端接口不再是文档站隐私同意流程的一部分：

- `POST /api/policy/verify`
- `GET /api/policy/check`
- `POST /api/policy/revoke`
- `GET /api/policy/version`

如果后续需要重新启用服务端审计，应重新设计并明确接入点，而不是依赖当前这套本地实现。
