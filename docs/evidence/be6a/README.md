# BE-6a 真实消费者证据（M-A 装配层身份一致性，裁定六）

〔性质：实测证据｜生成方式：真实浏览器 + 真实 DSH 实例 + 真实 core｜失效条件：候选 SHA 或产物摘要变化〕

## 候选身份绑定（不可拆元组）

| 元素 | 值 |
|---|---|
| candidate SHA | `7d2aba3eb36226ddea3d251b7513476dec65f19d` |
| 产物摘要（`packages/web/lib/client.js` sha256） | `6c87d6beffd06d3c0d3e9d236cda7a6deded753eb638cc6c00605d1669386a0b` |
| 页面实载产物 | `/plugins/??soloips-web/client.js&rev=7dac10bc367684ac-51`（`embedded: true`——候选字节确实在页面加载的 bundle 内） |
| DSH runtime | fork `deepseek-harness` 0.1.6-alpha.1（`D:/Source/workspace/deepseek-harness/apps/cli/lib/bin.js`） |
| 实例 | 隔离 DSH_HOME `D:/tmp/soloips-be6a/instance/home`；存储根 `…/storage-fe1a-e2e`；`127.0.0.1:55321` |
| 计划码 | `free`（配额 1 公司 / 0 子公司） |

**stale 规则**：上表任一元素对应的 SHA / 摘要变化 → 本目录证据自动失效，真实链路必须重跑。

## 本候选覆盖什么（集成范围）

本候选 = 已验收的集成候选 `5fe75e3` + FE-1a 公司面板（含 `apply` 形态修复与 `no-root` 文案修复）。
故本轮 E2E 证明的是**加入公司面板后**的装配路径仍然成立（面板挂在官方槽位、
Remote 业务面未变）。

## 证据文件

| 文件 | 内容 | 摘要 |
|---|---|---|
| `e2e-company-final.json` | 完整 E2E 报告（真实浏览器 CDP 驱动，页面上下文内调 Remote）——**9 步全绿，无 `failure` 字段，console 零噪声** | sha256 `13f4e52435c92b6f459cc226696a4db4202cf879d8becaa39f19f044f8a1f531` |
| `restart-readback.json` | **进程重启后**读回（裁定六第 3 条）——重启后那一轮 | 见文件内 `matched: true` |
| `restart-readback-pair.json` | **重启前后对照复现**：同一 fact 在重启前后各读回一次，两次 PID 不同（`5748` → `16344`），读回结果**逐字一致**（`identical: true`） | 见文件内 `identical: true` |
| `ablation-no-inject.json` | **历史对照**（绑定更早候选 `cf56b2c`）：摘除 web 行 `inject` 后业务面仍可用，证明该声明与业务面可用性**无因果**。**不是本候选的证据**，故列在 `additionalEvidence[]` | sha256 `4e49cecba7ede1d4e6e57ebf3695318971de7ca9eef8a9ff3d72152e376b50be` |
| `CANDIDATE-MANIFEST.json` | 候选绑定清单（由 CI 门 `check:m-a-evidence` 强制比对） | — |

> **独立验收的证据边界**：独立 QA（`soloips-tester`）无 DSH fork 运行时与隔离实例，故**重启读回未经其独立复现**——QA 能且仅能证明证据文件内部自洽。本目录的 `restart-readback-pair.json` 是**指挥**（持实例角色）为补此边界所做的对照复现；该边界在放行记录中显式登记。

## 界面实测（FE-1a：面板在真实浏览器里可见且可用）

〔实测，真实 Chromium + CDP，同一实例〕

| 检查 | 结果 |
|---|---|
| 装配树含 `soloips-web` | `entryCount=57`，`soloips-web` 在列 |
| 侧栏出现面板入口 | `aria-label="公司"` |
| 点击后面板渲染 | 「公司列表」+ 名称输入 + 类型选择 + 创建/刷新 |
| 填名 → 创建 | 出现确认步：「确认后将创建以下公司：FE-1a 浏览器创建公司 / 确认创建 / 返回修改」 |
| 确认创建 | 界面显示「公司已创建。`cmp_02aa8e8b-8815-4305-80ce-9b4165822a1f`」 |
| 持久化实证 | SQLite `company` 表 1 行（`name=FE-1a 浏览器创建公司`） |
| console / exceptions | **0 条** |
| 刷新后文案（修 `no-root` 后） | 「本会话尚未创建公司，因此还不知道要显示哪一棵公司树。…」——**不再**是「尚未创建任何公司」 |

## 实测结果（裁定六行为判据逐条）

| 判据 | 结果 | 证据 |
|---|---|---|
| 1. 经真实浏览器 / gateway 到达**正确的 Host service instance** | **PASS** | `create → committed`（无 `gateway/internal`、无 receiver identity mismatch） |
| 2. 候选产物身份**可核对** | **PASS** | `artifactIdentity.embedded: true`；sha256 与本地候选一致 |
| 3. `create → read → refresh/restart → read` | **PASS** | create `committed` → read-back `ok` → reload 读回 `ok` → **进程重启后读回 `ok` 且逐字一致** |
| 4. 不以 `gateway/internal` / 身份错配 / 加载旧候选「通过」 | **PASS** | 上述三项均正向确认，非降级通过 |

### 分步结果（`e2e-company-final.json`，9 步全绿）

| 步骤 | 结果 |
|---|---|
| `create` | `committed`，`companyId: cmp_128d0a3a-d999-4fee-8386-6ed721a9e7b8` |
| `read-back` | `ok`（id / name / type 与创建一致；**不含 `accountId`**） |
| `tree` | `ok`（含该公司一条） |
| `replay`（同 operationId） | `replayed`（幂等，返回**原** companyId，不新建） |
| `accountId-not-honored` | `refused/quota-exceeded`（**未提交**；`accountId` 未被采纳） |
| `tampered-replay`（同篡改 operationId 重放） | `refused` 且**无 `result` 键**（该 operationId 名下零业务写的独立判据） |
| `accountId-stripped-control`（无 accountId 对照调用） | 与篡改调用**同态同字段**（`reason`/`resourceType`/`planCode`/`current`/`limit` 逐字段一致）——证明剥离后等价 |
| `after-tamper` | `ok`（树条目数不变，零业务写） |
| `reload-read-back` | `ok`（刷新后同一持久事实） |
| 重启后读回（独立文件） | `ok`，`matched: true`，`accountId` 键不存在 |

### 关于 `accountId` 反例的准确性质（避免误读）

**早期一轮**（`e2e-company-pass1.json`，已由终版替换）曾把该步断言写成「网关应以 `gateway/arguments-invalid` 拒绝」，实测失败并暴露**断言缺陷**（非产品缺陷）：

- 网关 `assertExactArguments`（fork `packages/api/gateway/src/index.ts:1107-1133`）只校验 **`args` 顶层键**；`accountId` 位于 `args.input` **内层**，不在其校验范围。
- 内层由严格 codec 的 zod `parse` **剥离**（非拒绝）。**实测**：`z.object({operationId,name,type}).parse({…, accountId:'x'})` → 结果键 `['operationId','name','type']`，`'accountId' in parsed === false`。
- 故调用穿透到 core，撞上 free 计划的配额上限（该轮 create 已占满 1 家）。
- **安全性成立**：`accountId` 未被采纳（core 用部署注入账户），零业务写。
- 处置（已落地）：断言改为 5 条——不得 `committed`/`replayed`、错误码不含 `ACCOUNT`、同 operationId 重放无 `result`、对照调用同态、树条目数不变。判别力由 **11 组**响应形状的仿真证明（见该切片报告）。

  **存活者（= 已知盲区，不是全绿注脚）**：该仿真捕获 8/11，**S6 与 S7 两组响应形状仍未被捕获**。独立 QA 对当前候选复跑该仿真器确认仍为 8/11，并用真实 core 构造出 S6 的具体复现：篡改调用若真建了**顶层**公司，介质公司总数 `1→2` 而本步的**子树计数判据 `1→1` 不变 ⇒ 检不出**。该限制在 E2E 脚本内（约 617-623 行）有注释自陈，检出责任转给 `tampered-replay` 步（同 operationId 重放无 `result`）。

### 本轮重启复现的环境事实（如实登记，勿读作产品能力）

重启方式为**强制终止**（`Stop-Process -Force`——控制台应用无优雅关闭入口，`CloseMainWindow` 对无窗口进程无效）。
终止后宿主残留 `.soloips-writer-lease.json.lock`（内容为已死 PID `5748`），新宿主因此 fail-closed 返回
`unavailable`。按「锁主进程已死」判定清除该残留锁后重启，读回通过。

- 该残留是**环境事实**，其清除是**人工判定**；
- 本证据**不证明**产品具备「自动失效锁检测」能力——该能力的有无是独立议题（见 `docs/technical/state.md` 的租约章节），
  不得由本文件推断；
- 判别「锁主是否存活」的实测方法：`Get-Process -Id <锁内 PID>`（本次返回 0 个进程）。

## 不证明什么（边界声明）

- 不证明模型工具面（本包不注册模型工具）；
- 不证明**网关拒绝 `args.input` 内层未声明字段**（网关不检查内层——这是已实测的设计事实，非缺陷）；
- 不**构造性**验证配额拒绝端到端（本轮 `refused/quota-exceeded` 是真实发生并被逐字段断言的，但场景由「free 计划已占满」自然产生，非为验证配额而构造；构造验证属 FE-1b 窗口）；
- 不证明 UI 呈现（本片无界面改动）；
- 不证明上游装配链无第二处身份分裂（如协议包被装成两份）——只证明本候选在**本实例**下经真实链路成立；
- 不证明**崩溃恢复**（宿主被强制终止后的锁自动失效）——见上节环境事实。
