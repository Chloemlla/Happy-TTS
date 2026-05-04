推荐结构

- passwordHash
  - 登录专用
  - 只用 bcrypt.hash / bcrypt.compare
- passwordCiphertext
  - 管理员查看专用
  - 数据库存密文，不存明文
- 配套字段
  - passwordIv / nonce
  - passwordTag（如果用 AES-256-GCM）
  - passwordKeyVersion
  - passwordWrappedDek 或 passwordDekId

管理员接口怎么解密

1. 管理员调用 POST /admin/users/:id/reveal-password
2. 后端二次鉴权
   - 要求管理员 JWT
   - 再验一次密码或 MFA
3. 权限校验 + 限流 + 审计
4. 后端查出该用户的密文字段
5. 后端用密钥管理系统解密
   - 先拿到该条记录对应的 DEK
   - 再用 DEK 解密 passwordCiphertext
6. 只把明文密码通过 TLS 返回给前端展示
7. 不写日志，不缓存，不落盘
8. 写审计日志：谁、何时、查了谁、原因

密钥可不可以不唯一
可以，甚至应该不唯一。

最稳的是“信封加密”：

- KEK：主密钥
  - 放 KMS / HSM / 环境密钥服务里
- DEK：数据密钥
  - 每个用户一把，或者每次改密码一把
- 存储方式
  - 用 DEK 加密密码得到 passwordCiphertext
  - 用 KEK 再加密 DEK，得到 passwordWrappedDek
  - 数据库里存密文和包裹后的 DEK

这样即使一条记录泄露，也不会连带所有用户。

你可以选两种实现

- 更安全：每条记录随机 DEK
- 更简单：从主密钥派生子密钥
  - 例如 HKDF(masterKey, userId + keyVersion)
  - 这样“每个用户密钥不同”，但不用存 wrappedDek

如果你问“动态解密密钥不唯一”：

- 推荐“每用户/每次密码变更一把 key”
- 不推荐全站一个固定 key 直接加所有密码

接口层建议

- 前端永远拿不到解密密钥
- 只有后端解密
- 展示时默认遮罩，点一次才 reveal
- 最好要求填写查看原因
- 最好 30 秒后自动隐藏

不要这样做

- 不要只存可解密密文，不存 bcrypt
- 不要把密钥写死在代码里
- 不要在管理员列表接口默认返回可解密密码
- 不要把解密后的密码写进日志、监控、异常栈

一句话方案

- 认证走 bcrypt
- 展示走 AES-GCM/XChaCha20-Poly1305
- 密钥走 KEK + DEK
- 解密只在管理员后端接口按需发生

- 统一认证密码链路为 bcrypt，覆盖注册、登录、重置密码、旧用户迁移。
- 数据库存储分为两部分：
  - passwordHash：认证专用，一律不可逆。
  - passwordCiphertext：展示专用，使用服务端密钥做对称加密后存库，管理员接口可解密查看。
- 旧明文密码迁移策略：
  - 首次登录成功时，如果发现还是旧明文字段，就立即写入 passwordHash 和 passwordCiphertext，然后删除旧明文字段。
  - 或提供一次性离线迁移脚本完成同样处理。
- 默认查询不返回 passwordHash / passwordCiphertext。
- 仅管理员专用接口可显式读取并解密 passwordCiphertext，且必须记录审计日志。
- 登录比对全部走 bcrypt.compare，禁止用可解密密文参与登录校验。
- 验收标准：
  - 新老存储模式都不再保存明文密码。
  - 登录全部走 bcrypt.compare。
  - 管理员接口可查看解密后的密码。
  - 旧用户可平滑迁移。

需要强调：这比“只存 bcrypt”风险高很多。更安全的做法是“管理员只能重置密码，不能查看原密码”。如果你还是要按“可查看原密码”的方案落地，
我可以直接按这个双字段方案改代码。
