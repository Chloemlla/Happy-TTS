# 方法论来源与适用边界

本 Skill 把公开方法与工程经验组合成风险驱动流程。以下来源用于校准覆盖面和迁移模式，不意味着正式符合或认证。

## 质量与安全覆盖面

- [ISO/IEC 25010:2023 产品质量模型](https://www.iso.org/standard/78176.html)
  用途：提醒检查功能适合性、性能效率、兼容性、交互能力、可靠性、安全性、可维护性、灵活性和安全保障等质量维度。Skill 将其转化为代码库证据，不做标准认证。

- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)（[GitHub](https://github.com/OWASP/ASVS)）
  用途：Web 应用安全控制的覆盖参考。只选与威胁模型和系统类型相关的控制。

- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
  用途：把安全放到设计、默认配置、测试和度量中，而不是只在末尾扫描。

## 渐进现代化

- [Martin Fowler：Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html)
  用途：用路由和逐能力替换降低一次性切换风险。

- [Martin Fowler：Branch By Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html)
  用途：在系统内部引入抽象，使大规模替换可持续集成和发布。

- [Martin Fowler：Parallel Change](https://martinfowler.com/bliki/ParallelChange.html)
  用途：以 expand、migrate、contract 三阶段安全演进接口和 schema。

- [Martin Fowler：Legacy Seam](https://martinfowler.com/bliki/LegacySeam.html)
  用途：在难测试遗留代码中找到或制造可替换行为的接缝。

- [Martin Fowler：Patterns of Legacy Displacement](https://martinfowler.com/articles/patterns-legacy-displacement/)
  用途：把遗留替换看成多种模式组合，并围绕业务结果管理风险。

- AWS Prescriptive Guidance：[Strangler fig](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html) 与 [Branch by abstraction](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/branch-by-abstraction.html)
  用途：补充渐进分解单体的适用场景与共存要求。

## 路线选择

- [Azure Cloud Adoption Framework：迁移策略](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/select-cloud-migration-strategy)
  用途：保留、退役、重托管、平台化、重构、重新架构、重建、替换等路线的决策词汇。本 Skill 不限定云迁移。

- [AWS Prescriptive Guidance：迁移策略](https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
  用途：提醒“重构/重新架构”通常是最高复杂度路线，不能对所有工作负载一刀切。

## 开源检查工具索引

- [GitHub CodeQL](https://github.com/github/codeql)
  用途：在适用语言中查询安全漏洞和代码缺陷；结果仍需人工确认可达性与影响。

- [Static Analysis tools catalog](https://github.com/analysis-tools-dev/static-analysis)
  用途：按语言发现静态分析、依赖和质量工具。优先使用项目已有工具，避免体检本身引入大量依赖。

- [Parallel Change 示例仓库](https://github.com/unclejamal/parallel-change)
  用途：理解 expand、migrate、contract 的小步接口演进。示例不替代项目契约测试。

## 本 Skill 的额外约束

- 指标必须连接到失败模式或变更成本。
- 深度治理必须通过 E/G/Q/C/D 决策门，并保留修复前后同口径对比。
- 数据迁移必须有权威源、对账、不变量和回滚。
- 微服务不是默认目标；先验证模块边界和团队运维能力。
- 兼容层必须有退场条件，避免治理过程制造新遗留。
- 外部社区文章可用于发现思路，但关键技术判断优先由项目证据、官方文档和可复现实验支持。
