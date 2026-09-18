/**
 * SOLOIPS-CORE-CONTRACTS
 *
 * soloips-core 自己拥有的服务契约（浏览器安全 DTO/类型 + 常量，无运行时依赖）。
 *
 * 依据：docs/design/r002/adapter/contracts-design.md §7.3——core 的服务契约
 * （业务命令、查询投影）由 core 自己的 src/contracts.ts 拥有，adapter 不感知；
 * web Client（T07）与 tools-pv 只经本入口消费类型。
 *
 * 不变量：
 *  - 本文件不 import 任何 `@deepseek-ai/*` 包（DEV-04）；类型与常量之外无运行时。
 *  - 持久记录形状（*Record）在此声明为唯一维护来源（DEV-05 schema 纪律），
 *    src/domain.ts 的 valueSchema 与本文件一一对应，不另写第二份字段清单。
 *  - 所有跨边界数据均为纯 JSON 值；不携带 domain handle、路径或凭据。
 *
 * 需求锚点：docs/refactoring/02-company-contract.md ORG-03/05/06；
 * docs/technical-architecture.md SOLO-FENCE-01、SOLO-ACC-02/04/05。
 */

// ─────────────────────────────────────────────────────────────────────────────
// §0 常量
// ─────────────────────────────────────────────────────────────────────────────

/** core 在 loader 树中的稳定服务名（与 adapter 的 soloipsAdapter 同一命名风格）。 */
export const SOLOIPS_CORE_SERVICE_NAME = "soloipsCore";

/**
 * 业务 domain 名。T03 冻结（packages/core/cordis.patch.yml 注释预留）。
 *
 * 显式且不可配置：域名是唯一 opener 与跨进程独占核对的对象
 * （SOLO-FENCE-01 / MECH-05），可配置的域名会制造别名绕过。
 */
export const SOLOIPS_COMPANY_DOMAIN_NAME = "soloips_company";

/** 业务 domain 的当前格式版本；schema 变化时递增并声明兼容边界（DEV-08）。 */
export const SOLOIPS_COMPANY_DOMAIN_VERSION = 1;

/**
 * operation 台账记录的 **kind 词表版本**（BE-002 / BE-3 实现）。
 *
 * 取值口径（本切片裁定，data-contract §2.1「取值口径与版本戳机制留 BE-2/BE-3
 * 实现裁定」）：**单调递增的正整数，只随 `SoloipsOperationKind` 的扩展递增**。
 * 当前为 `1`（词表含 10 项存量 + 4 项 BE-3 新增 `team.*`）。
 *
 * 为什么不用「每次 schema 改动都递增」：本字段的语义是「用哪个版本的 kind
 * 词表解释这条记录」（data-contract §2.1 原文），而它服务的唯一问题是
 * 「kind 联合扩展后旧记录是否可读」。domain 版本位（
 * `SOLOIPS_COMPANY_DOMAIN_VERSION`）与 unit version 戳是**另一套**机制
 * （§2.3 P1，属后续切片）——两者不共用递增规则，见 `SoloipsOperationRecord`
 * 的兼容策略注释。
 */
export const SOLOIPS_OPERATION_SCHEMA_VERSION = 1;

/**
 * 占位账户名：BE-1 之前 `createCompany` 硬编码写入的 `accountId`（历史数据标记）。
 *
 * 〔约束〕不得作为部署账户使用：`SoloipsCoreConfig.accountId` 与
 * `openSoloipsCompanyStore` 的 `accountId` 都拒绝该值。根内存在该账户的公司记录
 * 即按「存量占位数据」处置——**不认领、不自动改归**（data-contract §3.1）。
 */
export const SOLOIPS_PLACEHOLDER_ACCOUNT_ID = "seed";

// ─────────────────────────────────────────────────────────────────────────────
// §1 身份（core 自有品牌类型；构造只能经 src/ids.ts 的受控工厂）
// ─────────────────────────────────────────────────────────────────────────────

declare const soloipsCoreBrand: unique symbol;

/** core 自有的不透明 id 品牌；对外仅当作不可构造的字符串别名。 */
export type SoloipsCoreId<Name extends string> = string & { readonly [soloipsCoreBrand]: Name };

export type SoloipsCompanyId = SoloipsCoreId<"company">;
export type SoloipsDepartmentId = SoloipsCoreId<"department">;
export type SoloipsEmployeeId = SoloipsCoreId<"employee">;
export type SoloipsAppointmentId = SoloipsCoreId<"appointment">;
export type SoloipsDocumentVersionId = SoloipsCoreId<"document-version">;

/**
 * 团队 id（BE-2 登记品牌；`team` 表本体属 BE-3，本切片**不建表**）。
 *
 * 存在的理由：`SoloipsAppointmentScope` 的 `kind: 'team'` 分支要指向团队
 * （data-contract §2.3「`kind: 'team'` 的引用目标 = `teamId`，**不是** `teamBindingId`」——
 * C-6 裁定 M0.1 不建 `TeamBinding`，若指向绑定层，团队级任职在 M0.1 无法表达）。
 * 品牌先落地使契约类型自洽；构造/校验同样经 src/ids.ts 的受控工厂。
 */
export type SoloipsTeamId = SoloipsCoreId<"team">;

/** 稳定操作键：贯穿提交、结果与恢复（DEV-08 / ORG-05）。 */
export type SoloipsOperationId = SoloipsCoreId<"operation">;

// ─────────────────────────────────────────────────────────────────────────────
// §2 枚举与 JSON 载荷
// ─────────────────────────────────────────────────────────────────────────────

/** ORG-03 要求「文件实际保存且内容有效」的四类必需文档。 */
export type SoloipsRequiredDocumentType = "profile" | "avatar" | "soul" | "operating";

/** 文档类型：四类必需个人文档 + 作品版本（SOLO-ACC-05 的「已保存作品版本」）。 */
export type SoloipsDocumentType = SoloipsRequiredDocumentType | "work";

/** 公司类型：区分 SoloIPS 平台/运营公司与用户公司/子公司 */
export type SoloipsCompanyType =
  | "platform" // SoloIPS 平台公司（SoloIPS 官方）
  | "operation" // SoloIPS 运营子公司（SoloIPS 官方，业务平台如漫画/视频网站）
  | "enterprise" // 用户企业公司（用户创建）
  | "subsidiary"; // 用户子公司（用户创建，属于用户企业公司）

/**
 * SOLO-ACC-04 要求三条工作路径共用同一准入判定：
 * (a) 经理显式派单；(b) 员工自领；(c) 自动调度器分配。
 */
export type SoloipsWorkEntryOrigin = "manager-dispatch" | "self-claim" | "scheduler-assign";

export type SoloipsAppointmentStatus = "active" | "revoked";

/**
 * 团队状态（**四值**，BE-3 裁定，data-contract §2.1「字段形态留 BE-3 裁定」）。
 *
 * 四值直白承载语义四分（契约把「不可用」的**语义**写死、把**字段形态**留给本
 * 切片，见 §2.1 的 `status` 注与 §2.1.1 P-6 的「或等效的显式标记」）：
 *
 * | 值 | 语义 | 读面（P-3/P-8.2/P-9.1 同一判据） |
 * |---|---|---|
 * | `pending` | **成团中间态**：记录已建、组长任职未建或未验证（P-9 第①步后、第③步前） | **不得**出现在可用结果中 |
 * | `active` | **可用**：组长引用满足 P-4 四项且未归档 | 可出现在可用结果中 |
 * | `inactive` | **不可用**：无有效组长（撤职未换任 P-6，或引用悬挂未修复 P-8） | **不得**出现在可用结果中 |
 * | `archived` | **归档**：`team.close` 后的终态，只读保留供追溯（P-7） | 不参与 P-8 扫描（P-8.6） |
 *
 * 〔为什么另立第四值而不是「由组长引用有效性导出」〕契约允许两者之一，本切片
 * 选**显式第四值**，理由三条：
 *  1. **可区分成因**（P-9.4 要求）：`pending` 与「成团后组长失效」都不得读作
 *     可用，但**成因与恢复路径不同**（`pending` 走续做/收敛，`inactive` 走
 *     修复/换任）。若把不可用「导出」自引用有效性，读面只能回答「不可用」，
 *     回答不了「为什么」——而 P-8.5 明确要求不可用必须以显式状态呈现。
 *  2. **落盘即事实**：`inactive` 是 P-8.1 扫描的**结果**（只标记、不自动修复，
 *     P-8.3）。它是恢复流程写下的持久事实，不是每次读都重算的派生值——
 *     派生值无法承载「扫描已执行过」这一审计信息。
 *  3. **新表无存量**：`team` 表由本切片首次创建，**没有**存量记录需要兼容，
 *     故不存在「多一个值就要迁移」的代价（对比 `appointment.scope` 为何先可选）。
 *
 * 〔P-9.3 约束〕`active` 只能由 `team.activate` 写入：**没有**任何命令可以
 * 「直接改 `status`」（`team.update-function` 不碰 status，`team.close` 只写
 * `archived`）。
 */
export type SoloipsTeamStatus = "pending" | "active" | "inactive" | "archived";

/**
 * 团队职能来源（审计「谁定义了职能」）。
 *
 * 〔约束〕**枚举扩展〔待决 M0.2+〕**：`'user'`/`'template'`/`'import'` 等来源
 * **尚未裁定**——未裁定前实现**不得**自行新增取值（data-contract §2.1 原文）。
 */
export type SoloipsTeamFunctionSource = "leader-defined" | "system-suggested";

/**
 * 任职作用域（判别联合）——区分公司级、部门级、团队级任职。
 *
 * 〔约束〕**三分支各自携带 `companyId`**（data-contract §2.1 原文）：作用域比较
 * （「目标资源是否在该任职作用域内」，L4 scope 检查）与「同公司」判定都直接读
 * `scope.companyId`，不需要先反查部门/团队记录——部门级/团队级任职因此也能通过
 * 公司归属校验，而不是只认公司级任职。
 *
 * 〔约束〕`kind: 'team'` 指向 `teamId`（**不是** `teamBindingId`）：M0.1 只落纯
 * 数据层 Team、不建 `TeamBinding`（C-6），指向绑定层会让团队级任职在 M0.1 无法表达
 * （data-contract §2.3）。
 */
export type SoloipsAppointmentScope =
  | { readonly kind: "company"; readonly companyId: SoloipsCompanyId }
  | {
      readonly kind: "department";
      readonly companyId: SoloipsCompanyId;
      readonly departmentId: SoloipsDepartmentId;
    }
  | { readonly kind: "team"; readonly companyId: SoloipsCompanyId; readonly teamId: SoloipsTeamId };

/**
 * 任职角色（五值，data-contract §2.1）。
 *
 * 〔约束〕本词表与 DSH 官方 roster 的 `'lead' | 'teammate'` **分属两层、不得混用**
 * （core 任职 vs DSH Team roster）；core 记录里不得写 `'lead'`/`'teammate'`。
 */
export type SoloipsAppointmentRole =
  /** 公司所有者（账户级）。 */
  | "owner"
  /** 总助理（公司级）；同公司同时至多一条有效（data-contract §2.4.2）。 */
  | "general_assistant"
  /** 部长（部门级）。 */
  | "department_lead"
  /** 团队组长（团队级）。 */
  | "team_lead"
  /** 普通成员。 */
  | "member";

/**
 * 本切片实际存在的持久写操作种类；用于恢复核对与 operationId 冲突检测。
 *
 * 〔BE-3〕新增 `team.*` 四项（`team.create` / `team.update-function` /
 * `team.activate` / `team.close`）。**四处同步点**（缺一即不一致，见
 * `docs/prds/system-assistant-backend-design-v0.1.md` BE-3 行的「三处同步」）：
 *  1. 本联合（kind 词表的权威）；
 *  2. `src/domain.ts` 的 `SOLOIPS_PERSISTED_OPERATION_KINDS`——持久校验器的
 *     词表（经 `openLiteralUnionSchema` 放宽为开放词表：**未知项也放行**，
 *     故漏改不会让新 kind 写入失败，而是让它被读作「未知」——所以这一处的
 *     同步义务必须由测试断言「与联合双向相等」来承担）；
 *  3. `src/store.ts` 的命令实现——每个 kind 必须有一个服务方法与一个已登记的
 *     `#gate.commit({kind})` 调用点（§2.5 边界 2：无 kind 的动作不得暴露为写工具）；
 *  4. `src/commit-gate.ts` 的 `KNOWN_OPERATION_KINDS`——「能否当作可重放结果
 *     返回」的运行期判据（未知 kind 只能按 `unknown` 处置）。
 * 第 2、4 处都是「运行期投影」，两处均以 `as const satisfies readonly
 * SoloipsOperationKind[]` 钉住「清单 ⊆ 联合」，并由测试对**双向相等**做断言
 * （漏项 = 自己刚写的操作重放时返回 unknown；多出假项 = 把不认识的 kind 当
 * 已知项，两者都是可观察失败）。
 *
 * 〔读面不产生 kind〕`listTeams` / `getTeam` 是查询，**不创建 operation**
 * （§2.5 表内读面各行；BE-3 验收⑤）。
 *
 * 〔`team.activate` 为什么独立成 kind〕P-9.3 要求「`activate` 是唯一的
 * pending→可用 通道」：把它折进 `team.update-function` 会让「改职能」顺带
 * 完成成团，从读面看「一个操作做了两件事」，也让 P-9.3 在 kind 层不可核对。
 */
export type SoloipsOperationKind =
  | "company.create"
  | "department.create"
  | "employee.create"
  | "appointment.create"
  | "appointment.revoke"
  | "employee.initialize-memory"
  | "employee.verify-capability"
  | "employee.record-assembly"
  | "document.save"
  | "work-entry.request"
  /** ① 建团队记录（`status='pending'`，**无组长**——P-9 第一步）。 */
  | "team.create"
  /** 改团队职能定义（不改变 `status`；**不得**越过 P-9.3 完成成团）。 */
  | "team.update-function"
  /** ③ `pending` → 可用（P-4 四项校验通过才转；**唯一**的成团通道，P-9.3）。 */
  | "team.activate"
  /** 归档（`→ archived` 终态）；**不是删除**——P-7 禁物理删除。 */
  | "team.close";

declare const soloipsUnknownKindBrand: unique symbol;

/**
 * 当前代码**不认识**的 kind 值（未来版本的词表项，被本版本代码读到）。
 *
 * 〔为什么需要这个类型〕`SoloipsOperationKind` 是**封闭联合**，而它只描述
 * 「本版本能**发起**的操作」。台账里可能存有**未来版本**写入的记录（数据根被
 * 新版本写过、又用旧版本打开；或升级回退）。若把 `kind` 的类型直接钉死为封闭
 * 联合，读取这类记录只有两条路：判损坏（→ 恢复锚点丢失，违背 §2.1 的
 * 「读不懂不等于可忽略」）或静默丢弃（更坏）。故读面的 `kind` 是**开放**的。
 *
 * 〔品牌而非 `string`〕刻意**不用** `string`：那会让「拼错的 kind」（如
 * `"team.creat"`）在类型层与「未来版本的真实 kind」不可区分，写路径的拼写
 * 错误就会静默通过。本类型带品牌，**只能**由持久校验器（`src/domain.ts` 的
 * `operationKindSchema`，唯一收窄点）产出；写路径的 `kind` 仍是封闭联合
 * （`SoloipsCommitRequest.kind`），拼错即编译失败。
 */
export type SoloipsUnknownOperationKind = string & {
  readonly [soloipsUnknownKindBrand]: "unknown-operation-kind";
};

/** 读面 `kind` 的类型：本版本已知的词表 ∪ 未来版本的未知项。 */
export type SoloipsOperationKindValue = SoloipsOperationKind | SoloipsUnknownOperationKind;

export type SoloipsOperationStatus = "pending" | "committed";

/** 可持久载荷：纯 JSON 值（意图与结果都以此为约束，杜绝函数/句柄入介质）。 */
export type SoloipsJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SoloipsJsonValue[]
  | { readonly [key: string]: SoloipsJsonValue };

/** 操作意图：恢复核对（「查同操作已有结果」）所需的最小 JSON 记录。 */
export type SoloipsOperationIntent = Readonly<Record<string, SoloipsJsonValue>>;

/** 操作结果：已提交操作的幂等重放载荷。 */
export type SoloipsOperationResult = Readonly<Record<string, SoloipsJsonValue>>;

/**
 * 命令结果约束：所有经提交门的结果必须是 JSON 记录，
 * 这样重放（operationId 命中已提交记录）才能不丢失类型地返回原结果。
 */
export type SoloipsCommandResult = Readonly<Record<string, SoloipsJsonValue>>;

// ─────────────────────────────────────────────────────────────────────────────
// §3 持久记录（valueSchema 的唯一类型来源；字段逐项锚定见 src/domain.ts 注释）
// ─────────────────────────────────────────────────────────────────────────────

// 注：持久记录用 type 别名（非 interface）声明——valueSchema 组合子
// objectSchema 的约束依赖对象字面量类型的隐式索引签名（TS 行为，非业务规则）。

export type SoloipsCompanyRecord = {
  readonly id: SoloipsCompanyId;
  /** 直接归属账户（隔离条件） */
  readonly accountId: string;
  /** 父公司（无则为顶层公司） */
  readonly parentCompanyId?: SoloipsCompanyId;
  /** 公司类型 */
  readonly type: SoloipsCompanyType;
  readonly name: string;
  readonly status: "active" | "archived";
  readonly createdAt: string;
};

export type SoloipsDepartmentRecord = {
  readonly id: SoloipsDepartmentId;
  readonly companyId: SoloipsCompanyId;
  readonly name: string;
  /**
   * 部门负责人（部长）的任职引用——「部门记录指向任职」而非指向员工：
   * 通过任职表达更灵活（data-contract §1.1 裁定，取代 `leaderEmployeeId`）。
   *
   * 〔约束〕可选：部门可存在而**无部长**，「首任无部长态」是合法中间状态
   * （ORG-02 / `02-company-contract.md` §11.2 的 `awaiting_manager`）。
   *
   * 写入方：`createAppointment` 在 `role === "department_lead"` 且
   * `scope.kind === "department"` 时**回填**（BE-2 部长链）。
   */
  readonly leaderAppointmentId?: SoloipsAppointmentId;
};

export type SoloipsEmployeeRecord = {
  readonly id: SoloipsEmployeeId;
  readonly displayName: string;
  /** 当前引用：员工只持各必需文档的当前版本（02-company-contract §11.1 个人文档集边界）。 */
  readonly currentDocuments: Readonly<
    Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>
  >;
  /** Host 实际装配证据：被装入请求的版本（ORG-03「对当前版本的实际请求装配」）。 */
  readonly assemblyEvidence: Readonly<
    Partial<Record<SoloipsRequiredDocumentType, SoloipsDocumentVersionId>>
  >;
  /** 记忆初始化事实；初始记忆允许空集合（ORG-03），此处只记事实不存内容。 */
  readonly memoryInitialized: boolean;
  /** 已通过最小验证的能力名（ORG-03「所需工具/能力的最小验证」）。 */
  readonly verifiedCapabilities: readonly string[];
};

export type SoloipsAppointmentRecord = {
  readonly id: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  /**
   * 部门归属（部门级任职的既有表达）。
   *
   * 〔裁定 C-4，2026-09-18〕本字段改为**可选**：公司级/团队级任职不受「旧
   * `departmentId` 必填约束」被迫挂部门（BE-2 验收③）。改可选项是**放宽**，
   * 存量记录（一律带 `departmentId`）零风险。
   *
   * 〔约束〕与 `scope` 的关系由 **§2.3 严格三分支**定义（见 `src/store.ts`
   * `#resolveAppointmentScope`）：有 `scope` 用 `scope`；无 `scope` 且有
   * `departmentId` 即部门级（`companyId` 由部门记录反解）；两者皆无即
   * `SOLOIPS_CORE_RECORD_INVALID`。**禁止任何时序/「首个」推断。**
   */
  readonly departmentId?: SoloipsDepartmentId;
  /**
   * 任职作用域（判别联合）。**可选**——data-contract §2.3 的阶段一形态：
   * 存量记录无此字段，设为必填会让整次 open 失败（介质层 `invalidRecords`
   * 默认拒绝，且 sqlite 后端无逃生通道）。
   */
  readonly scope?: SoloipsAppointmentScope;
  /**
   * 任职角色。同样**可选**（理由同上：存量兼容）。
   *
   * 〔边界〕本切片**只登记与回填**角色事实，**不做授权强制**（M0.1 无权限服务，
   * 见 data-contract §3.2 A-4/A-6）——「角色级授权不在 M0.1 范围」。
   */
  readonly role?: SoloipsAppointmentRole;
  /** 岗位必需能力：准入判定逐项核对（ORG-03「岗位必需能力」）。 */
  readonly requiredCapabilities: readonly string[];
  /** 权限代际：同一员工的新任职递增；撤销不复活旧代际（ORG-03/ORG-06）。 */
  readonly generation: number;
  readonly status: SoloipsAppointmentStatus;
};

export type SoloipsDocumentVersionRecord = {
  readonly versionId: SoloipsDocumentVersionId;
  readonly ownerId: SoloipsEmployeeId;
  readonly documentType: SoloipsDocumentType;
  readonly content: string;
  /** 内容摘要；重载须读回同一版本/摘要（02-company-contract §11.1）。 */
  readonly digest: string;
  readonly previousVersionId?: SoloipsDocumentVersionId;
  /** 保存时所用的任职（受限初始化阶段可缺省）。 */
  readonly appointmentId?: SoloipsAppointmentId;
};

/**
 * 团队（SoloIPs 业务层团队实体）——`team` 表由 BE-3 首次创建。
 *
 * 依据 data-contract §2.1 的目标形状（:243-293）逐字段落地；组长落点见 C-5
 * （**`leadAppointmentId`**，不落 `TeamBinding`——M0.1 不建绑定层，C-6）。
 *
 * 〔与 DSH 官方 roster 的分工〕两套角色词表**不得混用**：core 用
 * `'team_lead'`/`'member'`（`SoloipsAppointmentRole`），DSH roster 用
 * `'lead'`/`'teammate'`。core 记录里**不得**写后者。
 *
 * 〔M0.1 边界〕本记录**不引用任何任务/attempt 字段**（CUR-03：任务状态归官方
 * Team，core 不建第二状态机；BE-3 验收④）。
 */
export type SoloipsTeamRecord = {
  readonly id: SoloipsTeamId;
  readonly companyId: SoloipsCompanyId;
  /**
   * 可选归属部门（data-contract §2.1）。
   *
   * 〔边界〕本字段**不承载授权**：团队级任职的作用域由
   * `appointment.scope.kind='team'` 承载，「团队属于哪个部门」与「谁能管这个
   * 团队」是两件事（§2.3 的三分支以 `companyId` 做归属比较）。
   */
  readonly departmentId?: SoloipsDepartmentId;
  readonly name: string;
  /**
   * 本团队职能定义（纯文本，非空白）。
   *
   * 〔约束〕**不承载能力项**——能力走 `appointment.requiredCapabilities`
   * （data-contract §2.1 原文）。
   */
  readonly function: string;
  readonly functionSource: SoloipsTeamFunctionSource;
  /**
   * 确认者任职 ID：`functionSource='system-suggested'` 时**必填**。
   *
   * 系统建议**本身不是**职能定义——须由一名有效任职确认后才成为团队职能。
   * `'leader-defined'` 时可省略（定义者即 `leadAppointmentId`）。
   * **缺 `confirmedBy` 的 `system-suggested` 记录 = 未确认草稿**，不得被读作
   * 团队职能、不得作为分配/准入的依据（data-contract §2.1 原文）。
   *
   * 〔写入方〕`team.create` / `team.update-function` 校验该配对（见
   * `src/store.ts` 的 `#requireFunctionSourcePairing`）。
   */
  readonly confirmedBy?: SoloipsAppointmentId;
  /**
   * 团队组长任职（**唯一**组长引用；与 `role:'team_lead'` 的任职一致）。
   *
   * **pending 期可缺省**（BE-001 三步成团协议的必然结果）：`team.create` 只建
   * `status='pending'` 团队、**此时尚无组长**——若本字段必填，第一步就无法写入。
   * 故：`pending` 时可缺省；`active` 时**必须存在且满足 P-4 四项**（`team.activate`
   * 的校验内容）；归档时**保留最后有效值**（历史事实，不因归档清空）。
   *
   * 〔读面纪律〕本字段是 P-3/P-8 判据的输入：**指向的任职不存在或不满足 P-4
   * 即视为无效引用**，该团队不得作为可用团队返回（见 `src/store.ts` 的
   * `#evaluateLeadReference` 与 `#isUsableTeam`）。
   */
  readonly leadAppointmentId?: SoloipsAppointmentId;
  /**
   * 团队状态。语义与四值理由见 `SoloipsTeamStatus`。
   *
   * 〔禁物理删除〕P-7：Team **不得**被物理删除（无 delete 路径），只能经
   * `status` transition 变更语义。理由：任职、skill 分配、规范确认、装配证据
   * 均以 `teamId` 为引用键，物理删除会制造悬挂引用并让历史取证失去所指。
   */
  readonly status: SoloipsTeamStatus;
  readonly createdAt: string;
};

export type SoloipsOperationRecord = {
  readonly id: SoloipsOperationId;
  /**
   * 操作种类。读面类型是**开放**的（`SoloipsOperationKindValue`）：可能读到
   * 未来版本写入的、本版本不认识的 kind——此时**保留原样**，不判损坏
   * （见 `SoloipsUnknownOperationKind` 与下方 `schemaVersion` 的读取策略）。
   */
  readonly kind: SoloipsOperationKindValue;
  readonly status: SoloipsOperationStatus;
  /** 未知结果按员工阻塞相关新操作的核对锚点（ORG-05「未知仍阻止该员工其他新 operationId」）。 */
  readonly employeeId?: SoloipsEmployeeId;
  readonly intent: SoloipsOperationIntent;
  /** 已提交时的结果；status 为 committed 时必须存在。 */
  readonly result?: SoloipsOperationResult;
  /**
   * 写入该记录时的 **kind 词表版本**（data-contract §2.1 BE-002，本切片实现）。
   *
   * 〔为什么需要〕`kind` 是封闭联合，而契约扩展（BE-3 新增 `team.*`）会不断
   * 加项。若台账不带版本，旧写入的记录在新版本代码下可能不可读（`kind` 不在
   * 联合内 → schema 校验失败）；而台账是**崩溃恢复的核对锚点**——不可读即
   * **无法恢复**，未决操作会永久悬挂。本字段使「用哪个版本的 kind 词表解释
   * 这条记录」成为**记录自身的属性**。
   *
   * 〔约束〕**新写入必须带当前版本**（`SOLOIPS_OPERATION_SCHEMA_VERSION`；
   * 新记录不豁免）——写入点在 `src/commit-gate.ts`。
   *
   * 〔约束〕**可选**：存量记录（BE-2 及之前写入）**无**此字段。设为必填会让
   * 整次 open 失败（介质层 `invalidRecords` 默认拒绝，且 sqlite 后端无逃生
   * 通道）——与 `appointment.scope` 先可选的同一理由（见 `src/domain.ts` 的
   * 「兼容边界登记」块）。缺省语义见下条。
   *
   * 〔读取策略，本切片裁定〕**`kind` 的持久校验按「当前词表 ∪ 未知形状」放行，
   * 即不因词表扩展判记录损坏**（`src/domain.ts` 的 `operationKindSchema`）。
   * 具体：
   *  - **有 `schemaVersion` 且 ≤ 当前版本**：按当前词表解释（旧版本的 kind 词表
   *    是当前词表的**子集**——本切片只增项、不改语义、不删项，故按当前词表解释
   *    旧记录是安全的）；
   *  - **无 `schemaVersion`**：视为**版本 1 之前**的存量记录，同样按当前词表
   *    解释（存量 kind 十项全在当前词表内；这是「存量记录可读」的必要条件，
   *    否则 BE-2 之前的数据根会因缺字段而不可读）；
   *  - **`kind` 不在当前词表内**（未来版本的记录被旧代码读到）：**保留原样读出**
   *    （类型层以 `SoloipsUnknownOperationKind` 宽联合承载），**不得**判损坏、
   *    不得丢弃——「读不懂」不等于「可忽略」（§2.1 原文）。读面因此把这类记录
   *    当**不透明台账项**呈现（`kind` 原字符串 + `status`），恢复路径可据
   *    `status='pending'` 继续阻塞对应员工的新操作。
   *
   * 〔收紧路径〕待 §2.3 P1（unit version 戳 + `compatibleVersions`）落地后，
   * 「未知 kind」可按 `schemaVersion` 精确路由到该版本的词表，本字段的
   * 「宽联合放行」即可收紧为「按版本词表校验」；届时 `SoloipsUnknownOperationKind`
   * 的存在性可被移除。**当前不满足**该介质能力（sqlite 后端不写版本戳）。
   */
  readonly schemaVersion?: number;
};

/**
 * 根级绑定元数据（data-contract §3.1「数据根绑定的持久事实」）：
 * 存储根内的绑定记录，记 `accountId` 与绑定代际/时间。
 *
 * 〔约束〕判别联合而非「可空账户」：`state` 显式区分「未绑定」与「已绑定」，
 * 不靠 `undefined` / `null` 隐式表达。理由有两条，缺一不可：
 *  1. 介质层用 `null` 作「从未写入」哨兵，且 DSH `defineDomain` 与 adapter 的
 *     spec 校验都**拒绝**声明一个接受 `null` 的 global schema
 *     （storage-domain `src/spec.ts` 的 `defineDomain`；adapter
 *     `ports/storage.ts` 的 `validateSpecFields`）。可空 schema 无法与
 *     「未写入」区分，故「未绑定」必须由**显式标记**承载。
 *  2. 「未绑定」与「已绑定」是两种不同的事实：前者允许首次绑定，后者必须
 *     逐次比对（绑定不符即拒）。把它们折成「accountId 缺省」会让
 *     「根被绑到空账户」与「根从未绑定」不可区分。
 *
 * 〔约束〕绑定一旦写入即**不再改写**（本阶段无换绑入口）：换绑后的旧操作重放
 * 必须被拒绝，而不是把旧意图作用于新账户的根（data-contract §3.1）。
 */
export type SoloipsRootBindingRecord =
  | {
      /** 从未绑定：首次成功打开时写入当前账户。 */
      readonly state: "unbound";
    }
  | {
      readonly state: "bound";
      /** 绑定的账户：此后任何异账户打开一律拒绝（fail-closed）。 */
      readonly accountId: string;
      /**
       * 绑定代际：从 1 开始；同一根重新绑定时递增（供审计与后续迁移切片使用）。
       *
       * 〔约束〕本阶段不提供换绑写路径——代际字段是**审计事实**，
       * 不是「可以改绑」的暗示：写入后即冻结（见上条）。
       */
      readonly generation: number;
      /** 绑定时刻（ISO 8601）；「何时绑到哪个账户」可审计。 */
      readonly boundAt: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// §4 入职/准入判定（ORG-03 完整必要入职；SOLO-ACC-04 三路径共用）
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsOnboardingGapItem =
  | "employee"
  | "appointment"
  | "profile"
  | "avatar"
  | "soul"
  | "operating"
  | "memory"
  | "capability"
  | "assembly";

export type SoloipsOnboardingGapReason =
  | "employee-not-found"
  | "appointment-missing"
  | "appointment-revoked"
  | "document-missing"
  | "document-content-invalid"
  | "document-owner-mismatch"
  | "memory-not-initialized"
  | "capability-not-verified"
  | "assembly-evidence-missing"
  | "assembly-evidence-stale";

/**
 * 一条具体缺项：item 定位到 ORG-03 的必需项，reason 给出机器可判定的缺因，
 * message 给出可行动说明（DEV-06）。文件存在但内容无效必须失败，不得放行
 * （SOLO-ACC-04 outcome）。
 */
export type SoloipsOnboardingGap = {
  readonly item: SoloipsOnboardingGapItem;
  readonly reason: SoloipsOnboardingGapReason;
  readonly message: string;
  readonly documentType?: SoloipsRequiredDocumentType;
  readonly documentDetail?: "blank-content" | "digest-mismatch";
  readonly capability?: string;
};

export type SoloipsOnboardingStatus =
  | {
      readonly ready: true;
      readonly employeeId: SoloipsEmployeeId;
      readonly appointmentId: SoloipsAppointmentId;
      readonly generation: number;
    }
  | {
      readonly ready: false;
      readonly gaps: readonly SoloipsOnboardingGap[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// §4.5 读投影（BE-4a：只读查询的返回形状）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 员工任职归属的**解析结果**（`listEmployees` 的投影）。
 *
 * 〔为什么需要它〕`SoloipsEmployeeRecord` **没有** `companyId`/`departmentId`
 * （`contracts.ts` §3 原文）——员工与公司/部门的关联**只经 appointment**表达
 * （data-contract §2.3；`appointment.scope` 的三分支各自携带 `companyId`）。
 * 因此「按公司/部门列员工」必须**两跳**：先解析任职作用域，再取 `employeeId`。
 *
 * 〔为什么必须由读面给出解析结果〕§2.3 的三分支解析要读 `department` 表
 * （分支 2 的 `companyId` 由部门记录反解），调用方无法自己实现——若只返回
 * `SoloipsEmployeeRecord`，调用方拿不到「这个员工属于哪家公司/部门」，
 * 会退回「直接读 `appointment.scope`」这一 D-1 登记过的缺陷路径（缺 `scope`
 * 的存量记录上会读到 `undefined`）。故归属在此**显式**给出。
 *
 * 〔约束〕`companyId` 恒为**解析后**的公司（不是「记录上写了什么」）：
 * 与 `getAppointment` 的 `scope` 同一口径，且**不写回**介质（§2.3）。
 */
export type SoloipsEmployeeAffiliation = {
  readonly employeeId: SoloipsEmployeeId;
  /** 员工记录本体（`employee` 表的读面形状）。 */
  readonly employee: SoloipsEmployeeRecord;
  /** 解析出的公司归属（§2.3 三分支解析结果，恒存在）。 */
  readonly companyId: SoloipsCompanyId;
  /**
   * 该员工在本次查询范围内**解析出**的全部任职 id（按介质遍历顺序、去重）。
   *
   * 〔约束〕同一员工多条任职命中时**只出现一次**（去重键 = `employeeId`）：
   * 「按公司列员工」是**员工集合**语义，不是任职集合语义——同一人挂两条同公司
   * 任职（如部门级 + 团队级）不应在结果里出现两次。需要逐条任职的调用方用
   * `listAppointments`（它**不去重**，一条任职一项）。
   */
  readonly appointmentIds: readonly SoloipsAppointmentId[];
};

/**
 * 任职读投影（`listAppointments` 的返回项）。
 *
 * 〔与 `getAppointment` 的同一口径〕`scope` **恒为解析后**的作用域：存量记录
 * （无 `scope`、只有 `departmentId`）按 §2.3 分支 2 补出
 * `{kind:'department', companyId: <由部门反解>, departmentId}`；不可判定（分支 3）
 * 抛 `SOLOIPS_CORE_RECORD_INVALID`。**不写回介质**。
 *
 * 〔与记录本体的区别〕本投影**不**省略 `departmentId`/`role` 等可选字段的
 * 原始形态（直接展开记录），只在 `scope` 上做解析——使「记录上的字段」与
 * 「解析出的归属」同时可见，便于诊断存量形状。
 */
export type SoloipsAppointmentView = SoloipsAppointmentRecord & {
  /** 恒为解析后的作用域（见上；分支 3 抛 `SOLOIPS_CORE_RECORD_INVALID`）。 */
  readonly scope: SoloipsAppointmentScope;
};

/**
 * 总助理读面状态（SA-01.1 的**显式状态**形状，data-contract §2.4.1）。
 *
 * 〔契约要求〕读面**必须**能区分「该公司**没有**有效 `general_assistant` 任职」
 * 与「查询未覆盖该公司 / 查询失败」——**不得**用「字段缺省」「空数组」
 * 「不返回该节点」等方式让调用方无法区分（SA-01.1 原文）。
 *
 * 本形状用**三个判别分支**承载三种事实，缺一不可：
 *  - `uncovered`：公司记录**不存在**（该公司不在本读面覆盖范围内）；
 *  - `vacant`：公司存在，但**没有**有效的公司级 `general_assistant` 任职
 *    （即 §2.4.1 的「待招募」合法状态；SA-01.3 据此显示引导，**不是**空白、
 *    **不是**错误态）；
 *  - `present`：存在**恰好一条**有效任职（唯一性由 §2.4.2 的写面保证；读面
 *    若发现多于一条，以 `vacant` 之外的 `inconsistent` 如实呈现，见下）。
 *
 * 〔为什么「查询失败」不在此形状内〕失败以**抛出的错误**呈现（如
 * `SOLOIPS_CORE_STORE_CLOSED`、`SOLOIPS_CORE_RECORD_INVALID`、底层介质错误），
 * 不以「某个分支」呈现——把失败编码成返回值会让调用方把「读不到」误读成
 * 「没有」。这与「`vacant` 是**成功**读取的结论」严格区分：本投影的每个分支
 * 都表示**查询已成功执行**。
 */
export type SoloipsAdministratorProjection =
  | {
      readonly status: "uncovered";
      readonly companyId: SoloipsCompanyId;
      /** 人类可读说明（`status` 是契约、本字段是诊断，DEV-06）。 */
      readonly message: string;
    }
  | {
      readonly status: "vacant";
      readonly companyId: SoloipsCompanyId;
      /**
       * 恒为空数组：显式给出（而不是省略字段）使「没有」这件事在结构上可判定
       * ——调用方不必区分「字段缺省」与「空集合」。
       */
      readonly administrators: readonly SoloipsAdministratorView[];
      readonly message: string;
    }
  | {
      readonly status: "present";
      readonly companyId: SoloipsCompanyId;
      readonly administrators: readonly SoloipsAdministratorView[];
    }
  | {
      /**
       * 数据不一致：同一公司出现**多于一条**有效公司级 `general_assistant`。
       *
       * 〔为什么不折成 `present` 取首条〕§2.4.2 要求「同一时刻至多一条」；
       * 取首条会**静默掩盖**写面/迁移缺陷，而按 ORG-05 的哲学（读不懂不等于
       * 可忽略）这种不一致必须可见。故独立分支 + 全量清单，由调用方处置。
       */
      readonly status: "inconsistent";
      readonly companyId: SoloipsCompanyId;
      readonly administrators: readonly SoloipsAdministratorView[];
      readonly message: string;
    };

/** 总助理条目（`SoloipsAdministratorProjection` 的元素；只含已核验的事实）。 */
export type SoloipsAdministratorView = {
  readonly appointmentId: SoloipsAppointmentId;
  readonly employeeId: SoloipsEmployeeId;
  /** 恒为 `active`（投影只收录有效任职；撤销的任职不入本清单）。 */
  readonly status: "active";
  /** 恒为解析后的**公司级**作用域（SA-01.1 的判据口径，见 store 的实现注释）。 */
  readonly scope: SoloipsAppointmentScope;
};

// ─────────────────────────────────────────────────────────────────────────────
// §5 命令输入与结果
// ─────────────────────────────────────────────────────────────────────────────

export interface SoloipsCreateCompanyInput {
  readonly operationId: SoloipsOperationId;
  readonly name: string;
  /** 公司类型（默认 enterprise） */
  readonly type?: SoloipsCompanyType;
  /** 父公司 ID（创建子公司时填） */
  readonly parentCompanyId?: SoloipsCompanyId;
}

export interface SoloipsCreateDepartmentInput {
  readonly operationId: SoloipsOperationId;
  readonly companyId: SoloipsCompanyId;
  readonly name: string;
}

export interface SoloipsCreateEmployeeInput {
  readonly operationId: SoloipsOperationId;
  readonly displayName: string;
}

export interface SoloipsCreateAppointmentInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
  /**
   * 部门归属。**可选**（C-4 放宽，见 `SoloipsAppointmentRecord.departmentId`）：
   * 公司级/团队级任职不被迫挂部门。
   *
   * 〔约束〕提供 `scope` 时本字段**不得**与 `scope` 冲突（如 `scope.kind='company'`
   * 却给了 `departmentId`）——冲突即 `SOLOIPS_CORE_VALIDATION`，不做静默取舍。
   */
  readonly departmentId?: SoloipsDepartmentId;
  /**
   * 任职作用域（判别联合）。缺省时按 data-contract §2.3 的**严格三分支**推导：
   * 有 `departmentId` → 部门级（`companyId` 由部门记录反解）；否则
   * `SOLOIPS_CORE_RECORD_INVALID`（**不猜**，无时序推断）。
   */
  readonly scope?: SoloipsAppointmentScope;
  /**
   * 任职角色。缺省即**不登记角色**（存量形状：`role` 可选，见记录注释）。
   */
  readonly role?: SoloipsAppointmentRole;
  readonly requiredCapabilities?: readonly string[];
  /**
   * 执行者任职（SA-02「Host 层 actor 属半可信输入」）。
   *
   * 〔约束〕**只作审计线索**：本切片把该值记入 operation 台账的 `intent`（谁声称
   * 执行了该动作），**不做授权强制**——不得仅凭它放行需要任职的敏感操作
   * （data-contract §3.2 A-4「禁止自证授权」）。**不接受模型文本**：由 Host 半边
   * 从真实执行上下文填入。
   *
   * 〔约束〕与 ORG-05 的**可信身份链**不得混同：`ExecutionBinding` 未落地前，
   * 本字段只是**部署面自证**。
   */
  readonly actorAppointmentId?: SoloipsAppointmentId;
}

export interface SoloipsRevokeAppointmentInput {
  readonly operationId: SoloipsOperationId;
  readonly appointmentId: SoloipsAppointmentId;
}

export interface SoloipsInitializeMemoryInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
}

export interface SoloipsVerifyCapabilityInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
  readonly capability: string;
}

export interface SoloipsRecordAssemblyInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
  readonly documentType: SoloipsRequiredDocumentType;
  readonly versionId: SoloipsDocumentVersionId;
}

export interface SoloipsSaveDocumentInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
  readonly documentType: SoloipsDocumentType;
  readonly content: string;
  /**
   * 预期前版：对必需文档以 CAS 语义提升当前引用；与员工当前引用不符时
   * 版本仍持久保留为可恢复候选，但当前引用不变（02-company-contract §11.1）。
   */
  readonly expectedPreviousVersion?: SoloipsDocumentVersionId;
  readonly appointmentId?: SoloipsAppointmentId;
}

export interface SoloipsWorkEntryInput {
  readonly operationId: SoloipsOperationId;
  readonly employeeId: SoloipsEmployeeId;
  /** 目标任务引用。任务/attempt 状态归官方 Team（CUR-03），core 不建第二份。 */
  readonly taskId: string;
  readonly origin: SoloipsWorkEntryOrigin;
}

// ── 团队命令（BE-3；三步成团协议 P-9 的①③ + 改职能 + 归档） ────────────────

/**
 * 建团队（P-9 第①步）：**只建记录**，`status='pending'`、**无组长**。
 *
 * 〔约束〕本命令**不建组长任职**——组长是第②步 `appointment.create`
 * （`role='team_lead'` + `scope.kind='team'`）。三步三个 `operationId` 各自
 * 独立可恢复；**不得**把三步合并成一次提交（P-9 原文：不得声称成团是原子的）。
 */
export interface SoloipsCreateTeamInput {
  readonly operationId: SoloipsOperationId;
  readonly companyId: SoloipsCompanyId;
  /** 可选归属部门；提供时须属于 `companyId`（跨公司引用即拒绝）。 */
  readonly departmentId?: SoloipsDepartmentId;
  readonly name: string;
  /** 团队职能定义（纯文本，非空白）。**不承载能力项**。 */
  readonly function: string;
  /** 职能来源；缺省 `leader-defined`（见 `SoloipsTeamRecord.functionSource`）。 */
  readonly functionSource?: SoloipsTeamFunctionSource;
  /**
   * 确认者任职 ID：`functionSource='system-suggested'` 时**必填**（未确认草稿
   * 不得被读作团队职能）。
   */
  readonly confirmedBy?: SoloipsAppointmentId;
}

/**
 * 改团队职能定义。**不改变 `status`**——不得经此越过 P-9.3 完成成团。
 */
export interface SoloipsUpdateTeamFunctionInput {
  readonly operationId: SoloipsOperationId;
  readonly teamId: SoloipsTeamId;
  readonly function: string;
  /** 缺省时保留记录上的既有值（不做静默降级为 `leader-defined`）。 */
  readonly functionSource?: SoloipsTeamFunctionSource;
  readonly confirmedBy?: SoloipsAppointmentId;
}

/**
 * 激活团队（P-9 第③步）：校验 `leadAppointmentId` 满足 **P-4 四项**后
 * `pending` → `active`。不满足即拒绝，团队留在 `pending`。
 *
 * 〔P-9.3〕本命令是**唯一**的 `pending` → `active` 通道。
 */
export interface SoloipsActivateTeamInput {
  readonly operationId: SoloipsOperationId;
  readonly teamId: SoloipsTeamId;
  /**
   * 组长任职引用。**可选**：缺省即用记录上已有的 `leadAppointmentId`。
   *
   * 〔为什么允许显式传入〕P-9 第②步写入的任职不自动回填到 team 记录
   * （`appointment.create` 对团队级任职**不写回** team 表——见 store 的说明），
   * 因此「哪条任职是组长」需要一个显式指认点；本字段就是它。提供时**同时**
   * 写回 `leadAppointmentId`（P-8.4 的「换任」路径：建立新 `team_lead` 任职
   * 并显式改指）。
   */
  readonly leadAppointmentId?: SoloipsAppointmentId;
}

/**
 * 归档团队（`→ archived` 终态）。**不是删除**（P-7 禁物理删除）。
 *
 * 〔用途〕P-9 恢复入口的「收敛」路径：确认第②步未提交且不再需要的 `pending`
 * 团队，经此显式归档，**不得**让其长期悬挂（也**不得**物理删除）。
 */
export interface SoloipsCloseTeamInput {
  readonly operationId: SoloipsOperationId;
  readonly teamId: SoloipsTeamId;
}

// 注：命令结果一律用 type 别名（非 interface）声明——持久载荷约束
// `T extends SoloipsCommandResult`（JSON 记录）依赖对象字面量类型的隐式
// 索引签名，interface 不具备（TS 行为，非业务规则）。

export type SoloipsCreateCompanyResult = {
  readonly companyId: SoloipsCompanyId;
};

export type SoloipsCreateDepartmentResult = {
  readonly departmentId: SoloipsDepartmentId;
};

export type SoloipsCreateEmployeeResult = {
  readonly employeeId: SoloipsEmployeeId;
};

export type SoloipsCreateAppointmentResult = {
  readonly appointmentId: SoloipsAppointmentId;
  readonly generation: number;
};

export type SoloipsRevokeAppointmentResult = {
  readonly appointmentId: SoloipsAppointmentId;
  readonly status: SoloipsAppointmentStatus;
};

export type SoloipsInitializeMemoryResult = {
  readonly employeeId: SoloipsEmployeeId;
  readonly memoryInitialized: boolean;
};

export type SoloipsVerifyCapabilityResult = {
  readonly employeeId: SoloipsEmployeeId;
  readonly verifiedCapabilities: readonly string[];
};

export type SoloipsRecordAssemblyResult = {
  readonly employeeId: SoloipsEmployeeId;
  readonly assemblyEvidence: Readonly<Partial<Record<SoloipsRequiredDocumentType, string>>>;
};

export type SoloipsSaveDocumentResult = {
  readonly versionId: SoloipsDocumentVersionId;
  readonly digest: string;
  /** promoted：必需文档且 CAS 通过；saved：作品版本（无当前引用）；conflict：CAS 不符。 */
  readonly outcome: "promoted" | "saved" | "conflict";
  /** 仅 outcome === "conflict" 时给出冲突时的当前引用。 */
  readonly currentVersionId?: SoloipsDocumentVersionId;
};

export type SoloipsWorkEntryAdmitted = {
  readonly status: "admitted";
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId: SoloipsAppointmentId;
  readonly generation: number;
  readonly taskId: string;
  readonly origin: SoloipsWorkEntryOrigin;
};

export type SoloipsWorkEntryRefusalReason = "onboarding-not-ready" | "employee-operation-unknown";

export type SoloipsCreateTeamResult = {
  readonly teamId: SoloipsTeamId;
  /** 恒为 `'pending'`（P-9 第①步的定义特征）；显式给出使读面无需回查。 */
  readonly status: SoloipsTeamStatus;
};

export type SoloipsUpdateTeamFunctionResult = {
  readonly teamId: SoloipsTeamId;
  readonly function: string;
  readonly functionSource: SoloipsTeamFunctionSource;
  readonly status: SoloipsTeamStatus;
};

export type SoloipsActivateTeamResult = {
  readonly teamId: SoloipsTeamId;
  readonly status: SoloipsTeamStatus;
  readonly leadAppointmentId: SoloipsAppointmentId;
};

export type SoloipsCloseTeamResult = {
  readonly teamId: SoloipsTeamId;
  readonly status: SoloipsTeamStatus;
};

/**
 * 团队读面投影（`getTeam` / `listTeams` 的返回形状）。
 *
 * 〔P-3/P-8.2/P-9.1 的读面纪律落点〕**可用**结果集排除 `pending`/`inactive`；
 * 需要展示它们时必须以显式状态呈现（P-8.5/P-9.2「读面不得静默降级」），故
 * 本投影携带 `status` 与 `usable` 两个字段：
 *  - `usable`：本团队**当前是否可参与协作**（`status === 'active'` 且组长引用
 *    经 P-4 复核有效）；
 *  - `leadReference`：组长引用的**核验结论**（P-4 四项逐项结果或无效原因）。
 *    使调用方不必自己实现 P-4（D-1 式缺陷的预防：读面已给结论）。
 */
export type SoloipsTeamView = {
  readonly id: SoloipsTeamId;
  readonly companyId: SoloipsCompanyId;
  readonly departmentId?: SoloipsDepartmentId;
  readonly name: string;
  readonly function: string;
  readonly functionSource: SoloipsTeamFunctionSource;
  readonly confirmedBy?: SoloipsAppointmentId;
  readonly leadAppointmentId?: SoloipsAppointmentId;
  readonly status: SoloipsTeamStatus;
  readonly createdAt: string;
  /** 是否可用（P-3/P-8.2/P-9.1 的可用判据；`false` 即不得读作可用团队）。 */
  readonly usable: boolean;
  /** 组长引用核验结论；`leadAppointmentId` 缺省时为 `{ valid: false, reason: 'absent' }`。 */
  readonly leadReference: SoloipsLeadReferenceVerdict;
};

/**
 * 组长引用核验结论（P-4 四项的逐项结果）。
 *
 * 四项（全部满足才算有效）：① 任职 `status='active'`；② **同公司**
 * （`scope.companyId === team.companyId`）；③ **同团队**（`scope.kind='team'`
 * 且 `scope.teamId === team.id`）；④ `role === 'team_lead'`。
 */
export type SoloipsLeadReferenceVerdict =
  | {
      readonly valid: true;
      readonly appointmentId: SoloipsAppointmentId;
      readonly employeeId: SoloipsEmployeeId;
    }
  | {
      readonly valid: false;
      /**
       * 无效原因。`absent`：无引用；`appointment-missing`：引用的任职不存在；
       * `revoked`：任职已撤销；`not-team-scope`：作用域不是该团队；
       * `company-mismatch`：作用域公司与该团队不符；`role-mismatch`：角色不是
       * `team_lead`；`scope-unresolvable`：任职缺 `scope` 且解析不出（§2.3 分支 3）。
       */
      readonly reason:
        | "absent"
        | "appointment-missing"
        | "revoked"
        | "not-team-scope"
        | "company-mismatch"
        | "role-mismatch"
        | "scope-unresolvable";
      readonly appointmentId?: SoloipsAppointmentId;
      /** 人类可读说明（DEV-06 可行动诊断；`reason` 是契约、本字段是诊断）。 */
      readonly message: string;
    };

/**
 * 悬挂处置的扫描结论（`reconcileTeams`）。
 *
 * 〔P-8.3 不自动修复〕本命令**只标记**：把 `status='active'` 但组长引用失效的
 * 团队转为 `inactive`；**不**补任职、**不**改指引用、**不**自动指定新组长。
 */
export type SoloipsTeamReconcileResult = {
  /** 本次扫描过的 `active` 团队数（P-8.6：`archived` 不参与扫描）。 */
  readonly scanned: number;
  /** 本次被标记为 `inactive` 的团队 id（按扫描顺序）。 */
  readonly markedInactive: readonly SoloipsTeamId[];
  /**
   * `pending` 团队 id 清单（P-9 恢复入口的「续做/收敛」线索）。
   *
   * 〔约束〕**只报告、不处置**：续做需建组长任职（`appointment.create`），
   * 收敛需显式归档（`team.close`）——两者都是显式操作，且「不得自动建组长」
   * （P-9 的「不得自动」行）。本命令因此只给出待处置清单。
   */
  readonly pending: readonly SoloipsTeamId[];
};

/**
 * 提交门的幂等结果：
 * - committed：本次实际提交；
 * - replayed：命中同 operationId 的已提交结果，直接返回原结果（不重复执行）；
 * - unknown：该 operationId 存在未决（pending）意图，结果未知，阻塞该操作
 *   而不换 ID 重做（ORG-05「查不清就阻塞相关新增动作，不能换 ID 重领」）。
 */
export type SoloipsCommitOutcome<T extends SoloipsCommandResult> =
  | { readonly status: "committed"; readonly result: T }
  | { readonly status: "replayed"; readonly result: T }
  | { readonly status: "unknown" };

/**
 * 工作准入结果：拒绝不写任何业务状态（SOLO-ACC-04「任务保持 pending」——
 * 任务状态本就归 Team，core 拒绝时不产生任何准入事实）。
 */
export type SoloipsWorkEntryOutcome =
  | {
      readonly status: "admitted";
      readonly replayed: boolean;
      readonly result: SoloipsWorkEntryAdmitted;
    }
  | {
      readonly status: "refused";
      readonly reason: SoloipsWorkEntryRefusalReason;
      readonly gaps?: readonly SoloipsOnboardingGap[];
    }
  | { readonly status: "unknown" };

// ─────────────────────────────────────────────────────────────────────────────
// §6 服务面（web/tools-pv 经此消费；实现持有 domain handle 但不外泄）
// ─────────────────────────────────────────────────────────────────────────────

/** 启动绑定清单核对所需的只读事实（SOLO-FENCE-01 §1）。 */
export interface SoloipsCoreBinding {
  readonly root: string;
  readonly backend: string;
  readonly storageId: string;
  readonly domainName: string;
  readonly leaseGeneration: number;
}

export interface SoloipsCoreService {
  readonly binding: SoloipsCoreBinding;

  createCompany(
    input: SoloipsCreateCompanyInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateCompanyResult>>;
  createDepartment(
    input: SoloipsCreateDepartmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateDepartmentResult>>;
  createEmployee(
    input: SoloipsCreateEmployeeInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateEmployeeResult>>;
  createAppointment(
    input: SoloipsCreateAppointmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateAppointmentResult>>;
  revokeAppointment(
    input: SoloipsRevokeAppointmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsRevokeAppointmentResult>>;
  initializeEmployeeMemory(
    input: SoloipsInitializeMemoryInput,
  ): Promise<SoloipsCommitOutcome<SoloipsInitializeMemoryResult>>;
  verifyEmployeeCapability(
    input: SoloipsVerifyCapabilityInput,
  ): Promise<SoloipsCommitOutcome<SoloipsVerifyCapabilityResult>>;
  recordAssemblyEvidence(
    input: SoloipsRecordAssemblyInput,
  ): Promise<SoloipsCommitOutcome<SoloipsRecordAssemblyResult>>;
  saveEmployeeDocument(
    input: SoloipsSaveDocumentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsSaveDocumentResult>>;
  /**
   * 三条工作路径共用的准入前门（SOLO-ACC-04）。
   *
   * 〔边界声明〕T03 只持有 employeeId 入参；「模型传 employeeId 不是凭据」
   * 的可信身份链（真实 Session → Host Binding → Employee，ORG-05）依赖
   * agents/session 端口集成，属后续切片。本命令不做凭据核实。
   */
  requestWorkEntry(input: SoloipsWorkEntryInput): Promise<SoloipsWorkEntryOutcome>;

  // ── 团队命令（BE-3；三步成团协议 P-9） ──────────────────────────────────

  /** P-9 第①步：建 `pending` 团队，**无组长**。 */
  createTeam(input: SoloipsCreateTeamInput): Promise<SoloipsCommitOutcome<SoloipsCreateTeamResult>>;
  /** 改职能定义；**不**改变 `status`（不得越过 P-9.3 完成成团）。 */
  updateTeamFunction(
    input: SoloipsUpdateTeamFunctionInput,
  ): Promise<SoloipsCommitOutcome<SoloipsUpdateTeamFunctionResult>>;
  /** P-9 第③步：P-4 四项校验通过才 `pending` → `active`；**唯一**成团通道。 */
  activateTeam(
    input: SoloipsActivateTeamInput,
  ): Promise<SoloipsCommitOutcome<SoloipsActivateTeamResult>>;
  /** 归档（终态）；**不是删除**（P-7）。 */
  closeTeam(input: SoloipsCloseTeamInput): Promise<SoloipsCommitOutcome<SoloipsCloseTeamResult>>;
  /**
   * 悬挂组长引用的恢复辅助（P-8.1）：扫描全部 `status='active'` 团队，核验 P-4，
   * 失效者标记为 `inactive`（**不自动修复**，P-8.3）。
   *
   * 〔为什么是独立命令而非「open 时自动跑」〕P-8.1 允许两种时机（每次打开数据根
   * **或**每次执行团队读面）。本切片选**显式命令**，理由：
   *  1. 打开路径（`openSoloipsCompanyStore`）的职责是「取写权 → 开 domain →
   *     校验账户绑定」，在其中做业务写会让「打开」变成有副作用的操作——而
   *     打开可能由只读消费者发起，写入超出其意图；
   *  2. 显式命令的**结论可观察**（返回 `markedInactive` 清单），自动跑则结论
   *     只落介质，接管方仍需回查；
   *  3. 与 `listPendingOperations` 同一恢复哲学：**core 不自动清理崩溃遗留**，
   *     交由接管方核对（`src/store.ts` 文件头「失败语义」段）。
   *
   * 读面（`getTeam`/`listTeams`）**同时**执行同判据的**纯读**核验（不写状态），
   * 因此「未跑 reconcile 也不会把失效团队读作可用」——P-8.2 的读面要求由读面
   * 自身满足，本命令只负责把结论**落盘**为 `inactive`。
   */
  reconcileTeams(): Promise<SoloipsTeamReconcileResult>;

  /** 纯读判定：不写状态、不持锁（无需强制非事务快照，ORG-05）。 */
  checkOnboarding(employeeId: SoloipsEmployeeId): SoloipsOnboardingStatus;

  getCompany(id: SoloipsCompanyId): SoloipsCompanyRecord | undefined;
  /** 获取指定公司的所有直接子公司 */
  listSubsidiaries(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[];
  /** 获取公司树（顶层公司及所有下级公司） */
  getCompanyTree(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[];
  listDepartments(companyId: SoloipsCompanyId): readonly SoloipsDepartmentRecord[];
  /**
   * 读取部门（`get*` 惯例：未找到返回 `undefined`，**不抛**）。
   *
   * 〔与 `#readDepartment` 的分工〕写路径的 `#readDepartment` 在缺失时抛
   * `SOLOIPS_CORE_PRECONDITION`（「引用的既有事实不存在」）——那是**命令**语义。
   * 本方法是**查询**：调用方（如组织树渲染）按 id 取一个部门，缺失是可预期结果，
   * 故遵循 `getCompany`/`getEmployee` 等同族方法的口径返回 `undefined`。
   * **不得**复用写路径辅助（那会让「部门不存在」在查询里表现为异常）。
   *
   * 〔形状校验〕非法 id 形状抛 `SOLOIPS_CORE_VALIDATION`（与全部 `get*` 同口径，
   * 依据 `src/ids.ts` 的「边界校验」段：调用方传来的 id 不受类型系统保护）。
   */
  getDepartment(id: SoloipsDepartmentId): SoloipsDepartmentRecord | undefined;
  /**
   * 读取团队（读面，**不产生 kind**；BE-3 验收⑤）。
   *
   * 〔P-8.2/P-9.1 读面纪律〕返回**任何状态**的团队（含 `pending`/`inactive`/
   * `archived`），但以 `usable` 显式标注是否可用——**不得**把 `pending` 或
   * 失效团队读作可用（P-8.5/P-9.2「读面不得静默降级」）。需要「只看可用」的
   * 调用方用 `listTeams`。
   */
  getTeam(id: SoloipsTeamId): SoloipsTeamView | undefined;
  /**
   * 列团队（读面，**不产生 kind**）。
   *
   * 〔P-3/P-8.2/P-9.1〕默认只返回**可用**团队（`status='active'` 且组长引用
   * 满足 P-4）。`includeUnusable: true` 时返回全部（含 `pending`/`inactive`/
   * `archived`），各项仍带 `usable` 与 `leadReference` 显式状态。
   *
   * 〔`departmentId` 过滤（BE-4a 扩键）〕`listTeams(departmentId)` 这一调用形态
   * （组织树「部门 → 团队」、`organization-full-backend-design` 的编组场景）需要
   * 按部门收窄。**扩键而非新增方法**：同一份可用性判据与投影（`usable`/
   * `leadReference`）不应存在第二条实现路径——多一个查询方法就多一处可能与
   * P-4 判据漂移的读面。缺省（不给该键）＝不过滤，**既有语义不变**。
   *
   * 〔两个过滤条件的合并语义〕`departmentId` 与 `companyId` 是**与**关系：
   * 团队必须同时属于该部门与该部门所属公司。跨公司部门 id 不产生结果
   * （不报错）——查询语义是「在这个范围内找」，空结果是合法结论。
   */
  listTeams(
    companyId: SoloipsCompanyId,
    options?: {
      readonly includeUnusable?: boolean;
      /** 只返回归属该部门的团队；缺省即不过滤（`team.departmentId` 为可选字段）。 */
      readonly departmentId?: SoloipsDepartmentId;
    },
  ): readonly SoloipsTeamView[];
  getEmployee(id: SoloipsEmployeeId): SoloipsEmployeeRecord | undefined;
  getAppointment(id: SoloipsAppointmentId): SoloipsAppointmentRecord | undefined;
  getDocumentVersion(id: SoloipsDocumentVersionId): SoloipsDocumentVersionRecord | undefined;
  getOperation(id: SoloipsOperationId): SoloipsOperationRecord | undefined;
  /** 未决操作清单：接管方重开后核对（SOLO-FENCE-01 §3「核对未决 operationId」）。 */
  listPendingOperations(): readonly SoloipsOperationRecord[];

  // ── 读投影扩容（BE-4a；全部**只读**：不产生 kind、不写状态、无恢复副作用） ──

  /**
   * 列员工（按公司**或**按部门）——两跳查询（`appointment` → `employee`）。
   *
   * 〔为什么必须两跳〕员工记录**没有**公司/部门字段（见
   * `SoloipsEmployeeAffiliation` 的注释），归属只经任职作用域表达。
   *
   * 〔过滤参数二选一，恰好一个〕：
   *  - `{ companyId }`：该公司的员工（任职作用域解析后 `companyId` 相符，
   *    **任意** kind——公司级/部门级/团队级皆算「在该公司」）；
   *  - `{ departmentId }`：该部门的员工（仅 `scope.kind='department'` 且
   *    `departmentId` 相符）。**公司级/团队级任职不属于任何部门**，故不入选
   *    ——部门视图不得把不挂该部门的人算进来（团队归属由 `listTeams` 表达）。
   *
   * 〔去重口径〕**去重键 = `employeeId`**：同一员工多条任职命中（如同一公司下的
   * 部门级 + 团队级任职）只出现一次；命中的任职 id 全部收在
   * `affiliation.appointmentIds`（见其注释）。结果**不去重之外**的任何加工：
   * 不做排序（按介质遍历顺序，与 `listSubsidiaries`/`listDepartments` 一致）、
   * 不做角色筛选（要按角色/状态筛选用 `listAppointments`）。
   *
   * 〔status 过滤口径〕**只计 `status='active'` 的任职**：撤销的任职不构成当前
   * 归属（否则「撤职后员工仍在部门名单里」会成为隐藏语义）。这与
   * `#assertNoActiveGeneralAssistant` 的「撤销不占名额」同一方向。
   *
   * 〔分支 3 的处置〕任职缺 `scope` 且解析不出公司（§2.3 分支 3）→
   * `SOLOIPS_CORE_RECORD_INVALID` **冒泡**，不跳过。理由与总助理唯一性判定
   * 同向（fail-closed）：一条不可判定的任职**可能**属于本次查询的公司/部门，
   * 跳过它会让结果**静默漏掉**该员工——「能定则定、不能定即报错」。
   * 〔边界〕该错误使整个查询失败（不是返回部分结果）：调用方须先处置损坏记录，
   * 这与 `getAppointment` 在同一形状上的行为一致。
   */
  listEmployees(
    filter:
      | { readonly companyId: SoloipsCompanyId; readonly departmentId?: undefined }
      | { readonly departmentId: SoloipsDepartmentId; readonly companyId?: undefined },
  ): readonly SoloipsEmployeeAffiliation[];

  /**
   * 列任职（按公司 / 部门 / 员工过滤；**不去重**——一条任职一项）。
   *
   * 〔与 `listEmployees` 的分工〕本方法返回**任职集合**（同一员工可多条），
   * `listEmployees` 返回**员工集合**（去重）。两者的过滤语义一致（见下）。
   *
   * 〔过滤条件〕三个键可**任意组合**（与关系），全缺省即返回全部任职：
   *  - `companyId`：作用域解析后 `companyId` 相符（任意 kind）；
   *  - `departmentId`：仅部门级任职且 `departmentId` 相符；
   *  - `employeeId`：该员工的任职（`employeeId` 是记录上的**直接**字段，无需解析）；
   *  - `includeRevoked`：缺省 `false` —— **只返回 `active`**（与 `listEmployees`
   *    同一口径）。`true` 时返回全部（含 `revoked`），供历史/审计视图使用。
   *
   * 〔返回形状〕`SoloipsAppointmentView`：`scope` 恒为解析后（分支 3 抛
   * `SOLOIPS_CORE_RECORD_INVALID`，**不跳过**——见 `listEmployees` 的同款说明）。
   */
  listAppointments(filter?: {
    readonly companyId?: SoloipsCompanyId;
    readonly departmentId?: SoloipsDepartmentId;
    readonly employeeId?: SoloipsEmployeeId;
    readonly includeRevoked?: boolean;
  }): readonly SoloipsAppointmentView[];

  /**
   * 列某员工的全部文档版本（历史，含非当前版本）。
   *
   * 〔与 `employee.currentDocuments` 的分工〕当前引用只指向**每类必需文档的一个**
   * 版本（`SoloipsEmployeeRecord.currentDocuments`）；本方法是**版本历史**
   * （`saveEmployeeDocument` 的 CAS 冲突路径会把未提升的版本也持久保留——
   * 02-company-contract §11.1），故按 `ownerId` 全量返回，**不按文档类型收窄**。
   *
   * 〔不排序、不去重〕按介质遍历顺序返回；版本之间经 `previousVersionId` 形成
   * 链，顺序由调用方按需重建（读面不替调用方排序，与既有列表方法一致）。
   *
   * 〔非法 id 形状〕抛 `SOLOIPS_CORE_VALIDATION`；员工**不存在**返回空数组
   * （与「查询未命中」的列表语义一致——列表方法不因过滤键指向不存在的实体而报错，
   * 需要存在性判定用 `getEmployee`）。
   */
  listDocumentVersions(employeeId: SoloipsEmployeeId): readonly SoloipsDocumentVersionRecord[];

  /**
   * 总助理读面（SA-01.1 的**显式状态**实现；data-contract §2.4.1）。
   *
   * 〔必须区分三件事〕「没有有效总助理」（`vacant`，§2.4.1 的合法「待招募」态）、
   * 「公司不在覆盖范围内」（`uncovered`）、「查询失败」（**抛出**）。三者不得
   * 互相冒充——空数组不得用来表达前两者中的任何一个。
   *
   * 〔判据（与 `#assertNoActiveGeneralAssistant` 同一口径）〕有效 =
   * `status='active'` 且 `role='general_assistant'` 且作用域解析后为
   * `{kind:'company', companyId: <目标公司>}`。**作用域必须先经 §2.3 三分支
   * 解析再比较**：存量记录（无 `scope`、只有 `departmentId`）解析为**部门级**，
   * 因此不会被误算作公司总助理；反过来，一条 `role='general_assistant'` 但
   * 解析不出归属的记录（分支 3）**不可判定**——按 fail-closed 与
   * `#assertNoActiveGeneralAssistant` 同向处置：**抛** `SOLOIPS_CORE_RECORD_INVALID`，
   * 而不是「它不是总助理」这种猜测（猜测会让「待招募」在数据损坏时被误报）。
   *
   * 〔读面纪律〕不产生 kind、不写状态、不跑 reconcile。
   */
  listAdministrators(companyId: SoloipsCompanyId): SoloipsAdministratorProjection;

  /** 逆序释放：domain → stack → lease（SEAM-14）。幂等；关闭后全部写命令拒绝。 */
  close(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 稳定错误码（诊断与分支 switch 的依据；正文类在 src/errors.ts）
// ─────────────────────────────────────────────────────────────────────────────

export type SoloipsCoreErrorCode =
  /** 配置未通过校验（root 缺失/非绝对路径等）；服务不发布，fail-closed。 */
  | "SOLOIPS_CORE_CONFIG_INVALID"
  /** adapter 服务存在但端口结构不符合冻结契约（fail-closed，不发布服务）。 */
  | "SOLOIPS_CORE_ADAPTER_INVALID"
  /** store 已关闭；全部权威写与读拒绝。 */
  | "SOLOIPS_CORE_STORE_CLOSED"
  /** 写权确认已失权（对应 adapter 的 LEASE_NOT_HELD）：发布被拒，业务状态不变。 */
  | "SOLOIPS_CORE_LEASE_NOT_HELD"
  /** 写权状态未知（assertHeld 抛出非失权错误）：同样拒绝发布并保留诊断。 */
  | "SOLOIPS_CORE_LEASE_CHECK_FAILED"
  /** 命令输入未通过校验。 */
  | "SOLOIPS_CORE_VALIDATION"
  /** 引用的既有事实不存在或状态不允许该操作。 */
  | "SOLOIPS_CORE_PRECONDITION"
  /** operationId 被不同种类的操作复用。 */
  | "SOLOIPS_CORE_CONFLICT"
  /**
   * 账户绑定不符（fail-closed，打开即拒、不发布服务）。
   *
   * 三种触发面共用本码，`message` 区分具体是哪一个（`code` 是契约、`message` 是诊断）：
   *  1. 根级绑定元数据已绑定到别的账户（含「换绑后旧 operation 重放」——绑定不符即拒，
   *     旧操作的意图**不会**作用于新账户的根）；
   *  2. 根内公司记录的 `accountId` 与部署账户不符；
   *  3. 根内存在占位账户（`SOLOIPS_PLACEHOLDER_ACCOUNT_ID`）的存量记录——
   *     **不认领、不自动改归**（data-contract §3.1），须人工处置。
   */
  | "SOLOIPS_CORE_ACCOUNT_MISMATCH"
  /** 持久记录不符合声明 schema（介质数据损坏的信号）。 */
  | "SOLOIPS_CORE_RECORD_INVALID";
