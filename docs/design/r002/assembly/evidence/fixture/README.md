# 探针 fixture 重建配方

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-R002-ASSEMBLY-FIXTURE`；`assembly/` dump 组合门禁的 fixture 重建说明，**非稳定权威** |
| 目的 | 让洁净检出者能从入库材料重建探针 fixture home，从而重放 `check-composition.mjs` 门禁 |
| 范围 | `evidence/fixture/home/` 的用途、重建步骤、与 `evidence/probe-log.md` 的关系；不含门禁判据正文 |
| 决策状态 | 〔提案〕随 `docs/design/r002/` 整体为设计候选 |
| 证据范围 | **已验证**：按 §2 步骤重建后与原始 fixture **逐字节相同**（100/100 文件、0 哈希差异、0 缺失、0 多余）。**未验证**：重建后跑 `check-composition.mjs` 的输出是否与 `gate-*.txt` 一致（未执行） |
| 依据 | [assembly/design.md](../../design.md) §6.8、[evidence/probe-log.md](../probe-log.md)、[代码规范 DEV-02/13](../../../../../governance/code-development-standard.md) |
| 变更权 | 按注册表 `documentId: r002-design-index` 的 `relatedPaths` 归属维护 |

## 1. 为什么需要这份配方

`check-composition.mjs` 的运行契约要求 fixture home 具备如下结构：

```text
<home>/
  cordis.patch.yml
  profiles/
    <profile>/
      package.json
      cordis.patch.yml
      cordis.yml                 # 由 --dump-config 重写，非手工维护
      baselines/
        L1.golden.txt            # 门禁查找路径
        L2.golden.txt
      node_modules/
        <synthetic stub packages>   # 7 个 profile 各自的 stub 集合
```

原始 fixture 共 **100 个文件**，其中 **64 个位于 `node_modules/`**。仓库根 `.gitignore` 的 `node_modules/` 规则会静默排除它们——若直接入库整棵树，交付的 fixture 会**残缺且误导**（门禁因缺 stub 而失败，且失败原因不可见）。故采用「非 `node_modules` 的 36 个文件入库 + 64 个 stub 由 manifest 逐字节还原」的方案。

## 2. 重建步骤

从仓库根执行（Windows PowerShell）：

```powershell
# 1) 复制入库的 fixture 非 node_modules 部分（36 个文件）
$fx = "$env:TEMP/r002-fixture-home"
Remove-Item -Recurse -Force $fx -ErrorAction SilentlyContinue
Copy-Item -Recurse "docs/design/r002/assembly/evidence/fixture/home" $fx

# 2) 从 manifest 逐字节还原 node_modules 下的 stub 包（64 个文件）
node docs/design/r002/assembly/evidence/fixture/rebuild-stubs.mjs $fx
```

重建后 `<home>/profiles/soloips-ref/baselines/{L1,L2}.golden.txt` 位于门禁查找路径上，fixture 与原始状态一致。

## 3. 重建保真度（已验证）

`stubs.manifest.json` 由**原始 fixture 直接生成**（不是按形状猜测重建），因此还原是逐字节的。集成者实测：

```text
orig files: 100   rebuilt files: 100
missing: 0        extra: 0        hash diffs: 0
```

比对方法：`Copy-Item` 入库的 36 文件 → 跑 `rebuild-stubs.mjs` → 对原始目录 100 个文件逐个 `Get-FileHash -Algorithm SHA256` 比对。

## 4. 已知边界（不隐藏）

1. **重建后未跑门禁。** 保真度已证（§3），但「重建后 `check-composition.mjs` 的输出与 `gate-*.txt` 一致」**未经验证**。需要该级证据时，应由获授权的实现切片执行并在本文件补记回执。
2. **`cordis.yml` 会被 `--dump-config` 重写。** 入库副本是原始探针运行后的状态；重放时它会被再次重写，属预期行为（见 `design.md` §6.2.1/§6.8）。
3. **golden 基线同时保留在 `evidence/baselines/`**（便于直接查阅），与 `evidence/fixture/home/profiles/soloips-ref/baselines/` 内容相同。门禁读取后者。

## 5. 与 `design.md` §6.8 的关系

`design.md` §6.8 声明门禁「可重放」。本配方是该声明在**交付层面**的补强：输出证据已全部入库（`probe/*.txt`、`gate-*.txt`、`baselines/*.golden.txt`），fixture 可逐字节重建，故「可重放」声明在材料完整性上成立。剩余未证项仅为 §4 第 1 条（重建后实跑门禁），属**运行验证**，按基线 §6 未授权项处理。
