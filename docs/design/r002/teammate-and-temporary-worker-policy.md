# SoloIPs 临时工（一次性子智能体）使用规则

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-TEMP-WORKER-POLICY`；**指向**团队管理 Skill 8.6 的 SoloIPs 落地补充 |
| 目的 | 让人手不足的任务负责人能自行判断并派临时工，无需经 Lead 或 coordinator |
| 范围 | **仅补 Skill 8.6 未覆盖的 SoloIPs 特有细节**：判定表、8 人上限实测、留档落点、与授权边界的关系 |
| 决策状态 | 〔约束〕用户 2026-09-16 设定规则；规则**正文在 Skill 8.6**，本文是其落地补充 |
| 证据范围 | 2026-09-16 只读核对 r001 已安装工件的源码与配置；**未派任何临时工、未调用模型** |
| 依据 | `.agents/skills/team-delivery-leadership/references/soloips-development.md` **§8.6**；`AGENTS.md` §2；DEV-12/13 |
| 变更权 | 规则变更回 Skill 8.6（唯一正文）；本文随之同步。**不新建第二份流程正文**（规范 §7） |

---

## 0. 规则正文的位置（**先读这里，不要读本文当规则**）

> **规则正文：** [`.agents/skills/team-delivery-leadership/references/soloips-development.md`](../../../.agents/skills/team-delivery-leadership/references/soloips-development.md) **§8.6「临时工（人手不足时）」**

**本文不是第二份流程正文。** 按 `agent-readable-documentation.md` §7「更新最小既有权威，不新建同题副本」，Skill 8.6 是唯一规则正文；本文**只补它未写的 SoloIPs 特有细节**（§2–§6）。

**Skill 8.6 已覆盖（本文不重复）**：

| 要点 | Skill 8.6 的位置 |
| --- | --- |
| 编制上限 8 人 vs `workflow` 不计入 | §8.6 首段 |
| **谁派**：任务负责人自己派，Lead 不代派 | §8.6 第 1 条 |
| **何时用 / 何时不用** | §8.6 第 2、3 条 |
| 留档要求 + 证据标准不降级 | §8.6 第 4 条 |
| 多模型互查的唯一途径 | §8.6 第 5 条 |

---

## 1. 本文件补充什么（范围声明）

| # | 补充项 | Skill 8.6 是否已有 |
| --- | --- | --- |
| §2 | **判定表**（可勾选的决策流程） | 只有分条描述，无判定表 |
| §3 | **8 人上限的实测依据**（`file:line`） | 只写「平台 `TEAM_MEMBER_LIMIT`」，未给本实例的实际值来源 |
| §4 | **留档落点与命名**（SoloIPs 目录约定） | 只说「写入任务交付目录」 |
| §5 | **与 `AGENTS.md` §2 授权边界的关系** | 未涉及 |
| §6 | **Lead 独占边界的源码依据** | 只说「Lead 只做授权判定、创建/打断队员、对外汇报」 |

---

## 2. 判定表：什么时候用临时工

### 2.1 决策流程（按顺序判定）

```text
① 这个工作单元需要「跨轮记忆」或「任务板归属」吗？
   ├─ 是 → 【不用临时工】用持久队员（临时工无持久身份与邮箱）
   └─ 否 ↓
② 它要「连续修改同一个可写面」吗？（DEV-12 单写者）
   ├─ 是 → 【不用临时工】临时工每次是新实例，会破坏单写者
   └─ 否 ↓
③ 它要「连续写产品代码」吗？
   ├─ 是 → 【不用临时工】无持久上下文，易产生不一致
   └─ 否 ↓
④ 编制已满（本实例 8 人）或缺少所需视角？
   ├─ 否 → 可派持久队员；派临时工亦可，但非必要
   └─ 是 ↓
⑤ 【用临时工】走 workflow；产出必须留档汇总
```

### 2.2 判定表（速查）

| 工作类型 | 用临时工？ | 理由 |
| --- | --- | --- |
| 基线核对、参考提取、文档校对、独立复核、场景设计、索引汇总 | ✅ **是** | 一次性、有界、产出可留档 |
| 多角度并行审查（同一交付物的 N 个视角） | ✅ **是** | `workflow` 天然扇出；可指定不同 `provider`/`model` 实现多模型互查 |
| 缺特定视角（如 `flow-dev`/`web-dev` 未创建时的 T05/T06/T07 视角） | ✅ **是** | 一次性提供视角，不占编制 |
| 需跨轮记忆与任务板归属的持久工作（如 `core-dev` 持续实现 T03） | ❌ **否** | 临时工无持久邮箱、不占任务板、无跨轮记忆 |
| 连续写产品代码 | ❌ **否** | 无持久上下文；每次新实例，代码风格与决策会漂移 |
| 同一可写面的连续修改 | ❌ **否** | **DEV-12 单写者**：临时工每次是新实例，无法保证「同一时间一个写者」 |
| 需要 `spawn_teammate` / `interrupt_agent` 的动作 | ❌ **否（且不可能）** | 平台守卫 `TEAM_LEAD_REQUIRED`，仅 Lead 可执行（见 §6） |
| 需要扩大授权范围的动作 | ❌ **否** | 临时工**不扩大授权**（见 §5） |

### 2.3 一次任务用几个临时工

`workflow` 的并发与总量有平台上限（工具描述：「concurrency and total-agent caps apply」）。**建议单次 ≤ 8**，与编制上限无关。超过时拆成多次 `workflow` 调用，或先汇总再扇出。

---

## 3. 8 人上限与临时工的关系（实测依据）

### 3.1 上限来源（**已核到 file:line**）

| 事实 | 值 | 依据 |
| --- | --- | --- |
| 平台默认上限 | `DEFAULT_MAX_MEMBERS = 16` | `runtime/node_modules/@deepseek-ai/dsh-experimental-agent-team/lib/index.js:49` |
| **本实例（r001）实际配置** | **`maxMembers: 8`** | `runtime/node_modules/@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml:20`（`agent-team` 行的 `config.maxMembers`） |
| 超限错误 | `` `Team member limit ${this.maxMembers} reached` ``, code `TEAM_MEMBER_LIMIT` | 同包 `lib/roster.js:247`、`lib/index.js:564` |

**结论**：**8 不是平台默认值，而是官方 Team profile 层显式配置的值**。任务描述中「`DEFAULT_MAX_MEMBERS = 16`（但本实例配置为 8）」**准确**，我已核实两处。

### 3.2 临时工**不计入**该上限

`maxMembers` 校验发生在 `spawnAdmitted()`（`lib/index.js:564`）——它检查 **Team 的持久成员数组** `state.members`。`workflow` 的一次性子智能体**不注册为 Team member**，因此**不进入 `state.members`，不受该上限约束**。

**验证方式（〔未验证〕）**：本轮**未实际派过临时工**，故「临时工确实不占编制」是**基于源码路径的〔推断〕**，非实测。**首次实际派临时工时须记录**：派前 `list_agents` 成员数、派后成员数、`workflow` 返回结果——以实测确认该推断。

### 3.3 与 `flow-dev`/`web-dev` 创建失败的关系

coordinator 记录：`flow-dev`、`web-dev` 创建失败（`Team member limit 8 reached`），当前 8 名成员已满。**这正是临时工的适用场景**——用 `workflow` 补齐 T05/T06/T07 所需的视角，不占编制。

---

## 4. 留档要求（SoloIPs 落点约定）

### 4.1 硬规则

> **临时工产出必须写入任务交付目录，不得只留在临时工会话里。**
> —— Skill 8.6 第 4 条

### 4.2 SoloIPs 具体落点

| 情形 | 落点 | 依据 |
| --- | --- | --- |
| 属于某持久任务 | 该任务的 `writeScopes` 目录（如 `.artifacts/operations/r002-<任务>-20260916/`） | 任务描述 |
| 需随交付物入库 | `docs/design/<版本>/`（交 `integrator` 执行，DEV-12） | `document-archival-policy.md` §1.2 |
| 纯中间数据 | 任务目录下的 `temp-workers/` 子目录 | 本文建议 |

### 4.3 命名建议

```text
<任务目录>/temp-workers/<阶段>-<短标签>-<YYYYMMDD>.md
例：.artifacts/operations/r002-function-architecture/temp-workers/g1-review-arch-20260916.md
```

### 4.4 汇总者的义务

派工的任务负责人**必须在自己的交付物中汇总**临时工结论，并**注明**：

| 须注明 | 示例 |
| --- | --- |
| 派了几个临时工、各用什么 `provider`/`model` | 「3 个，`zai-coding-cn/glm-5.3`、`workbuddy-cn`、`qwen`」 |
| 每个的产出路径 | `temp-workers/g1-*.md` |
| **哪些结论被采纳、哪些被推翻** | 「2 条采纳，1 条经复核推翻（原因：…）」 |
| 未验证边界 | 「临时工未读源码，其结论标〔未验证〕」 |

**不得**把临时工产出**原样**当作自己的结论交付——负责人**仍是该交付物的唯一责任人**（DEV-12/13）。

### 4.5 证据标准**不降级**

Skill 8.6 明确：临时工同样须给 `file:line`、三类标注、不用「大概」「应该」。**派工 prompt 中必须写明该要求**，否则临时工可能返回无据结论。

---

## 5. 与 `AGENTS.md` §2 授权边界的关系

### 5.1 临时工**不扩大授权范围**

| 项 | 规则 |
| --- | --- |
| **授权包（Envelope）** | 由**用户**发布；临时工的存在**不创建、不扩大** Envelope |
| **可写面** | 临时工只能写**派工任务已授权**的目录；`workflow` 的 `agent()` **不产生新的写入授权** |
| **暂停条件** | `AGENTS.md` §2 的 8 种暂停条件对临时工**同样适用**；派工者不得借「反正是临时工」绕过 |
| **对外动作** | 临时工**不得**执行 push / 发 PR / 发布（§2 #7）——这些仍须用户授权且由授权者执行 |
| **凭据与服务** | 临时工不得读凭据、启服务、改配置（项目红线） |

**依据**：`AGENTS.md:39`「环境状态**不能**创建 Envelope、**不能**扩大其目标/范围/允许目录」；`:70`「环境放开权限**不能**创建或扩大 Envelope」。临时工属环境状态，不是授权来源。

### 5.2 派工者的自检

派临时工前，任务负责人须自问：

1. 该工作单元**是否在**我任务已有的授权范围内？（若否 → 命中 §2 #1「超出任务目标」，先请示）
2. 产出落点**是否在**我的 `writeScopes` 内？（若否 → 命中 §2 #2）
3. 是否要求临时工执行 §2 的 8 种暂停动作？（若是 → **不可派**）

---

## 6. Lead 独占边界（源码依据）

| 工具 | 守卫 | 依据 |
| --- | --- | --- |
| `spawn_teammate` | `if (membership.role !== "lead") throw new TeamError("only the Team Lead can create teammates", "TEAM_LEAD_REQUIRED")` | `.../dsh-experimental-agent-team/lib/index.js:546`；`lib/roster.js:225` |
| `interrupt_agent` | `if (membership.role !== "lead") throw new TeamError("only the Team Lead can interrupt teammates", "TEAM_LEAD_REQUIRED")` | `lib/index.js:505`；`lib/roster.js:181` |
| 任务改派 | `if (!lead) throw new TeamError("only the Team Lead can reassign tasks", "TEAM_LEAD_REQUIRED")` | `lib/index.js:1445`；`lib/task-board.js:162` |

**因此**：**非 Lead 成员（含任务负责人、coordinator、doc-reviewer）无法创建持久队员**，但**可以派临时工**（`workflow` 无该守卫）。这正是 Skill 8.6「谁派：任务负责人自己派」在平台层可行的原因。

---

## 7. 多模型互查的正确用法（补充 Skill 8.6 第 5 条）

| 目标 | 可行路径 | 依据 |
| --- | --- | --- |
| 给**持久队员**指定模型 | ❌ **不可行** | `SpawnTeammateRequest` **无 `model` 字段**——`lib/types/types.d.ts:119–126` 仅含 `name`/`description`/`prompt`/`context`/`provider`/`signal` |
| 给**临时工**指定模型 | ✅ `workflow` 的 `agent(prompt, {provider, model})` | 工具描述明确支持 `provider`/`model` 覆盖 |

**注意 `provider` 的语义**：`SpawnTeammateRequest.provider` 是 **subagent 后端**（`spawn` / `fork`），**不是**模型 API 路由。`docs/architecture.md:68` 已明确「`provider` 与 `llmProvider` 分别选择 subagent 后端与模型 API 路由；Qwen、WorkBuddy 等不能填到这个后端字段」。**不要把二者混用。**

**r002 可用路由**（`roster.md:46` 实测）：`qwen`、`zai-coding-cn`、`workbuddy-free`、`workbuddy-cn`。

---

## 8. 标注与边界

| 项 | 标注 |
| --- | --- |
| Skill 8.6 的规则内容 | **可直接采用**（用户已授权） |
| 本文 §2 判定表、§4 落点约定 | **可直接采用**（本文建议，Lead 可调整） |
| §3.1 上限 `maxMembers: 8` | **〔源码事实〕** 已核到 `file:line` |
| §3.2「临时工不计入上限」 | **〔推断〕** 基于源码路径（`state.members` 校验）；**未实测**，首次派工须验证 |
| §6 Lead 守卫 | **〔源码事实〕** 已核到 `file:line`（6 处） |
| §7 `SpawnTeammateRequest` 无 `model` | **〔源码事实〕** 已核到 `lib/types/types.d.ts:119–126` |

**未执行**：未派任何临时工、未调用模型、未写产品代码、未装配、未启动服务。**本文不构成实现授权**；规则变更须回 Skill 8.6。
