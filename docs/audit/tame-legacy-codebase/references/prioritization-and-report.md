# 发现项排序、评分与报告模板

报告是执行期间持续更新的发现账本，不是结束时才生成的总结。排序用于安排处理顺序，不得过滤 Low 或 Info；评分用于表达当前范围的证据质量，不用于跨项目排名。

## 目录

1. 发现项模型
2. 严重度与状态
3. 风险排序
4. 七维质量评分
5. 写穿式报告规则
6. 通用报告模板
7. 标准与系统附加章节
8. 主对话输出

## 1. 发现项模型

每个不同问题分配一个 `F-001` 形式 ID。重复出现但根因、影响和建议相同的情况可共用一个 ID，同时完整列出每个位置和出现次数；不同失败模式不得为了少写而合并。

所有发现至少记录：

| 字段 | 内容 |
| --- | --- |
| ID | F-001 |
| 严重度 | Critical / High / Medium / Low / Info |
| 证据状态 | Confirmed / Suspected |
| 处置状态 | Open / Fixed / Deferred / Accepted / Rejected |
| 标题 | 一句话描述问题，不把方案当标题 |
| 证据 | 文件、行/符号、命令、测试、指标、文档或消费者 |
| 影响 | 失败、用户影响或理解/变更成本 |
| 建议/问题 | 最小动作；若为 Suspected，写出待用户裁决的问题 |

轻量分支和 Low/Info 可以只使用上述紧凑字段。Critical/High、复杂根因或标准/系统分支按需补充：

- 触发场景、失败模式、爆炸半径和可恢复性
- 根因假设、反证与替代解释
- 发生可能性、变化热度、处理成本和置信度
- 前置依赖、成功条件、验证方式和不处理后果

紧凑不等于抽样。每项仍需可定位、可理解、可处置。

## 2. 严重度与状态

### 严重度

- **Critical**：正在发生或可直接触发的安全突破、核心业务中断、不可接受数据损失，且恢复困难或影响广泛。
- **High**：关键功能、权限、数据正确性或交付能力存在高概率重大失败；需要优先处理。
- **Medium**：常见变更或场景会产生局部故障、显著维护成本或风险扩散。
- **Low**：影响局部、可恢复，主要降低理解效率、测试效率或未来变更安全性。
- **Info**：当前没有可证明失败模式，但属于值得保留的工程事实或清理线索，例如缺少必要文档、无法解释的内部术语、孤立 `v2`、失去语义的 `legacy` 名称或代码量异常候选。

严重度描述潜在影响，不能由文件行数、lint 级别或工具默认等级直接映射。

### 证据状态

- **Confirmed**：问题存在及其核心影响有可复核证据；影响大小仍可带置信度。
- **Suspected**：候选合理，但是否为问题取决于产品意图、用户体验、外部消费者、运行用量或尚不可得的证据。

可由本地代码、测试或历史查清的疑点应继续调查，不急于询问用户。剩余 Suspected 必须在报告中带一个具体问题，并在主对话集中询问；用户回答后更新为 Confirmed 或 Rejected，或明确保留为 Suspected。

### 计数口径

严重度表统计本次发现的全部 Confirmed 与仍未决的 Suspected，包括已经 Fixed、Deferred 或 Accepted 的项；这样修复后不会抹掉本次发现数量。Rejected 保留在决策记录中，但不计入严重度表。

## 3. 风险排序

需要细排时记录以下分量：

- 影响 `I`：0–4
- 可能性 `L`：0–4
- 爆炸半径 `B`：0–3
- 变化热度 `H`：0–3
- 恢复惩罚 `R`：0–3

初始指数：

`Priority Index = I × L + B + H + R`

建议分带：18 以上为紧急候选，13–17 为高，8–12 为中，0–7 为低。始终显示分量和证据置信度，并应用：

- 正在利用的安全问题、正在损坏的数据、不可恢复备份或生产事故直接进入 Critical 候选。
- 低置信度高分项先验证，不直接大改。
- 共享根因的发现建立因果链，但保留各自 ID 和证据。
- 建立测试、可观测性、边界或回滚能力的使能项可提前。
- 低成本项可以穿插处理，不得从账本删除或遮蔽系统风险。
- 纯可读性、术语或文档问题至少保留为 Low/Info，不从报告排除。

## 4. 七维质量评分

固定评分 Security、Stability、Performance、Testing、Maintainability、Design、Release，均为 0–10，10 表示当前证据支持的状态最好。评分范围与报告范围一致；轻量任务评分的是声明的局部范围，不伪装成全仓结论。发生修改时，在第一次编辑前冻结一组 Before 分数，完成验证后以同一范围和锚点计算 After；E0 只有 Before。

### 分数锚点

- **9.0–10.0**：相关风险经过充分检查和验证，没有发现实质缺口，保护机制明确有效。
- **7.0–8.9**：总体健康，只有局部、低风险或低成本缺口。
- **5.0–6.9**：存在明确中等问题或覆盖缺口，但有部分保护和可控恢复方式。
- **3.0–4.9**：系统性薄弱、重复失败或关键安全网不足。
- **1.0–2.9**：关键能力大面积失控，故障高概率且难恢复。
- **0.0–0.9**：已知灾难性失败或几乎没有可依赖的控制。

没有证据不等于 10 分。仍需给出数值时，用已检查事实给保守暂定分，并把置信度标为低；不得用低分惩罚“不适用”，而应在说明中界定如何解释该维度。

### 等级与总分

- S：9.0–10.0
- A：7.0–8.9
- B：5.0–6.9
- C：3.0–4.9
- D：1.0–2.9
- F：0.0–0.9

Overall 是七项分数的等权算术平均，保留一位小数。条形图固定 10 格，实心格数量取分数整数部分。每一行给一句最关键证据，详细依据留在发现项中：

```text
Security        ████████░░  8.0  A   No auth on WS, hardcoded secret in config
Stability       ██████░░░░  6.0  B   3 unwrap on hot path, no retry on DB
Performance     ██████████  10.0 S   No issues found in verified workload
Testing         ████░░░░░░  4.0  C   9 integration tests real, but unit is weak
Maintainability ███████░░░  7.0  A   3 files over 800 lines, SRP violated in 2 modules
Design          █████░░░░░  5.0  B   DRY violated 5x, fail-fast missing at API boundary
Release         ██████░░░░  6.0  B   No CI on Windows, no rollback plan
─────────────────────────────────────
Overall         ██████░░░░  6.6  B
```

同时在文件报告中记录每项评分的置信度（低/中/高）和检查范围。只在确实验证过适用工作负载后写 `No issues found`；否则写 `No issue found in inspected paths` 或指出未验证项。

## 5. 写穿式报告规则

1. 建立报告后立即写范围、档位、空计数表和发现账本表头。
2. 每确认一个问题或形成一个需裁决候选，先追加/更新该项，再继续检查下一个无关位置。
3. 同步更新严重度计数；不得在结束时重新凭印象计算。
4. 证据增加、用户回答或修复完成时原地更新同一 ID，不另造重复项。
5. 大量重复位置放入该发现的完整 occurrence 列表或附录，不以“样例 30 条”截断。
6. 工具候选不是自动发现项；逐一做上下文判断。未完成判断的候选数量与范围写入“未检查区域”。
7. 第一次编辑前冻结 Before 评分和指标，后续只更新 After；不得把修复后的分数覆盖到 Before。最终文件与主对话必须一致。

## 6. 通用报告模板

所有任务规模都包含以下内容：

```markdown
# Legacy codebase cleanup report

- Updated:
- Scope and exclusions:
- Environment and limitations:
- Mode: 轻量/标准/系统
- Decisions: E?/G?/Q?/C?/D?
- Report status: In progress / Waiting for decisions / Waiting for repair approval / Complete

## Before assessment (frozen before first edit)

Security        ░░░░░░░░░░  --   -   Pending
Stability       ░░░░░░░░░░  --   -   Pending
Performance     ░░░░░░░░░░  --   -   Pending
Testing         ░░░░░░░░░░  --   -   Pending
Maintainability ░░░░░░░░░░  --   -   Pending
Design          ░░░░░░░░░░  --   -   Pending
Release         ░░░░░░░░░░  --   -   Pending
─────────────────────────────────────
Overall         ░░░░░░░░░░  --   -   Pending

| Dimension | Confidence | Scope/evidence |
| --- | --- | --- |

## After assessment

Security        ░░░░░░░░░░  --   -   Pending / N/A for E0
Stability       ░░░░░░░░░░  --   -   Pending / N/A for E0
Performance     ░░░░░░░░░░  --   -   Pending / N/A for E0
Testing         ░░░░░░░░░░  --   -   Pending / N/A for E0
Maintainability ░░░░░░░░░░  --   -   Pending / N/A for E0
Design          ░░░░░░░░░░  --   -   Pending / N/A for E0
Release         ░░░░░░░░░░  --   -   Pending / N/A for E0
─────────────────────────────────────
Overall         ░░░░░░░░░░  --   -   Pending / N/A for E0

| Dimension | Before | After | Delta | Confidence | Evidence/interpretation |
| --- | ---: | ---: | ---: | --- | --- |

## Finding summary

| Severity | Count | Confirmed | Suspected |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |
| Info | 0 | 0 | 0 |
| **Total** | 0 | 0 | 0 |

## Executive summary

- Current runnable state:
- Main conclusion:
- Highest-priority findings:
- Next smallest action:

## Code size baseline

| Area/type | Files | Physical lines | Exclusions/notes |
| --- | ---: | ---: | --- |

| Largest file/symbol | Physical lines | Role | Finding ID or rationale |
| --- | ---: | --- | --- |

## Baseline checks

| Check | Command/evidence | Result | Baseline failure? |
| --- | --- | --- | --- |

## Before/after comparison

| Measure | Before (frozen) | After | Delta | Interpretation |
| --- | --- | --- | --- | --- |
| First-party production physical LOC |  |  |  |  |
| Largest relevant file/symbol |  |  |  |  |
| Tests / static checks |  |  |  |  |
| Confirmed findings fixed/open |  |  |  |  |
| Documented functional standards |  |  |  |  |
| User-visible/contract behavior |  |  |  |  |

## Finding ledger

| ID | Severity | Evidence | Disposition | Finding | Location/evidence | Impact | Action or question |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Pending user decisions

| Question | Finding | Decision needed | Why repository evidence is insufficient | Answer/status |
| --- | --- | --- | --- | --- |

## Changes and verification

| Finding | Before evidence | Change | After evidence / verification | Result |
| --- | --- | --- | --- | --- |

## Documentation feedback

- Functional standards consulted:
- Documentation updated:
- Missing/stale documentation findings:

## Remaining risk and uninspected areas

- Deferred/accepted/open findings:
- Checks not run and why:
- Uninspected areas and candidate backlog:
```

轻量任务到这里即可完成。没有契约、数据或系统地图时不创建空洞的大章节。E0 将 After 标为不适用；E1 在修复前报告中保持 After 待处理，修复轮完成后补齐；E2 也必须在第一次改动前写入并冻结 Before。

## 7. 标准与系统附加章节

按适用性追加：

### System map

- 关键业务场景、运行/部署单元、依赖方向、数据权威源、外部消费者和未知区域。

### Root-cause clusters

- 保留每个发现 ID，用因果链说明共同根因和处理顺序。

### Treatment options

| Option | Benefit | Risk reduction | Time to value | Cost | Migration risk | Reversibility |
| --- | --- | --- | --- | --- | --- | --- |

只有确有路线决策时才给多个选项。轻量确定性修复不制造“保守/推荐/彻底”三套同义方案。

### Compatibility matrix

| Producer/storage | Old consumer | Current consumer | New consumer | Rollback version |
| --- | --- | --- | --- | --- |

### Data migration

- 权威源、目标 schema、扩展、回填、影子校验、切换、对账不变量、回滚和收缩条件。

### Phased plan

| Slice | Purpose | Change | Verification | Rollout | Rollback | Exit condition |
| --- | --- | --- | --- | --- | --- | --- |

## 8. 主对话输出

主对话先给当前或最终严重度表，格式固定：

| Severity | Count | Confirmed | Suspected |
| --- | ---: | ---: | ---: |
| Critical |  |  |  |
| High |  |  |  |
| Medium |  |  |  |
| Low |  |  |  |
| Info |  |  |  |
| **Total** |  |  |  |

然后依次给：

1. 七维评分块与 Overall；逐行使用本文件第 4 节的完整格式，条形图必须是恰好 10 个 `█/░` 字符，不省略、不改成 `#` 或 `.`。
2. 最高优先级结论、实际改动、Before/After 关键差值和验证摘要。
3. Markdown 报告的可点击路径。
4. 全部待裁决问题；问题编号与报告一致，一次性询问。

E1 的修复前消息还要给建议修复范围并明确等待确认，当前轮不得继续改代码。用户回答后继续工作并把答案写回文件。不得只在对话提问而不留档，也不得只在文件留问题而不实际询问。
