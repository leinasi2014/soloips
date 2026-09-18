# 知识包：代码库地图

〔性质：源码事实+约定｜来源版本：main@669dac8（2026-09-18 复核）｜验证状态：读源确认｜失效条件：包结构/风格大改〕
〔范围声明〕本包只放**稳定内容**（包职责/风格范式/入口/跑法）。易变的实现进度、测试数、切片状态**不写这里**——它们归 data-contract §0 与 Issue。

〔**状态类陈述必须注明所属层**（2026-09-18 外审 F-05 教训）〕本包曾把**在途候选**的事实写成仓库事实（「本仓已升 `0.1.6-alpha.2`」，而当时 main 的 `package.json` 仍是 `alpha.1`），会让下一个实例按错误前提行动。故：凡状态陈述一律标明它属于 `main` / 某个在途候选（附身份）/ 某次实测结论；且四档**必须分开写**——**已批准 ≠ 已实现 ≠ 已验证 ≠ 已合并**。

## 包职责（5 包）
- core：组织结构+文档模型唯一写权威（七表：company/department/employee/appointment/document_version/operation/team）
- adapter-dsh：DSH seam 适配（7 端口，storage 是 core 唯一消费端口）
- bundle：装配声明（patch 覆写顺序，无运行时）
- web：界面层（BE-0a 工具链已接：tsdown/Typert；BE-0b-i client 半边装配）
- tools-pv：未创建（S1）

## 代码风格范式（写 core/adapter 代码前读对应样板，不重读全仓）
- 公共类型 Soloips 前缀；# 私有字段；错误码大写蛇形 SOLOIPS_CORE_*/ADAPTER_*；code 是契约 message 是中文可行动诊断
- 文件头块注释带稳定 ID（ORG-xx/SEAM-xx/P-9）+ 行号证据；行内〔约束〕〔实测〕〔待决〕标注
- exactOptionalPropertyTypes 条件展开：`...(x === undefined ? {} : { x })`；相对导入带 .js
- 提交门（commit-gate.ts）：意图落盘前有 precondition 钩子（BE-2 引入，唯一性判定范式）；串行槽位内
- 注释写不变量与理由，不写流水账；预言式的「下一步计划」注释不进门

## 关键入口（稳定 ID，行号随版本漂移仅辅助）
- SoloipsCoreService 读面/写面：contracts.ts 服务接口区（写面 kind 联合=BE-3 后含 team.* 四项）
- #resolveAppointmentScope：store.ts（三分支推断，BE-4 侦察报告有全调用点表）
- openSoloipsCompanyStore 顺序：lease→createStack→requireFacility→open→verifyAccountBinding→发布
- verifyAccountBinding：BE-1 账户绑定（global 槽判别联合 + 根级绑定元数据）
- P-4/P-5/P-6 团队协议：store.ts #evaluateLeadReference/#assertNoSecondTeamLead/#deactivateTeamsLedBy
- Typert host 分析面：根 tsconfig.host.json（paths + references 两者都需要，缺 references 会静默产出损坏 dts）
- 客户端构建管线：根 tsdown.config.ts（workspace 模式；client face 需 tsconfig.client.json）
- **Typert codec 契约版本（BE-0b-ii 实测，2026-09-18）**：`codec.create` 是 **0.1.6-alpha.2** 的形态，**alpha.1 产出的是 `codec.schema`**。fork 运行时（`packages/typert/loader/src/index.ts:277` 的 `requireStrictCodec`）**要求 `create` 是 function**——故 generator 与 protocol 必须与运行时同版本。
  - **各层实际版本（复核日 2026-09-18，勿混写）**：**main `669dac8` 仍钉 `0.1.6-alpha.1`**（根 `package.json` 的 generator/protocol 两行；`packages/web/src/index.ts` 的 `SOLOIPS_WEB_TOOLCHAIN` 常量同为 alpha.1）。升级到 alpha.2 的改动**在在途候选 `feat/BE-0b-ii-e2e` 内，尚未合并**。
  - 症状：宿主冷启动 stderr 报 `invocation "…" parameter codec has no create() factory`（**只发 warning、退出码不变**，只看 exit code 会漏掉），且服务未注册进 typert registry → 浏览器侧**不可能**调到。**排错法**：比对生成物字段（`grep 'schema:\|create:' lib/typert.remote-client.js`）与运行时要求。

## 构建与七门
- 门禁：pnpm run format:check/lint/typecheck/test/build/check:build-repro/check:delivery-load（根执行；真实 exit code 判成败，禁 | tail）
- `pnpm run verify` 是 **S0 脚本（fake adapter）**，不等于 CI 的 `verify` job、也不等于五门全集
- check:build-repro 在**脏工作区**（残留 lib/ 与 tsconfig.tsbuildinfo）会假红——先 `rm -rf packages/*/lib packages/*/tsconfig.tsbuildinfo` 再跑（2026-09-18 单变量实测：干净状态连跑两遍均绿）
- 主仓跑 test 前先 build（lib 产物依赖）；合并后主仓 install+build（卫生清单）
- worktree 清理：robocopy 空目录镜像法（Windows 长路径）
- CI：verify.yml 双 job（ubuntu Node24 / windows Node22 prebuild+MSVC），build 后各有 check:build-repro + check:delivery-load 步骤；分支保护必需检查只有 `verify`，**发布纪律要求双绿**（见 #35 裁定）
- **宿主「warning-only」失败模式（本项目已实测两次）**：DSH 对「entry 在树里但无法激活」**只发 warning、退出码不变**——只看 exit code 必漏。故：
  1. `check:delivery-load` 传 `--activation-log <宿主冷启动 stderr>` 时，**它做的是「失败诊断扫描」**——按固定措辞/格式在日志里找失败明细。**它不证明每个 entry 都激活**：空日志、失败总标题匹配但明细不匹配、格式无法识别，都可能返回「未发现失败」。**「没找到失败」不等于「都成功了」**（外审 F-04）。正向激活确认须另行绑定**本次启动 + 本次候选产物**，观测初始化完成与期望 entry/服务的实际存在并完成一次实际调用。
  2. 起实例验证时**必须读 stderr**，不能只看进程活着或 curl 200
  3. 另一例：删掉 client bundle 的物化步骤 → 冷构建 **exit 0** 但产物从 169 kB 缩到 2 kB 的空壳（rolldown 留成外部 require）——**构建绿 ≠ 产物对**

## 否定性结论（**易失效，使用前必须重核当前 main**）
〔纪律〕否定性结论只在**当时版本**成立；新增文件/方法即可推翻。**不得**把它们当稳定导航——需用时先重核（项目红线第 5 条：断言写入交付物前须核到职能层）。
- 〔2026-09-18 @669dac8 实测〕**当年那条已失效**：core 的 `getDepartment` / `listEmployees` / `listAppointments` / `listDocumentVersions` / `listAdministrators` **五个读方法已实现并合并**（BE-4a，PR #41）。「core 无此五方法」只对 @8abf815 及更早成立。
- 〔2026-09-17 @9282908 复核〕soloips 仓无 `drizzle.config`（drizzle-kit 未接线）。Drizzle 是既定迁 PG 路线的载体，接线属后续切片；**使用前须重核**。
