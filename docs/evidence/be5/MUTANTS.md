# BE-5 变异体清单与判据（D-3 落盘）

落盘日期：2026-09-18  来源：写手交付（指挥裁定落盘路径 docs/evidence/be5/）

## 判据（两道机器门，非人工阅读）

1. **门 1 可运行**：对变异体跑 `tsc -b packages/core`；类型不通过 → `TYPE-BROKEN`（**不算击杀**）。
2. **门 2 测试跑起来**：两个 spec 都必须出现在文件级结果里，且无 `Transform failed`/`Failed to load`/`Failed to parse` → 否则 `BROKEN`（失败发生在断言之前）。

判定式：`typecheck 失败 → TYPE-BROKEN`；`未完整收集 → BROKEN`；`exit=0 → SURVIVED`；`exit≠0 且有失败用例 → KILLED`。

> **重要修正**：「非 AssertionError」**不构成**破损判据。破损的判据是**错误来源**（能否编译、能否收集），不是**错误类型**——产品代码在「本应返回值」处抛错正是变异体造成的行为差异。初版曾把错误类型当破损信号，导致 12 条里 6 条被误判。

## 应用方式（可复现）

```bash
# 列出全部变异体
node docs/evidence/be5/mutate.mjs --list
# 逐体应用 / 跑测 / 判定 / 恢复（恢复后自动 sha256 比对）
node docs/evidence/be5/mutate.mjs
```

## 结果（本轮）

`12/12 KILLED，0 SURVIVED，0 BROKEN，0 TYPE-BROKEN，12/12 恢复后字节一致`。

## 上一轮声称的修正（诚实性记录）

上一轮报告称「12/12 全杀」——按严格判据**不成立**：其中 X1 实为 `TYPE-BROKEN`（`TS2339: Property 'companyId' does not exist on type 'never'`，因写成 `const filterDepartment = undefined;`）。已重写为真正的惰性读变异（把前置反解移到命中过滤键之后），本轮 `typecheck=clean` 并击杀 F-06(i) 与「介质故障 vs 分支 3 优先级」两条。

## 本片未做的

- **未做等价性判定**：12 条全部被击杀，没有存活体需要判定——是「无需判」而非「已判」。

## 与 QA 的独立结果对照

QA 自施 44 个变异体，其中 41 清洁、40 击杀、1 存活（经证明为等价变异 `QA-X2b`）。QA 的 X2c 只杀 F-06(ii)、X3b 只杀 F-06(i)；本清单的粗粒度 X2/X3 分别杀 (ii) / (i)+(ii)——**两者不矛盾，是粒度差异**（本清单 X3 在 F-06(ii) 的击杀点是该用例的**辅助对照**而非主断言）。
