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
  | "platform"    // SoloIPS 平台公司（SoloIPS 官方）
  | "operation"   // SoloIPS 运营子公司（SoloIPS 官方，业务平台如漫画/视频网站）
  | "enterprise"  // 用户企业公司（用户创建）
  | "subsidiary";  // 用户子公司（用户创建，属于用户企业公司）

/**
 * SOLO-ACC-04 要求三条工作路径共用同一准入判定：
 * (a) 经理显式派单；(b) 员工自领；(c) 自动调度器分配。
 */
export type SoloipsWorkEntryOrigin = "manager-dispatch" | "self-claim" | "scheduler-assign";

export type SoloipsAppointmentStatus = "active" | "revoked";

/** 本切片实际存在的持久写操作种类；用于恢复核对与 operationId 冲突检测。 */
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
  | "work-entry.request";

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
  readonly departmentId: SoloipsDepartmentId;
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

export type SoloipsOperationRecord = {
  readonly id: SoloipsOperationId;
  readonly kind: SoloipsOperationKind;
  readonly status: SoloipsOperationStatus;
  /** 未知结果按员工阻塞相关新操作的核对锚点（ORG-05「未知仍阻止该员工其他新 operationId」）。 */
  readonly employeeId?: SoloipsEmployeeId;
  readonly intent: SoloipsOperationIntent;
  /** 已提交时的结果；status 为 committed 时必须存在。 */
  readonly result?: SoloipsOperationResult;
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
  readonly departmentId: SoloipsDepartmentId;
  readonly requiredCapabilities?: readonly string[];
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

  /** 纯读判定：不写状态、不持锁（无需强制非事务快照，ORG-05）。 */
  checkOnboarding(employeeId: SoloipsEmployeeId): SoloipsOnboardingStatus;

  getCompany(id: SoloipsCompanyId): SoloipsCompanyRecord | undefined;
  /** 获取指定公司的所有直接子公司 */
  listSubsidiaries(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[];
  /** 获取公司树（顶层公司及所有下级公司） */
  getCompanyTree(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[];
  listDepartments(companyId: SoloipsCompanyId): readonly SoloipsDepartmentRecord[];
  getEmployee(id: SoloipsEmployeeId): SoloipsEmployeeRecord | undefined;
  getAppointment(id: SoloipsAppointmentId): SoloipsAppointmentRecord | undefined;
  getDocumentVersion(id: SoloipsDocumentVersionId): SoloipsDocumentVersionRecord | undefined;
  getOperation(id: SoloipsOperationId): SoloipsOperationRecord | undefined;
  /** 未决操作清单：接管方重开后核对（SOLO-FENCE-01 §3「核对未决 operationId」）。 */
  listPendingOperations(): readonly SoloipsOperationRecord[];

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
  /** 持久记录不符合声明 schema（介质数据损坏的信号）。 */
  | "SOLOIPS_CORE_RECORD_INVALID";
