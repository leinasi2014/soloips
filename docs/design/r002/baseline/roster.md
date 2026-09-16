# SoloIPs r002 开发团队编制与模型分配（待确认）

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-ROSTER`；**本机团队编制记录**，非注册文档 |
| 目的 | 固定 r002 的成员清单、职责、独占写面、任务与模型分配意图，并记录当前**无法直接执行的模型约束** |
| 范围 | 成员编制、写面划分、批次、模型分配与其机制约束；不含任务内容正文（见 `baseline.md`） |
| 决策状态 | 〔待确认〕模型分配为**用户意图**；`SpawnTeammateRequest` 不支持成员级模型，见 §3 |
| 证据范围 | 2026-09-16 本机只读核对官方 Team 包类型定义与实例 settings |
| 依据 | `docs/technical-architecture.md` DEV-12、`docs/governance/code-development-standard.md`、`docs/architecture.md` §8、`docs/governance/agent-readable-documentation.md` §9 |
| 变更权 | 用户决定模型与人员；本记录随确认更新 |

---

## 1. 成员编制（9 名）

| # | 成员 | 职责 | 独占写面 | 任务 | 批次 |
| --- | --- | --- | --- | --- | --- |
| 1 | `baseline-auditor` | DSH 0.1.6 机制重核；官方 `upstream/master` 对齐与工件构建 | 只读；仅 `.artifacts/operations/**` | W0 前置 | 1 |
| 2 | `integrator` | **唯一集成者**（Git index 单写者）+ 基线入库 | `docs/**`、`.agents/**`、`AGENTS.md`、根目录散落物 | T00 | 1 |
| 3 | `assembly-dev` | 装配契约 + 可复现交付定义 | `packages/bundle/**`、`packages/*/cordis.patch.yml`、`profiles/soloips/**` | T01 + T04 | 1 |
| 4 | `adapter-dev` | DSH seam 收敛 + 官方 Team 适配 | `packages/adapter-dsh/**` | T02 → T08 | 1 |
| 5 | `verifier` | **独立 QA**：SOLO-ACC-01–10 场景执行与独立复核 | 产品代码**只读** | 全程 | 1 |
| 6 | `doc-reviewer` | **文档校对审查**：格式、标签、稳定 ID、链接、登记一致性 | 文档**只读**（意见交 `integrator`） | 全程 | 1 |
| 7 | `core-dev` | domain + 唯一提交前门 + 跨进程 fence | `packages/core/**`（除 #8 两目录） | T03 | 2 |
| 8 | `flow-dev` | 完整入职/准入 + 首错停线 | `packages/core/src/company/**`、`src/lifecycle/**` | T05 + T06 | 2 |
| 9 | `web-dev` | Host 桥 + 客户端投影 | `packages/web/**` | T07 | 2 |

**新增两个角色（本轮补充）**

- **`verifier`（独立 QA）**：`docs/technical-architecture.md` §11 的 SOLO-ACC-01–10 是**验收合同**，需要独立执行者；且 §11.8 明确首片门槛不得降级。QA 必须自己跑命令、读原始产物，不得采信作者摘要。
- **`doc-reviewer`（文档校对审查）**：`document-registry.yaml` 的 `sharedAuthorityWriterCount: 1` 要求共享权威单一写者，所以校对者**不能**与写者同为一人。检查项按 `agent-readable-documentation.md` §9：陌生读者可读性、需求→规则→验收追踪、标签混用、本地链接、稳定 ID；并运行项目既有文档检查器（`check_candidate.py` / `validate-docs.cjs` 一系）。

---

## 2. 模型分配（用户意图）

| 角色 | 用户指定模型 | 路由键 |
| --- | --- | --- |
| 独立 QA（`verifier`） | GLM-5.3 + DeepSeek V4.1 Flash CN | `zai-coding-cn` / `glm-5.3`；`workbuddy-cn` / `cn:deepseek-v4.1-flash` |
| 文档校对审查（`doc-reviewer`） | DeepSeek V4.1 Flash CN | `workbuddy-cn` / `cn:deepseek-v4.1-flash` |
| 代码编写（`assembly-dev`/`adapter-dev`/`core-dev`/`flow-dev`） | Qwen + DeepSeek V4.1 Flash CN + DeepSeek V4.1 Flash Global Free | `qwen` / `qwen3.8-flash-next`；`workbuddy-cn`；`workbuddy-free` |
| `web-dev` | Qwen + DeepSeek V4.1 Flash Global Free | `qwen` / `qwen3.8-flash-next`；`workbuddy-free` |
| 其余（`baseline-auditor`/`integrator`） | DeepSeek V4.1 Flash Global Free | `workbuddy-free` / `global:deepseek-v4.1-flash` |

**四条路由在 r001 settings 中均已配置**（`llm-pi-ai.providers`）：`qwen`、`zai-coding-cn`、`workbuddy-free`、`workbuddy-cn`。`.credentials.yaml` 含 `QWEN_API_KEY`、`ZAI_CODING_CN_API_KEY`、`WORKBUDDY2API_API_KEY` 三个引用键（仅核对键名，未读值）。

---

## 3. 阻塞：`SpawnTeammateRequest` 不支持成员级模型

**〔源码事实〕** 2026-09-16 核对 `dsh-experimental-agent-team/lib/types/types.d.ts`：

```ts
interface SpawnTeammateRequest {
    readonly name: string;
    readonly description: string;
    readonly prompt: ContentBlock[];
    readonly context: 'fresh' | 'fork';
    readonly provider: string;      // subagent 后端：spawn / fork
    readonly signal: AbortSignal;
}
```

- **没有 `model` 字段。**
- `TeamMemberView` 有 `readonly model?: string`，但那是**只读展示字段**（成员实际使用的模型），不是输入。
- `provider` 是 subagent 后端选择，**不是**模型 API 路由。`docs/architecture.md` §2 已明确：「`provider` 与 `llmProvider` 分别选择 subagent 后端与模型 API 路由。当前 Team 后端为 `spawn` / `fork`；Qwen、WorkBuddy 等不能填到这个后端字段。」

**结论：无法通过 `spawn_teammate` 为单个 durable 队员指定模型。** 持久队员的模型来自会话/preset/实例默认值。

### 可行路径

| 方案 | 能做到 | 代价 / 限制 |
| --- | --- | --- |
| **A. 统一默认模型** | 全员继承实例默认（当前 `global:deepseek-v4.1-flash`） | 满足"其余"和代码编写的一条路由，但**做不到** QA 用 GLM、文档用 CN |
| **B. 改实例默认模型** | 按波次切换：文档/QA 波用 CN 或 GLM，编码波用 Qwen | 属配置变更，需授权与核验；**同一时刻全员同模型**，无法并存多模型 |
| **C. `workflow` 工具扇出** | `agent(prompt, {provider, model})` **支持 per-agent 模型覆盖** | 子智能体是**一次性**的，不是持久队员：无持久邮箱、不占任务板、无跨轮记忆 |
| **D. 自定义 subagent provider** | 注册一个把模型路由固定的 provider，再填入 `provider` 字段 | 需开发并注册 provider，属独立开发任务；须授权 |

**我的建议**：**C + A 组合**。持久队员（`integrator`/`core-dev`/`adapter-dev` 等需要跨轮记忆与任务板归属的）用默认模型；**适合一次成型的独立工作单元**（基线重核、文档校对、QA 场景执行、代码审查）走 `workflow`，从而真正拿到 GLM / CN / Qwen 的模型多样性——这正是你要的"多模型互查"效果，且不违反平台约束。

---

## 4. 批次与并行宽度

| 批次 | 人数 | 成员 | 启动条件 |
| --- | --- | --- | --- |
| 批 1 | 6 | `baseline-auditor`、`integrator`、`assembly-dev`、`adapter-dev`、`verifier`、`doc-reviewer` | T00/T01/T02 写面互斥；QA 与文档审查从 W0 就位，避免末端瓶颈 |
| 批 2 | +3 | `core-dev`、`flow-dev`、`web-dev` | **T02 的 `contracts.ts` 与 commit 门禁签名冻结后** |

**并行上限说明**：`core-dev` 与 `flow-dev` 同包并行，前提是接口先冻结；冻结前 `flow-dev` 只能做设计不能写码。这是并行宽度的真实上限，不由人数决定。

**限流风险**：free 档 6–9 路并发有较高概率触发额度/QPS 错误；按项目红线**首错即停线、不自动重试**，会让全队停摆。故批 1 先上 6 人观察一轮。

---

## 5. 与既有文档的关系

`docs/architecture.md` §8 的模型分配表属**上一轮文档团队**的建队配置（"本轮先组织文档团队"），范围与本次开发团队不同，不构成冲突，也**不需要**因此修改该文档。本次分配以用户本轮指令为准。

---

## 6. 核验回执

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 成员级模型字段 | 读 `types.d.ts` 的 `SpawnTeammateRequest` | **无 `model` 字段**；`TeamMemberView.model` 为只读 |
| 模型路由可用性 | 读 r001 `settings.yaml` 的 `llm-pi-ai.providers` | `qwen`/`zai-coding-cn`/`workbuddy-free`/`workbuddy-cn` 四条均存在 |
| 凭据引用 | 读 `.credentials.yaml` 键名（不读值） | 三个 API key 引用键均存在 |

**未执行**：未 spawn 任何成员，未修改任何配置或模型设置，未调用模型。
