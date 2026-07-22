# 前端设计问题审查（2026-07-22）

## 文档状态

- 审查对象：Synapse 当前前端体验。
- 审查基线：`main` 分支提交 `e946bc9b`。
- 审查方式：前端源码、路由、样式和组件静态审查。
- 运行限制：遵循仓库约定，未在本地执行构建、测试、安装或开发服务命令。
- 视觉限制：审查时没有可连接的运行页面，因此未进行截图和像素级实机验证。
- 并行工作说明：工作区中的 `07-22-desktop-sidebar-navigation-redesign` 及相关未提交 UI 文件不属于本报告修改，也不纳入审查基线。

## 1. 结论摘要

当前前端的主要问题不是单个组件“不够好看”，而是产品主线、用户信任和视觉系统同时失焦：

1. 核心 TTS、杂项工具、娱乐演示、管理功能和安全调试信息被放进同一个产品壳层，缺少明确的产品层级。
2. 首次访问验证、指纹请求和页脚 IP 信息把“安全”表达成了强烈的监控感。
3. 匿名状态几乎没有公共导航，登录后导航又一次暴露过多入口。
4. TTS 主流程过长，且向普通用户展示存储方式、MIME、Mongo ID 等内部实现细节。
5. 主题、圆角、阴影、字号、弹窗和动效缺少统一设计系统，页面之间像多个独立小产品。
6. 移动端、键盘操作、焦点管理、标签关联和状态播报存在明确可访问性缺口。

一句话概括：当前界面更像“个人工具箱 + 管理后台 + 风控调试台”的集合，而不是围绕语音合成任务组织的统一产品。

## 2. 优先级总览

| 编号 | 优先级 | 问题 | 主要影响 |
| --- | --- | --- | --- |
| FE-DESIGN-001 | P0 | 首次访问验证暴露 IP、指纹和 Token Policy | 首屏信任、移动端可用性 |
| FE-DESIGN-002 | P0 | 首访验证页在小屏不可滚动 | 可能无法完成验证并进入站点 |
| FE-DESIGN-003 | P1 | `/`、`/welcome`、`/login` 入口语义冲突 | 登录路径冗余、首页心智混乱 |
| FE-DESIGN-004 | P1 | 匿名无导航、登录后 mega-menu 过载 | 功能不可发现或认知负担过高 |
| FE-DESIGN-005 | P1 | TTS 主流程过长且生成码缺少获取说明 | 首次成功率、核心转化 |
| FE-DESIGN-006 | P1 | TTS 输出泄漏内部实现术语 | 信息层级、产品专业感 |
| FE-DESIGN-007 | P1 | 主题 Token 和共享 UI primitive 缺失 | 全站一致性、维护成本 |
| FE-DESIGN-008 | P1 | 字号、对比度、标签和焦点管理存在缺口 | 可读性、键盘和读屏体验 |
| FE-DESIGN-009 | P2 | 卡片嵌套和动效成为默认装饰 | 页面层级、操作效率 |
| FE-DESIGN-010 | P2 | 全局弹窗、通知和安全遮罩竞争注意力 | 打断任务、弹窗疲劳 |
| FE-DESIGN-011 | P2 | 页脚展示运行时间和访客网络画像 | 隐私感知、页面噪声 |
| FE-DESIGN-012 | P2 | 深色模式和反馈组件处于不完整状态 | 功能可信度、视觉一致性 |

## 3. 详细问题

### FE-DESIGN-001：首屏安全感表达反向

首次访问或风控命中时，应用会直接返回全屏验证页面，而不是先呈现品牌、产品用途和简短安全说明。

源码证据：

- `frontend/src/App.tsx:551` 默认启用首次访问验证。
- `frontend/src/App.tsx:606` 计算首访阻断条件。
- `frontend/src/App.tsx:1278` 命中后直接只渲染 `FirstVisitVerification`。
- `frontend/src/components/FirstVisitVerification.tsx:268` 使用 `Traffic Review`、`Checking your browser` 等英文风控文案。
- `frontend/src/components/FirstVisitVerification.tsx:395` 展示 Session Context。
- `frontend/src/components/FirstVisitVerification.tsx:401` 展示浏览器指纹。
- `frontend/src/components/FirstVisitVerification.tsx:406` 展示 IP 地址。
- `frontend/src/components/FirstVisitVerification.tsx:411` 展示 Token Policy。
- `frontend/src/components/FirstVisitVerification.tsx:423` 直接告诉用户网络被后端 fraud scoring 标记为风险。

用户影响：

- 第一次认识产品时先收到“网络异常、风险评分、指纹绑定”的信息，容易产生被怀疑或被监控感。
- 页面语言与中文主站断裂。
- Token Header、指纹和风控策略属于实现细节，不应成为普通用户首屏内容。

建议方向：

- 首屏只保留“正在进行安全验证，通常需要数秒”和验证控件。
- 隐藏指纹、IP、Token Header、fraud scoring 等技术信息。
- 技术诊断移入管理员日志或可展开的故障详情。
- 统一为中文用户文案，并避免使用带指责感的风险描述。

### FE-DESIGN-002：首访验证页存在移动端阻断风险

正常验证分支的根节点使用固定全屏和 `overflow-hidden`，内部长内容没有滚动容器；两栏在移动端改为纵向堆叠后，内容高度明显超过常见手机视口。

源码证据：

- `frontend/src/components/FirstVisitVerification.tsx:243`：`fixed inset-0 overflow-hidden`。
- `frontend/src/components/FirstVisitVerification.tsx:254`：只有 `min-h-screen`，没有 `overflow-y-auto` 或安全最大高度。
- `frontend/src/components/FirstVisitVerification.tsx:261`：移动端两栏纵向排列。
- `frontend/src/components/FirstVisitVerification.tsx:364`：继续和重载按钮位于长内容中部。
- `frontend/src/components/FirstVisitVerification.tsx:395`：后续仍有完整 Session Context 侧栏内容。

用户影响：

- 短屏、横屏或较小手机上，验证码、继续按钮或右侧信息可能被裁掉。
- 页面无法滚动时，用户可能无法完成首访验证。
- 多层横向 padding 进一步压缩第三方验证码的可用宽度。

建议方向：

- 外层改为可纵向滚动，并加入安全区内边距。
- 移动端隐藏 Session Context 技术栏。
- 验证码容器采用响应式宽度，避免固定 300px 控件被裁切。

### FE-DESIGN-003：首页、欢迎页和登录页语义冲突

当前存在三个相互竞争的入口：

- `/` 实际渲染 TTS 页面。
- `/welcome` 承担账号欢迎和账号切换入口。
- `/login` 才是真正登录表单。

源码证据：

- `frontend/src/App.tsx:653` 将 `/` 的标题定义为“首页”。
- `frontend/src/App.tsx:1403` 匿名头部“立即登录”先跳转 `/welcome`。
- `frontend/src/App.tsx:1431` 注册 `/welcome`。
- `frontend/src/App.tsx:1432` 注册 `/login`。
- `frontend/src/App.tsx:1441` `/` 实际渲染 `TtsPage`。
- `frontend/src/components/WelcomePage.tsx:316` Welcome 页面再次提供登录和注册按钮。
- `frontend/src/components/WelcomePage.tsx:242` 已登录用户仍会看到账号恢复状态，但没有明确的“进入工作台”主按钮。

用户影响：

- 点击“立即登录”需要多经过一层页面。
- “首页”究竟是欢迎页、登录入口还是 TTS 工作台不明确。
- 已登录用户访问 Welcome 页面时，主要动作仍然是登录其他账号或注册。

建议方向：

- 确定唯一 canonical 入口。
- 若 `/` 是公开 TTS 工作台，“立即登录”应直接进入 `/login`。
- 若 `/` 是产品欢迎页，则工作台应使用明确的 `/tts` 路由。
- Welcome 页面根据登录状态提供“继续进入工作台”主操作。

### FE-DESIGN-004：导航在“不可发现”和“过载”之间摆动

未登录时 `MobileNav` 不渲染，头部仅剩登录按钮；登录后，头像菜单把核心功能、工具、娱乐、查询、测试和管理入口全部平铺。

源码证据：

- `frontend/src/components/MobileNav.tsx:204` 定义桌面高频入口。
- `frontend/src/components/MobileNav.tsx:216` 开始定义完整分组菜单。
- `frontend/src/components/MobileNav.tsx:253` 将游戏与 LibreChat 放入“娱乐与探索”。
- `frontend/src/components/MobileNav.tsx:263` 将 FBI、安踏防伪、校园紧急和 API 文档放入同一组。
- `frontend/src/components/MobileNav.tsx:273` 管理员额外获得测试与演示组。
- `frontend/src/components/MobileNav.tsx:287` 再增加完整管理功能组。
- `frontend/src/components/MobileNav.tsx:414` 未登录时直接返回 `null`。

用户影响：

- 匿名用户无法发现商店、API 文档、政策、文章和可公开工具。
- 登录后普通用户需要扫描约二十多个入口，管理员更多。
- TTS、资源商店、小游戏、外部查询和安全测试获得相似视觉权重。
- 桌面只显示少量入口，其余功能全部隐藏在账号菜单中，账号操作和产品导航职责混合。

建议方向：

- 将产品主导航、账号菜单和管理员导航拆开。
- 一级导航只保留核心工作流。
- 杂项工具进入“更多工具”或独立工具中心。
- 测试、演示和安全诊断仅在管理员开发入口中出现。
- 匿名用户保留精简公共导航和页脚链接。

### FE-DESIGN-005：TTS 核心流程缺少基础/高级分层

当前表单把所有选项一次性展示：文本、模型、六个音色、格式、语速、生成码、人机验证，最后才到提交按钮。

源码证据：

- `frontend/src/components/TtsPage.tsx:235` 首屏先展示大型 Hero。
- `frontend/src/components/TtsPage.tsx:260` Hero 右侧放置长篇使用限制和联系方式。
- `frontend/src/components/TtsPage.tsx:292` 真正表单在 Hero 后才开始。
- `frontend/src/components/TTSForm.tsx:271` 开始语音设置大区块。
- `frontend/src/components/TTSForm.tsx:299` 展示模型卡片。
- `frontend/src/components/TTSForm.tsx:351` 展示六个音色卡片，但没有试听入口。
- `frontend/src/components/TTSForm.tsx:387` 继续展示格式和语速。
- `frontend/src/components/TTSForm.tsx:457` 必填生成码。
- `frontend/src/components/TTSForm.tsx:475` 仅说明生成码用于验证身份，没有获取方式。
- `frontend/src/components/TTSForm.tsx:487` 可能继续要求人机验证。
- `frontend/src/components/TTSForm.tsx:563` 最后才呈现生成按钮。

用户影响：

- 用户需要理解大量设置后才能完成第一次生成。
- 音色只能靠英文名称和性别式描述猜测，无法先听再选。
- 登录、生成码和 CAPTCHA 多重门槛缺少原因与获取路径说明。
- 移动端所有设置纵向堆叠，核心按钮离首屏更远。

建议方向：

- 默认只展示文本、音色和生成按钮。
- 模型、格式、语速进入“高级设置”。
- 音色选择提供短试听。
- 生成码必须提供获取、申请或管理入口；若登录身份已足够，应重新评估是否仍需额外生成码。
- 使用限制移动到折叠说明或政策页面。

### FE-DESIGN-006：TTS 输出区暴露实现细节并重复控制

结果和历史记录把存储介质、MIME、文件 ID、provider 和人工审核状态放在普通用户主层级。

源码证据：

- `frontend/src/components/TtsPage.tsx:344` 结果文本卡片。
- `frontend/src/components/TtsPage.tsx:350` 展示 MongoDB 音频或文件缓存。
- `frontend/src/components/TtsPage.tsx:353` 展示 MIME。
- `frontend/src/components/TtsPage.tsx:359` 展示 Mongo ID。
- `frontend/src/components/TtsPage.tsx:367` 使用原生 `<audio controls>`。
- `frontend/src/components/TtsPage.tsx:381` 再提供一套自定义播放和下载按钮。
- `frontend/src/components/TtsPage.tsx:409` 在同一页面继续渲染完整历史区域。
- `frontend/src/components/TtsPage.tsx:489` 每条历史再次展示 provider、存储方式、MIME 和文件 ID。

用户影响：

- 播放、下载和文本内容被运维元数据稀释。
- 原生播放器和自定义播放按钮形成重复控制，并可能出现状态不同步。
- 生成页面同时承载编辑、结果和最多二十条复杂历史卡片，页面过长。

建议方向：

- 普通用户只看到文本、时长、音色、生成时间、播放和下载。
- 技术元数据放入管理员详情或调试面板。
- 只保留一套音频控制。
- 历史记录改为独立页面、抽屉或可折叠区域。

### FE-DESIGN-007：设计 Token 与共享组件体系不成立

仓库已有目标规范要求主题 Token、语义圆角和共享 primitive，但当前实现仍以 raw hex、固定 Tailwind 色板和任意值样式为主。

静态扫描摘要（审查基线）：

- 约 1,500 处 raw hex。
- 约 7,800 处固定 Tailwind 色板类。
- 47 种圆角写法。
- 66 种阴影写法。
- `index.css` 中约 125 个 `!important`。
- 153 个 TSX 组件中，只有少数组件使用 `studioTheme` 或 `authStudioTheme`。

源码证据：

- `frontend/src/index.css:14` 直接写深色背景和文字 hex。
- `frontend/src/index.css:220` 管理后台通过 `[class*="bg-"]`、`[class*="rounded"]` 等选择器强行覆盖子组件。
- `frontend/src/index.css:224` 大量容器被统一改成 26px 圆角和固定阴影。
- `frontend/src/components/studioTheme.ts:12` 所谓主题仍是固定 `slate`、`white`、rgba 和任意圆角字符串。
- `frontend/src/components/studioTheme.ts:59` 小尺寸图标块仍使用大圆角。
- `.trellis/spec/frontend/component-guidelines.md` 已要求主题 Token、语义圆角和 `:root + @theme inline`。

用户影响：

- 页面切换时品牌色、圆角、阴影、字体和控件反馈不一致。
- 修改一个全局覆盖选择器可能意外改变多个页面。
- 无法集中调整品牌、对比度或未来主题。

建议方向：

- 建立真实的颜色、圆角、阴影、字号和层级 Token。
- 先统一 Button、Input、Textarea、Select、Dialog、Sheet、Card、Badge、Toast。
- 逐步删除字符串选择器“洗色”和任意 `!important`。
- 将演示页面视觉隔离，避免其自定义色板污染主产品。

### FE-DESIGN-008：可读性和可访问性缺口

源码中存在大量 8–10px 标签、低对比度灰字、未关联标签以及手写模态框焦点问题。

源码证据：

- `frontend/src/components/MobileNav.tsx:534` 使用 8px 标签。
- `frontend/src/components/MobileNav.tsx:539` 使用 9px 数字。
- `frontend/src/components/MobileNav.tsx:596` 使用 9px、`text-slate-400` 的邮箱。
- `frontend/src/components/TTSForm.tsx:201` 文本输入标签没有 `htmlFor`。
- `frontend/src/components/TTSForm.tsx:225` 文本域没有对应 `id`。
- `frontend/src/components/TTSForm.tsx:393` 输出格式标签没有与选择控件建立关联。
- `frontend/src/components/Notification.tsx:254` 自定义通知容器没有 `aria-live` 或明确状态角色。
- `frontend/src/components/MobileNav.tsx:139` 打开菜单时只处理 Escape 和页面滚动，没有 Tab 焦点循环。
- `frontend/src/components/MobileNav.tsx:466` 菜单却声明为 `aria-modal="true"` 的 dialog。

用户影响：

- 小字号和低对比度内容难以阅读。
- 点击标签不一定聚焦对应控件。
- 读屏用户可能无法及时获知通知状态。
- 键盘焦点可以离开模态导航并进入后方页面。

建议方向：

- 正文和关键标签不低于可读字号基线。
- 所有表单控件建立 `label`、`id`、`aria-describedby` 关联。
- 使用经过验证的 Dialog、Sheet 和 Toast primitive。
- 为模态界面实现初始焦点、焦点循环、Escape 关闭和焦点恢复。

### FE-DESIGN-009：卡片和动效缺少语义节制

几乎所有内容块都使用大圆角、边框、半透明背景、阴影和模糊，导致所有内容看起来同等重要。

静态扫描摘要：

- 107 个文件引入 Framer Motion。
- 超过一千个 motion 元素。
- 只有少部分文件显式处理 reduced motion。

源码证据：

- `frontend/src/components/TtsPage.tsx:298` 34px 外层玻璃卡中再嵌 22px 内卡。
- `frontend/src/components/TTSForm.tsx:190` 表单开始串联入场动画。
- `frontend/src/components/TTSForm.tsx:527` 动画延迟累计到 1.3 秒。
- `frontend/src/components/TTSForm.tsx:585` 加载状态继续使用无限旋转。
- `frontend/src/App.tsx:159` 全站背景使用持续移动粒子。

用户影响：

- 页面层级依赖“套卡片”，主操作和辅助说明不够突出。
- 工具型页面产生不必要的等待感和躁动感。
- reduced-motion 用户得到的体验不一致。

建议方向：

- 卡片只用于真正独立的内容单元。
- 默认使用平面分区、留白和排版建立层级。
- 动效只用于路由变化、状态变化和空间关系说明。
- 为 Motion 组件建立统一 reduced-motion 策略。

### FE-DESIGN-010：全局交互层竞争用户注意力

正常应用壳层同时挂载公告、广播、命令面板、Toast、TOTP、指纹请求、水印和其他全局安全交互。

源码证据：

- `frontend/src/App.tsx:1312` 挂载多个全局 Provider 和交互组件。
- `frontend/src/App.tsx:1317` 挂载 React Toastify。
- `frontend/src/App.tsx:1319` 挂载公告弹窗。
- `frontend/src/App.tsx:1494` 挂载 TOTP 模态框。
- `frontend/src/App.tsx:1544` 挂载水印覆盖层。
- `frontend/src/App.tsx:1558` 挂载指纹请求弹窗。

用户影响：

- 多种弹层可能在登录、首访或任务过程中连续出现。
- 通知、公告、安全请求和业务操作缺少统一优先级。
- 不同组件使用不同视觉语言和关闭规则。

建议方向：

- 建立全局交互优先级和互斥规则。
- 安全阻断、业务确认、公告和轻量通知使用不同层级。
- 同一时间只允许一个高优先级模态交互。

### FE-DESIGN-011：页脚内容与产品目标不匹配

全局页脚在所有正常路由持续展示免责声明、逐秒运行时间和访客网络信息，却没有承担常规页脚导航职责。

源码证据：

- `frontend/src/components/Footer.tsx:20` 每秒更新运行时间。
- `frontend/src/components/Footer.tsx:47` 请求访客 IP 信息。
- `frontend/src/components/Footer.tsx:95` 开始渲染页脚。
- `frontend/src/components/Footer.tsx:99` 展示非官方声明。
- `frontend/src/components/Footer.tsx:102` 展示逐秒运行时间。
- `frontend/src/components/Footer.tsx:108` 展示 IP、地区、城市和 ISP。
- `frontend/src/App.tsx:1490` 在所有正常路由全局渲染 Footer。

用户影响：

- 登录页、注册页和工作台都被网络画像信息占据。
- 页脚黄、绿、蓝提示卡与当前 slate 玻璃视觉语言不一致。
- 用户找不到政策、隐私、支持、状态页、API 文档和联系入口。

建议方向：

- 移除访客 IP、城市和 ISP 展示。
- 运行状态放入独立状态页，而不是逐秒刷新。
- 页脚只保留品牌、政策、隐私、支持、API 文档和必要声明。

### FE-DESIGN-012：主题和反馈组件不完整

深色模式代码存在，但初始化和入口没有形成完整用户功能；同时仓库并存自定义 Notification 与 React Toastify。

源码证据：

- `frontend/src/components/ThemeToggle.tsx:5` 定义主题切换组件，但未被应用壳层挂载。
- `frontend/src/utils/theme.ts:42` 定义 `initTheme()`，入口未调用。
- `frontend/src/index.css:14` 深色样式主要只覆盖 body。
- `frontend/src/App.tsx:1317` 使用 React Toastify。
- `frontend/src/components/Notification.tsx:120` 同时维护另一套通知系统。

用户影响：

- 深色模式看似存在，实际不可发现且页面未完整适配。
- 不同页面可能出现两套样式和行为不同的通知。

建议方向：

- 在完整 Token 系统建立前，不对外宣称支持深色模式。
- 统一一套 Toast/Notification primitive 和状态语义。

## 4. 建议修复顺序

### 阶段 0：解除阻断与信任问题

1. 修复首访验证移动端滚动和验证码宽度。
2. 删除首访页的 IP、指纹、Token Policy 和 fraud scoring 用户文案。
3. 删除全站页脚中的访客网络画像。

### 阶段 1：重建产品信息架构

1. 确定 `/`、`/welcome`、`/login` 和 TTS 工作台的唯一入口关系。
2. 拆分产品导航、账号菜单和管理员导航。
3. 将工具、娱乐、测试和演示移出核心导航。
4. 为匿名用户提供精简公共导航和标准页脚。

### 阶段 2：缩短 TTS 首次成功路径

1. 首屏直接聚焦文本输入和音色选择。
2. 增加音色试听。
3. 折叠模型、格式和语速等高级设置。
4. 解释或取消生成码门槛。
5. 精简结果区并拆分历史记录。

### 阶段 3：建设统一设计系统

1. 建立颜色、圆角、阴影、字号、间距和 z-index Token。
2. 统一 Button、Input、Select、Dialog、Sheet、Card、Toast 等 primitive。
3. 删除全局字符串选择器洗色和无必要 `!important`。
4. 统一 reduced-motion 和焦点管理规则。

## 5. 建议验收指标

- 新用户从进入站点到看到 TTS 输入框不超过一个非业务阻断步骤。
- 首访验证在 320px 宽度和横屏短视口可滚动并能完成验证。
- 匿名和登录状态都能在两次操作内到达核心功能。
- 核心导航一级入口控制在可快速扫描的数量范围内。
- TTS 默认表单只展示完成第一次生成所需字段。
- 普通用户界面不出现 Mongo、MIME、Token Header、Fingerprint ID 等内部术语。
- 所有模态框支持初始焦点、Tab 循环、Escape 和焦点恢复。
- 正文、标签和状态色通过目标对比度检查。
- 页面不依赖 raw hex 和任意圆角构建主视觉。
- 关键动效在 reduced-motion 环境下正确降级。

## 6. 与现有文档和任务的关系

- `docs/app-ui-design-language.md` 记录的是当前 App 壳层外观，可用于理解现状，但不应继续作为未来设计规范的唯一依据；其中部分固定色板、任意圆角和大面积玻璃态正是本报告指出的债务。
- `.trellis/spec/frontend/component-guidelines.md` 是目标规范，后续整改应优先向其 Token、语义圆角、可访问 primitive 和用户文案规则收敛。
- `.trellis/tasks/07-22-desktop-sidebar-navigation-redesign/` 主要解决桌面导航问题，只覆盖本报告的部分信息架构问题；首访信任、TTS 流程、页脚、主题和可访问性仍需独立跟踪。

## 7. 后续复核

完成首轮整改后，应在 GitHub Actions 中执行项目规定的类型检查、构建和测试，并使用真实运行页面补充以下人工检查：

- 320px、375px、768px、1024px 和宽桌面布局。
- 首访验证、登录、注册、TTS 生成和历史记录完整路径。
- 仅键盘操作和读屏状态播报。
- reduced-motion、系统深色偏好和高缩放比例。
- 公告、指纹请求、TOTP 与业务弹窗的互斥关系。
