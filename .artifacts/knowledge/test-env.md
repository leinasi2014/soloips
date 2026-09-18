# 知识包：测试环境档案

〔性质：方法（长期）+ 一次性探测结果（会过期）｜来源版本：main@9282908 验收实践｜失效条件：目录约定/工具链变化〕

## 稳定方法（长期有效）
- 验收五步：基线快照（主仓先 build 再 test；记 HEAD/用例数）→ 八门重跑（真实 exit code）→ 清单核销（每项带命令/行号证据）→ 边界探针 → 变异测试（主动报存活=盲区）
- 日志根：D:/tmp/soloips-qa/logs/<切片>/；沙箱：D:/tmp/soloips-mut/（tar/junction 复制，**禁对 node_modules 做 rename/delete——junction 穿透会改真实 worktree**）
- 用例级零删改比对：vitest --reporter=json 两边跑 → 全名 diff（删除必须=0）
- 变异判定三门：typecheck+lint+test；每体先还原校验字节一致
- 真实介质探针模板：D:/tmp/soloips-qa/probe-be1-real-medium.mjs / probe-be3-real-medium.mjs（借 packages/adapter-dsh/node_modules 解析 better-sqlite3，跑完删）
- 测试样板：team-data.spec.ts（读面纪律/介质快照/种子辅助范式）；store.spec.ts（persistence round-trip 挂点）；scope-role.spec.ts（形状校验/存量兼容范式）

## 一次性探测结果（引用前必现场复核）
- 〔2026-09-18〕主仓 182 用例/19 文件@9282908——引用前重跑确认（或查知识包 INDEX 基线表最新绑定版本）
- CI verify 双 job 在 build 后跑 check:build-repro（BE-0a 接线）
- windows CI：Node 22（better-sqlite3 prebuild）+ msvc-dev-cmd；ubuntu Node 24

## 验收纪律
- 不采信写手自报数字；写面白名单 git status 对照；「拒绝零业务写+零 pending」用介质快照 deep-equal 断言（M2 范式）
- 探针/临时文件跑完必删（git status 恢复原状复核）
