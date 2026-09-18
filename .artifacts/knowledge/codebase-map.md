# 知识包：代码库地图

〔性质：源码事实+约定｜来源版本：main@9282908｜验证状态：读源确认｜失效条件：包结构/风格大改〕

## 包职责（5 包）
- core：组织结构+文档模型唯一写权威（六表：company/department/employee/appointment/document_version/operation + BE-3 新增 team）
- adapter-dsh：DSH seam 适配（7 端口，storage 是 core 唯一消费端口）
- bundle：装配声明（patch 覆写顺序，无运行时）
- web：界面层（BE-0a 工具链已接：tsdown/Typert；BE-0b-i client 半边在途）
- tools-pv：未创建（S1）

## 代码风格范式（写 core/adapter 代码前读对应样板，不重读全仓）
- 公共类型 Soloips 前缀；# 私有字段；错误码大写蛇形 SOLOIPS_CORE_*/ADAPTER_*；code 是契约 message 是中文可行动诊断
- 文件头块注释带稳定 ID（ORG-xx/SEAM-xx/P-9）+ 行号证据；行内〔约束〕〔实测〕〔待决〕标注
- exactOptionalPropertyTypes 条件展开：`...(x === undefined ? {} : { x })`；相对导入带 .js
- 提交门（commit-gate.ts）：意图落盘前有 precondition 钩子（BE-2 引入，唯一性判定范式）；串行槽位内

## 关键入口（稳定 ID，行号随版本漂移仅辅助）
- SoloipsCoreService 读面/写面：contracts.ts 服务接口区（写面 kind 联合=BE-3 后 14 项含 team.*）
- #resolveAppointmentScope：store.ts（三分支推断，BE-4 侦察报告有全调用点表）
- openSoloipsCompanyStore 顺序：lease→createStack→requireFacility→open→verifyAccountBinding→发布
- verifyAccountBinding：BE-1 账户绑定（global 槽判别联合）
- P-4/P-5/P-6 团队协议：store.ts #evaluateLeadReference/#assertNoSecondTeamLead/#deactivateTeamsLedBy

## 构建与五门
- 五门+三门：pnpm run format:check/lint/typecheck/test/build/verify/check:build-repro/check:delivery-load（根执行；真实 exit code 判成败，禁 | tail）
- 主仓跑 test 前先 build（lib 产物依赖）；合并后主仓 install+build（卫生清单）
- worktree 清理：robocopy 空目录镜像法（Windows 长路径）
- CI：verify.yml 双 job（ubuntu Node24/windows Node22 prebuild+MSVC），build 后各有 check:build-repro 步骤

## 高风险否定性结论（依赖当时的搜索范围，新增文件可推翻）
- 〔2026-09-18 BE-4 侦察〕core 无 getDepartment/listEmployees/listAppointments/listDocumentVersions/listAdministrators 读方法（将随 BE-4a 落地失效）
- 〔2026-09-17〕soloips 仓无 drizzle.config（drizzle-kit 未接线，动态表名不适用）
