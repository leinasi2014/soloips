# 知识包：BE-4 切片侦察（读投影+probe 入门）

〔性质：源码事实+落点表｜来源版本：BE-3 worktree（合并后=main@8961d93）｜稳定 ID：方法/函数名｜验证状态：读源确认｜失效条件：BE-3 合并后行号以 main 为准重定位；读面方法落地后本包缺口表失效〕

## 读面缺口（C-9 在 BE-3 后的残余）
须新增 5 方法（SoloipsCoreService，contracts.ts 服务接口区）：`getDepartment(id)` / `listEmployees(companyId|departmentId)` / `listAppointments(filter)` / `listDocumentVersions(employeeId)` / `listAdministrators(companyId)`（SA-01.1 显式状态契约最严：须区分「无总助理」与「查询失败」，不得空数组表达；查询名以此登记为准）。
已有勿重做：getTeam/listTeams（BE-3，listTeams 缺 departmentId 过滤——本片补 options 扩键）。

## 核心约束
- SoloipsEmployeeRecord 无 companyId/departmentId——员工↔公司关联只经 appointment，listEmployees 必须**两跳**（appointment.scope 解析）。
- scope 解析：`#resolveAppointmentScope`（BE-3 后约 store.ts:892-917，以 main@8961d93 重定位）三分支。四个调用点已有；新读面必须解析后过滤（organization-full-backend-design:95 候选人集依赖）。
- `listAdministrators` 判据复用 `#assertNoActiveGeneralAssistant` 口径（active+company scope+role）。
- getDepartment 返回 undefined（get* 惯例），不复用 #readDepartment（它抛 PRECONDITION，写路径辅助）。

## R-5 probe 入门（BE-4c 独立片）
- 现状：requestWorkEntry 的 probe/判定全在门外（store.ts:1625-1693 段），违反 R-5.1。
- 改法：删 1637-1656 外部 probe（门内 #commitLocked 自带同语义重放检测，行为等价）；1659-1670 判定移入 precondition。
- **结构性阻塞（已裁定）**：precondition 契约是 void 抛错，requestWorkEntry 拒绝是返回值——裁定走**门扩展**（precondition 可返回 `{ok:true}|{ok:false,refusal}`，#commitLocked 早退），与 BE-5 配额同构一次到位。哨兵异常方案否决。
- R-5.2：checkOnboarding 展示用查询保留不动；禁把其结果当提交依据传入。
- 既有 7 条相关用例全部语义兼容（侦察逐条判定过），需新增「判定与提交同槽位」结构证据用例。

## 形状校验（BE-4b 并入 4a）
- listDepartments 缺 companyId 校验（对比样板：listSubsidiaries/getCompanyTree/listTeams）。
- **口径已裁定**：get* 类统一补校验（ids.ts:66 注释为据），BE-4a 顺带补 getCompany/getEmployee/getAppointment/getDocumentVersion/getOperation 共 5 处各 3 行。

## 测试样板（新 spec：read-projection.spec.ts，勿追加 team-data）
- 样板：team-data.spec.ts 读面纪律组（介质快照/种子辅助/直读取用器范式）+ store.spec.ts persistence round-trip 挂点。
- 新增读方法不会破坏 store.spec.ts:339-354 的服务面断言（加法安全）。

## 量级（拆分依据）
A-F 主体 ≈330-520 源码行+300-460 测试行（共享 scope 解析路径，一片合理）；G=18 行并入；H（R-5）25-70 行独立片（门契约改动不得与读面混）。
