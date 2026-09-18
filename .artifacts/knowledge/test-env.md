# 知识包：测试环境档案

〔性质：方法（长期）+ 一次性探测结果（会过期）｜来源版本：main@8abf815｜失效条件：目录约定/工具链变化〕

## 稳定方法（长期有效）
- **验收深度按风险选择**（#35 §8）：L 轻量=差异/引用核查+相关格式检查+PR CI；M 标准=正向/边界/错误/空态+相关回归+按需真实接口；H 强化=与风险匹配的并发/重放/拒绝副作用/真实后端或浏览器/负向接线。**不再默认全套五步**；修复后只复验原失败项与受影响回归。
   - 五步（基线/多门/清单核销/边界探针/变异）仍是可用的**深度选项**，用于 H 级或关键断言鉴别力存疑时；不是每片例行。
- 日志根：D:/tmp/soloips-qa/logs/<切片>/；沙箱：D:/tmp/soloips-mut/（tar/junction 复制，**禁对 node_modules 做 rename/delete——junction 穿透会改真实 worktree**）
- 用例级零删改比对：vitest --reporter=json 两边跑 → 全名 diff（删除必须=0）
- 变异判定三门：typecheck+lint+test；每体先还原校验字节一致；**报告须区分语义失败/仅类型或语法失败/等价变异，不把全部算成功杀死**；变异体数量不是交付目标
- 真实介质探针模板：D:/tmp/soloips-qa/probe-be1-real-medium.mjs / probe-be3-real-medium.mjs（借 packages/adapter-dsh/node_modules 解析 better-sqlite3，跑完删）
- 测试样板：team-data.spec.ts（读面纪律/介质快照/种子辅助范式）；store.spec.ts（persistence round-trip 挂点）；scope-role.spec.ts（形状校验/存量兼容范式）
- 证据记录最小集：runId/对象 SHA/环境标识/实际命令/exitCode/计数/日志位置（详见 #35 §8.4）

## 一次性探测结果（引用前必现场复核）
- 〔2026-09-18 @8abf815〕主仓七门干净状态全绿：240 用例/20 文件；日志 `.artifacts/logs/baseline-8abf815/`
- CI verify 双 job 在 build 后跑 check:build-repro + check:delivery-load
- windows CI：Node 22（better-sqlite3 prebuild）+ msvc-dev-cmd；ubuntu Node 24

## 验收纪律
- 不采信写手自报数字；写面白名单 git status 对照；「拒绝零业务写+零 pending」用介质快照 deep-equal 断言（M2 范式）
- 探针/临时文件跑完必删（git status 恢复原状复核）
- **假覆盖检测（BE-4a 实证，最危险的测试缺陷）**：用例标题声称测 X，实际测的是 Y（异常在到达目标代码前就抛出）。检测法：**在目标函数入口插桩计数**——BE-4a 实测旧用例的目标路径进入次数 = 0，新用例 = 1。**只看「测试绿」无法发现假覆盖**；变异测试才是解药
- **变异体必须双向验证**：既要在候选套件下**击杀**（证明有鉴别力），也要在**禁用该断言的实现下存活**（证明它测的是那份代码）。BE-4a 用 `if (false && ...)` 临时禁用实现核对点，观测到 2 failed，才是完整闭环
- **等价变异体判别**：存活的变异体若可证明**不可区分**（输出恒等），属等价变异体、不必补测——须给出证明（BE-4a 的 M5：两条过滤路径都强制同一值，故取首条与取末条恒等）
- **vitest `-t` 的陷阱**：参数按**正则**解释，标题里的 `+`/`(` 等元字符会静默匹配 0 条并 **exit=0**（伪造 PASS 行）。单测隔离时用无元字符片段，并核对 `N passed | M skipped` 的计数
- **沙箱必装逐包 node_modules**：只链根 `node_modules` 会让 adapter-dsh 套件因 `@deepseek-ai/*` 解析失败而假红（BE-4a R2 实测：228 vs 284）
