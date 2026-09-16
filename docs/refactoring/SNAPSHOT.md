# 重构文档入仓快照记录

| 阅读契约 | 内容 |
| --- | --- |
| 身份 | `SOLO-REFACTORING-SNAPSHOT`；外部需求正文的**入仓来源与保真记录**，非需求正文本身 |
| 目的 | 让接手者知道本目录 5 份正文从哪来、与来源的等价程度（4/5 原始字节一致、5/5 经行尾归一后一致）、如何复核，以及**哪些内容有意未入仓** |
| 范围 | 本目录 5 份正文的来源、哈希、保真方法与漂移处置；不重述其需求内容 |
| 决策状态 | 〔约束〕落实用户 2026-09-16 批准「复制 5 份重构文档入仓」；本记录不改写任何需求的含义 |
| 证据范围 | 2026-09-16 复制时点本机实测：源文件 SHA-256、字节数、逐文件比对结果；**未评审需求内容正确性** |
| 依据 | 用户 2026-09-16 指令；[环境交接 ENV-01/02/04](../../operations/environment-handoff.md)；[文档格式规范 §10](../governance/agent-readable-documentation.md) |
| 变更权 | 来源变化时按 ENV-04 在同一候选内刷新本记录与 5 份正文，另存新回执 |

---

## 1. 为什么入仓

`docs/technical-architecture.md`、`docs/architecture.md` 与 `docs/reference/*` 引用 `ORG-01–13`、`DEPT-01–04`、`LIB-01–11`、`AVATAR-64`、`DEP-*` 等需求 ID **近百处**，但在此之前**其正文只存在于本机一个被 gitignore 覆盖的外部目录**——换机、换人或 CI 环境即失去可追溯性。

来源目录（`REFACTORING_DOCS_ROOT`，按 [ENV-02](../../operations/environment-handoff.md) 解析）：

```text
REFACTORING_DOCS_ROOT 下的 docs/refactoring/
```

**该符号的实际绝对路径记录在 [ENV-01](../../operations/environment-handoff.md) 规定的本机记录中，不写在正文里。** 依据 `agent-readable-documentation.md` §6：可复用文档使用符号环境名，机器本地绝对路径写入本机记录、不进正文；本仓库为 public。

本文件是**入仓时编写的来源与保真说明**，不在 §2 的 5 份快照之内（那 5 份才是被比对对象），因此本处按规范改用符号名不影响那 5 份的等价性核对。

来源 `README.md:3` 记录：**「用户裁决（2026-09-15）：当前开发、修复和验收一切以重构文档为准；旧文档只作参考。」**

〔约束〕`docs/technical-architecture.md:1226`（附录 B 第 5 项）同样登记该裁决。**因此这些正文是验收权威**，而非一般参考资料——它们必须可在仓库内被读到。

---

## 2. 入仓的 5 份正文（保留来源指纹的 LF 规范化快照）

**保真口径（务必按本表理解，不要简化为"逐字节相同"）**：

- **来源原始值**：复制时来源文件的字节数与 SHA-256。
- **入库值**：`git` blob（入库后、经 `.gitattributes` 的 `* text=auto eol=lf` 规范化）的字节数与 SHA-256。**校验对象是 blob，不是工作树**——工作树在 Windows 上可能因 `core.autocrlf` 呈现 CRLF。
- **等价性**：`CRLF→LF(来源) == 入库 blob`，逐字节。**该归一化只删 CR，不顺带忽略空白、编码或 BOM 等其他任何差异。**

| 文件 | 来源字节数 | 来源 SHA-256 | 入库字节数 | 入库 SHA-256 |
| --- | ---: | --- | ---: | --- |
| `README.md` | 2435 | `ea8c9d461ae902d3abc6a0d45c24bc790c2fde13976ed8210326987826b26ea2` | 2435 | `ea8c9d461ae902d3abc6a0d45c24bc790c2fde13976ed8210326987826b26ea2` |
| `01-departments.md` | 18235 | `a9eb602c4fd74b22fcc7ab7e5fbb8e42ba0775de2ce12793cb7839bf16368365` | 18235 | `a9eb602c4fd74b22fcc7ab7e5fbb8e42ba0775de2ce12793cb7839bf16368365` |
| `02-company-contract.md` | 44934 | `a0fa595f2a5d13dba9a9fb37f988eea0c4a1536139235d7c55255b094ff18abf` | 44934 | `a0fa595f2a5d13dba9a9fb37f988eea0c4a1536139235d7c55255b094ff18abf` |
| `03-delivery-and-acceptance.md` | 5651 | `4eaf91e659d32c92e5b027f78655787e0f665e1e1e6bba2b42476c202014d4a4` | **5609** | **`f54487573a513e714b8f312daccf6bbeb067b9ffa4ae3e790b6defcb6fa4dd60`** |
| `04-avatar-64.md` | 2213 | `21d4fe9fd552aa9d411bb936316a44afb6e9f8bb2472be4ef58de59b557f6bbf` | 2213 | `21d4fe9fd552aa9d411bb936316a44afb6e9f8bb2472be4ef58de59b557f6bbf` |

**结论必须按此表述**：**4/5 原始字节一致；5/5 在仅作 CRLF→LF 归一化后逐字节一致。**

`03-delivery-and-acceptance.md` 的来源是 CRLF（42 处）。按 `.gitattributes` 的统一 LF 策略与 Issue #1 的已决裁决（**不为个例设 `eol` 例外**），入库时 42 个 CR 被删除，故其**入库值不等于来源原始值**；正文内容逐字节相同。

**〔更正记录〕** 本节先前的表述为"5/5 `IDENTICAL`、源 = 仓"——该表述在**未考虑行尾规范化**时成立，但作为入库后的保真声明**不准确**：`03` 入库后为 5609 字节，与来源 5651 不等。此处按实测更正，并保留更正痕迹。含义与处置见 §4。

**字节数注意（口径）**：上表为**字节数**。若按「行数」比对会得到不同数字（如 `02-company-contract.md` 为 **316 行**），两者都对，不可互相印证为矛盾。

### 2.1 复核方法（可重放）

复核需分别取来源与**入库 blob**（不是工作树）：

```powershell
$src = $env:REFACTORING_DOCS_ROOT
foreach ($f in @('README.md','01-departments.md','02-company-contract.md',
                 '03-delivery-and-acceptance.md','04-avatar-64.md')) {
  $a = (Get-FileHash "$src/$f" -Algorithm SHA256).Hash.ToLower()
  # 入库 blob：先按统一 LF 规范化，再算哈希
  $tmp = [IO.Path]::GetTempFileName()
  git cat-file blob "HEAD:docs/refactoring/$f" | Set-Content -LiteralPath $tmp -NoNewline -AsByteStream
  $b = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
  Remove-Item $tmp
  "{0,-34} src={1} blob={2}" -f $f, $a, $b
}
```

期望：`README`/`01`/`02`/`04` 的 `src` 与 `blob` **相等**；`03` 的 `src` 为 `4eaf91e6…`、`blob` 为 `f5448757…`——**这是已记录的预期差异**，来源经 `CRLF→LF` 后才与 blob 逐字节相等。出现其余差异即表示源已变化，按 §4 处置。

---

## 3. 有意未入仓的内容

来源目录共 8 份 Markdown。**仅 3 份未入仓**，逐项说明理由：

| 文件 | 字节数 | 未入仓理由 |
| --- | ---: | --- |
| `development-system.md` | 10124 | **操作指引**（任务传达、负责人、交付循环），非需求权威。仅*引用* `ORG-03/10/13`、`avatar-64`，**不定义**任何需求 ID（实测 `^\*\*(ORG\|DEPT\|LIB\|DEP\|AVATAR)-` 定义数 = 0） |
| `deepseek-v4.1-flash-allocation-and-recon.md` | 47089 | **模型分工与侦察数据**。来源 `README.md:21` 自述「侦察数据必须核对时效，**不能当运行验收**」；仅引用 `ORG-13`，定义数 = 0 |
| `optimization-experience.md` | 29302 | **条件化参考经验**。来源 `README.md:22` 自述「**不授予开发或验收权威**」；定义数 = 0 |

**判定依据**：入仓目的是恢复**需求的可追溯性**，而需求 ID 的**定义**只存在于已入仓的 5 份。上述 3 份不定义需求，且其自身的来源声明即限定「不授予权威」。

### 3.1 已知代价：`README.md` 中的 3 条链接

入仓的 `README.md:20-22` 链接到上述 3 份未入仓文件。因**保持快照不被改写**（§2）而未改动该文件，这 3 条链接在仓库内为**断链**。

| 断链位置 | 目标 | 状态 |
| --- | --- | --- |
| `README.md:20` | `development-system.md` | 未入仓 |
| `README.md:21` | `deepseek-v4.1-flash-allocation-and-recon.md` | 未入仓 |
| `README.md:22` | `optimization-experience.md` | 未入仓 |

**这是有意取舍，不是遗漏**：改写 `README.md` 会使它不再等于来源，§2 的等价性核对随之失效（该文件现为 4/5 原始字节一致之一）。**若需要这 3 份内容，应当整体入仓（保留链接有效），而不是改写 README。**

---

## 4. 漂移处置（源变化时）

〔约束〕按 ENV-04「候选或范围变化后另存新回执，保留旧回执的原范围」：

1. **不要静默覆盖**本目录正文。先重算两侧哈希，确认哪一侧变了。
2. 若**源**变化：把新版本作为**新候选**入仓，在同一候选内更新 §2 的表与本记录，并说明变化范围；**保留旧哈希行作为历史**。
3. 若**仓**变化（有人直接改了本目录正文）：这与 §2 的等价性声明冲突。**先核对是否为有意修订**——有意修订须在本记录登记并说明理由，否则应回退。注意：**入库时的 CRLF→LF 规范化已使 `03` 的入库值不等于来源原始值**（§2 表已记录），该差异不是漂移。
4. 任何情况下**不得**用「源看起来更新」推断需求已变更；需求变更须回到来源裁决（`README.md:3` 的裁决主体是用户）。

---

## 5. 格式豁免依据（显式记录）

本目录 5 份正文**没有** `agent-readable-documentation.md` §1 的阅读契约表。依据该规范：

- **§10**：「本规范适用于**新增或实质性修订**的、承载决策的章节。**不要求为满足格式而整体重排历史文档。**」本目录是**复制的历史正文**（内容未改写；`03` 仅行尾按统一 LF 策略规范化），非新增或修订内容。
- **§10 末段**：其使用的 〔需求〕〔约束〕〔建议〕〔待决〕〔源码事实〕〔推断〕〔未验证〕 标签与本规范一致，**可直接沿用**——故无需改标注。
- 本条豁免与 `docs/design/r002/doc-review/review.md` 的 S-10/S-11 同类，按该审查的建议「在 registry 或文首**显式记录豁免依据**」执行。

---

## 6. 边界声明

- **已验证**：5 份文件的字节数与 SHA-256（源、仓两侧）；源目录存在性；3 份未入仓文件的「定义数 = 0」；来源 `README.md` 的两条自述。
- **未执行**：未评审需求内容的正确性或一致性；未核实 `REFACTORING_DOCS_ROOT` 之外是否还有其他需求来源；未修改任何来源文件。
- **不证明**：入仓不使需求「已实现」，也不构成实施授权（`docs/design/r002/baseline/baseline.md` §6 的 A1–A8 仍有效）。本记录不改变任何需求的含义或效力。
