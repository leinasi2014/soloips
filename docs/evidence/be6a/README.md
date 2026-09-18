# BE-6a 真实消费者证据（M-A 装配层身份一致性，裁定六）

〔性质：实测证据｜生成方式：真实浏览器 + 真实 DSH 实例 + 真实 core｜失效条件：候选 SHA 或产物摘要变化〕

## 候选身份绑定（不可拆元组）

| 元素 | 值 |
|---|---|
| candidate SHA | `cf56b2c44f50ede65ec490067e74f63d7b009243` |
| 产物摘要（`packages/web/lib/client.js` sha256） | `8eafb230d7b2273f026e741b5aa6b3ef657b7430bab2e9765b9bafbaf15039b5` |
| 页面实载产物 | `/plugins/??soloips-web/client.js&rev=70ff993dac79a093-51`（`embedded: true`——候选字节确实在页面加载的 bundle 内） |
| DSH runtime | fork `deepseek-harness` 0.1.6-alpha.1（本机 `apps/cli/lib/bin.js`） |
| 实例 | 隔离 DSH_HOME `D:/tmp/soloips-be6a/instance/home`；存储根 `…/storage-final2`；`127.0.0.1:55321` |
| 计划码 | `free`（配额 1 公司 / 0 子公司） |

**stale 规则**：上表任一元素对应的 SHA / 摘要变化 → 本目录证据自动失效，真实链路必须重跑。

## 证据文件

| 文件 | 内容 | 摘要 |
|---|---|---|
| `e2e-company-final.json` | 完整 E2E 报告（真实浏览器 CDP 驱动，页面上下文内调 Remote）——**9 步全绿，无 `failure` 字段** | sha256 `20246ba9391f0a078013cc31a2ad1fb22a81fd17551f020eca13f3dba037936f` |
| `restart-readback.json` | **进程重启后**读回（裁定六第 3 条） | 见文件内 `matched: true` |
| `restart-readback-pair.json` | **重启前后对照复现**：同一 fact 在重启前后各读回一次，两次 PID 不同（`43716` → `38336`），读回结果**逐字一致** | 见文件内 `identical: true` |
| `CANDIDATE-MANIFEST.json` | 候选绑定清单（由 CI 门 `check:m-a-evidence` 强制比对） | — |

> **独立验收的证据边界**：独立 QA（`soloips-tester`）无 DSH fork 运行时与隔离实例，故**重启读回未经其独立复现**——QA 能且仅能证明证据文件内部自洽（31/31 核对通过）。本目录的 `restart-readback-pair.json` 是**指挥**（持实例角色）为补此边界所做的带时间戳对照复现；该边界在放行记录中显式登记。

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
| `create` | `committed`，`companyId: cmp_e463ab7e-fced-403e-869b-eef469044ef4` |
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
- 处置（已落地）：断言改为 5 条——不得 `committed`/`replayed`、错误码不含 `ACCOUNT`、同 operationId 重放无 `result`、对照调用同态、树条目数不变。判别力由 10 组响应形状的仿真证明（见该切片报告）。

## 不证明什么（边界声明）

- 不证明模型工具面（本包不注册模型工具）；
- 不证明**网关拒绝 `args.input` 内层未声明字段**（网关不检查内层——这是已实测的设计事实，非缺陷）；
- 不**构造性**验证配额拒绝端到端（本轮 `refused/quota-exceeded` 是真实发生并被逐字段断言的，但场景由「free 计划已占满」自然产生，非为验证配额而构造；构造验证属 FE-1b 窗口）；
- 不证明 UI 呈现（本片无界面改动）；
- 不证明上游装配链无第二处身份分裂（如协议包被装成两份）——只证明本候选在**本实例**下经真实链路成立。
