# 邮件系统重构蓝图

## 目标

本次重构不追求一步删除 `outEmail`，而是先统一发信内核，再保留并收敛不同业务场景的策略层。

最终目标：

1. `EmailService` 成为唯一的发信传输层。
2. `emailSender` 成为站内通知/账号邮件的轻量业务封装层。
3. `outEmailService` 演进为公开外发邮件的策略层，不再直接调用 Resend SDK。
4. 清理重复入口，消除多套发信实现并存的问题。

## 最终职责划分

### 1. `EmailService`

定位：唯一发信传输层。

负责：

- 维护域名到 API Key 的映射
- 选择发信 provider / Resend 实例
- 单封发送
- 批量发送
- Markdown 转 HTML
- 附件标准化
- 统一错误返回结构
- 统一发件人域名校验能力
- 提供可复用的 sender 组装能力

不负责：

- 公开接口验证码校验
- 分钟/每日业务配额
- 管理员权限校验
- 对外发送记录持久化
- 账号通知模板流程控制

建议保留/新增能力：

- `sendEmail`
- `sendBatchEmail`
- `sendMarkdownEmail`
- `isValidSenderDomain`
- `getAllSenderDomains`
- `buildSenderAddress`
- `normalizeAttachments`

### 2. `emailSender`

定位：站内通知邮件业务封装层。

负责：

- 注册验证邮件
- 密码重置邮件
- 欢迎邮件
- 异地登录提醒
- 安全通知邮件
- 账号类邮件的轻量配额检查
- 统一业务日志标签

不负责：

- Resend 直连
- 公开发信验证码校验
- 公开发信分钟/日配额
- 自定义发件人显示名/域名策略

建议演进方向：

- 继续调用 `EmailService`
- 统一“账号通知配额”语义
- 如果后续需要，再把模板构造也收敛进来

### 3. `outEmailService`

定位：公开外发邮件策略层。

负责：

- `OUTEMAIL_CODE` / MongoDB 校验码校验
- 公开外发分钟级限额
- 公开外发每日限额
- 公开外发发送记录持久化
- 公开外发 sender 规则
- 公开外发批量发送规则
- 公开外发附件规则
- 公开接口的统一风控返回

不负责：

- 直接 new `Resend(...)`
- 直接选择 API Key
- 直接调用 `resend.emails.send`
- 直接调用 `resend.batch.send`

最终调用方式：

- `outEmailService` 负责校验与治理
- `EmailService` 负责真正发送

## 当前问题清单

### A. 重复的传输实现

当前 `emailService.ts` 和 `outEmailService.ts` 都在维护：

- 域名/API Key 映射
- Resend 实例选择
- 单发/批发逻辑

这会导致：

- 维护重复
- 配置行为漂移
- 修复 bug 时需要改两处

### B. 控制器层能力落后于服务层

`EmailService` 已有多域名支持，但 `EmailController` 仍把发件域名写死为 `chloemlla.com`。

影响：

- 服务层能力无法真正暴露
- 前端管理员发信与多域名配置脱节

### C. 公开发信入口重复

当前存在两套公开入口：

- `/api/email/outemail`
- `/api/outemail/send`

问题：

- 语义重复
- 文档和前端迁移成本增加
- 后续改造时容易漏改

### D. 三套鉴权/校验码模型并存

当前存在：

1. 管理员 JWT
2. `OUTEMAIL_CODE`（MongoDB）
3. `EMAIL_CODE`（环境变量）

其中第 3 套最弱，且与第 2 套职责重叠。

### E. 配额语义不统一

当前至少有三种语义：

- `emailSender` 按收件邮箱计数
- `EmailController` 管理员邮件按用户计数
- `outEmailService` 按全局分钟/日桶计数

这不是 bug，但需要明确边界，不能强行统一成一套。

## 推荐架构

### 传输层

- `EmailService`

### 内部通知层

- `emailSender`

### 公开外发策略层

- `outEmailService`

### 路由层保留两组 API

- 管理员/内部邮件：`/api/email/*`
- 公开外发邮件：`/api/outemail/*`

说明：

- 接口层可以继续分开
- 真正要统一的是底层发送能力
- 不是强行把所有业务接口压成一个控制器

## 迁移顺序

### 第一阶段：抽取唯一传输内核

目标：不改 API 契约，只消除双份 Resend 实现。

步骤：

1. 在 `EmailService` 中补齐 `outEmailService` 需要的底层能力
2. 把 sender 组装、附件标准化抽成 `EmailService` 公共方法
3. 让 `outEmailService` 不再自己维护 `domainApiKeyMap`
4. 让 `outEmailService` 改为调用 `EmailService.sendEmail` / `EmailService.sendBatch...`

产出：

- 发信 SDK 调用只剩一处
- 风险最低
- 前后端 API 无变化

### 第二阶段：统一 sender 规则

目标：让内部管理员邮件和公开外发邮件都走一致的 sender 校验模型。

步骤：

1. 去掉 `EmailController` 对 `chloemlla.com` 的硬编码
2. 改为使用 `EmailService.isValidSenderDomain`
3. 如果需要前缀 + 显示名能力，新增统一 sender builder
4. 前端 `EmailSender` 与 `OutEmail` 都使用同一套域名来源

产出：

- 多域名能力真正生效
- 管理员邮件不再卡死在单域名

### 第三阶段：清理重复入口

目标：路由收口，避免维护两套公开外发入口。

步骤：

1. 标记 `/api/email/outemail` 为废弃
2. 前端与文档完全切到 `/api/outemail/*`
3. 删除 `emailRoutes.ts` 中的旧公开外发入口
4. 保留 `/api/email/outemail-status` 仅在确有兼容需求时继续过渡，否则一并迁走

产出：

- 对外邮件只保留一组入口
- 路由语义更清晰

### 第四阶段：清理弱鉴权模型

目标：消除重复的 code 模型。

步骤：

1. 审查 `/api/email/send-with-code` 的真实调用方
2. 若无实际依赖，删除 `EMAIL_CODE`
3. 若仍有依赖，迁移到更强的鉴权方式

产出：

- 去掉第三套弱校验模型
- 降低误用风险

### 第五阶段：按需统一审计模型

目标：仅在确有需要时统一持久化审计。

步骤：

1. 评估账号通知类邮件是否需要落库
2. 若需要，抽象统一 `mail_audit_logs`
3. 若不需要，继续维持“公开外发落库、内部通知仅日志”

产出：

- 审计模型更清晰
- 不做无意义的“形式统一”

## 删改文件清单

### 第一阶段必改

- `src/services/emailService.ts`
  - 吸收 sender 构造和附件标准化能力
  - 提供可复用批量发送内核

- `src/services/outEmailService.ts`
  - 删除 Resend 直连逻辑
  - 保留验证码、配额、审计、业务规则
  - 改为调用 `EmailService`

### 第二阶段必改

- `src/controllers/emailController.ts`
  - 去掉 `chloemlla.com` 硬编码
  - 改为统一域名校验

- `frontend/src/components/EmailSender.tsx`
  - 对齐多域名 sender 逻辑
  - 不再假设单一域名

### 第三阶段必改

- `src/routes/emailRoutes.ts`
  - 删除 `/outemail` 旧入口
  - 删除或迁移 `/outemail-status` 兼容逻辑

- `src/routes/outemailRoutes.ts`
  - 成为唯一公开外发入口

- `frontend/src/components/OutEmail.tsx`
  - 确认只调用 `/api/outemail/*`

### 第四阶段候选删除

- `src/controllers/emailController.ts`
  - 删除 `sendEmailWithCode`

- `src/config.ts`
  - 删除 `EMAIL_CODE` 暴露

- 相关调用方
  - 所有 `/api/email/send-with-code` 的使用点

### 需要审查但不一定马上改

- `src/controllers/authController.ts`
- `src/controllers/totpController.ts`
- `src/controllers/adminController.ts`
- `src/routes/passkeyRoutes.ts`
- `src/utils/userRepository.ts`
- `src/services/verificationService.ts`

这些文件大多依赖 `emailSender` 或 `EmailService`，原则上不应直接接触公开外发逻辑。

## 删除清单

在完成迁移后，可考虑删除：

- `src/routes/emailRoutes.ts` 中的 `/outemail` 旧入口
- `src/routes/emailRoutes.ts` 中的 `/outemail-status` 兼容入口
- `src/controllers/emailController.ts` 中的 `sendEmailWithCode`
- `src/config.ts` 中与 `EMAIL_CODE` 相关的兼容配置
- `outEmailService.ts` 中重复的 Resend 实例选择逻辑

注意：

- `outEmailService.ts` 文件本身不建议立即删除
- 应先把它降级为纯策略层，再评估是否继续保留命名

## 不建议做的事

1. 不建议一步把 `outEmailService` 全删掉。
2. 不建议让所有邮件都共用同一套 quota。
3. 不建议把公开发信和内部通知强塞进一个控制器。
4. 不建议在接口层先合并，应该先统一传输层。
5. 不建议保留三套 code 鉴权长期共存。

## 推荐实施顺序

优先级从高到低：

1. 统一发信传输层
2. 修复 `EmailController` 单域名硬编码
3. 清理 `/api/email/outemail` 重复入口
4. 清理 `send-with-code`
5. 视需要再统一审计落库

## 预期收益

- 发送逻辑只维护一套
- 公开外发风控能力保留
- 多域名能力真正可用
- 前后端边界更清晰
- 后续切换 provider 成本更低
- 降低重复 bug 和配置漂移风险

## 最终结论

最佳方案不是“删掉 `outEmail` 直接全走 `EmailService`”，而是：

- `EmailService` 统一底层发信
- `emailSender` 负责内部通知
- `outEmailService` 负责公开外发治理

也就是：

**传输统一，策略分层，接口收口，逐步删旧。**
