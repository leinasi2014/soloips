/**
 * soloips-core 的业务 domain 声明：唯一 opener 打开的**单个** domain。
 *
 * 模型推导方法（任务裁定）：从 SOLO-ACC-04/05 分解可观察业务操作，再由
 * 操作所需状态反推最小实体/字段；「公司/部门/员工/任职/准入/作品版本」
 * 是待核对候选清单，不是六张默认表。逐字段锚点见各 schema 注释。
 *
 * 职责边界（CUR-03 / ORG-05 裁定）：任务、attempt、占用状态归官方 Team，
 * core 不建第二份任务状态机；core 持有组织事实、个人文档版本与操作台账。
 */

import type { SoloipsDomainSpec, SoloipsDomainTableSpec } from "soloips-adapter-dsh/contracts";

import type {
  SoloipsAppointmentId,
  SoloipsAppointmentRecord,
  SoloipsCompanyId,
  SoloipsCompanyRecord,
  SoloipsDepartmentId,
  SoloipsDepartmentRecord,
  SoloipsDocumentVersionId,
  SoloipsDocumentVersionRecord,
  SoloipsEmployeeId,
  SoloipsEmployeeRecord,
  SoloipsOperationId,
  SoloipsOperationRecord,
} from "./contracts.js";
import { SOLOIPS_COMPANY_DOMAIN_NAME, SOLOIPS_COMPANY_DOMAIN_VERSION } from "./contracts.js";
import {
  arraySchema,
  booleanSchema,
  constrainedStringSchema,
  jsonRecordSchema,
  literalUnionSchema,
  nonEmptyStringSchema,
  objectSchema,
  optionalSchema,
  positiveIntegerSchema,
  stringSchema,
  type SoloipsSchema,
} from "./schema.js";
import {
  isAppointmentId,
  isCompanyId,
  isDepartmentId,
  isDocumentVersionId,
  isEmployeeId,
  isOperationIdShape,
} from "./ids.js";

// ─────────────────────────────────────────────────────────────────────────────
// 记录 schema（与 contracts.ts 的 *Record 一一对应；字段锚点注释为推导证据）
// ─────────────────────────────────────────────────────────────────────────────

// 各品牌 id 的持久校验器（形状谓词来自 src/ids.ts，单一维护来源）。
const companyIdSchema = constrainedStringSchema<SoloipsCompanyId>(isCompanyId, "公司 id");
const departmentIdSchema = constrainedStringSchema<SoloipsDepartmentId>(isDepartmentId, "部门 id");
const employeeIdSchema = constrainedStringSchema<SoloipsEmployeeId>(isEmployeeId, "员工 id");
const appointmentIdSchema = constrainedStringSchema<SoloipsAppointmentId>(
  isAppointmentId,
  "任职 id",
);
const documentVersionIdSchema = constrainedStringSchema<SoloipsDocumentVersionId>(
  isDocumentVersionId,
  "文档版本 id",
);
const operationIdSchema = constrainedStringSchema<SoloipsOperationId>(
  isOperationIdShape,
  "操作 id",
);

/**
 * company：公司层级架构的核心实体
 * - id：读回核对的身份（「核对公司」）
 * - accountId：归属账户（隔离条件）
 * - parentCompanyId：父公司（无则为顶层公司）
 * - type：公司类型（platform/operation/enterprise/subsidiary）
 * - name：创建时写入、重启后可比对的业务可观察值
 * - status：活跃/归档
 * - createdAt：创建时间
 */
const companyRecordSchema: SoloipsSchema<SoloipsCompanyRecord> = objectSchema<SoloipsCompanyRecord>(
  {
    id: companyIdSchema,
    accountId: nonEmptyStringSchema(),
    parentCompanyId: optionalSchema(companyIdSchema),
    type: literalUnionSchema(["platform", "operation", "enterprise", "subsidiary"] as const),
    name: nonEmptyStringSchema(),
    status: literalUnionSchema(["active", "archived"] as const),
    createdAt: nonEmptyStringSchema(),
  },
);

/**
 * department：SOLO-ACC-05 前置「公司/部门/员工」链。
 * - companyId：归属核对（部门属于哪个公司）。
 * - name：读回可比对的业务值。
 */
const departmentRecordSchema: SoloipsSchema<SoloipsDepartmentRecord> =
  objectSchema<SoloipsDepartmentRecord>({
    id: departmentIdSchema,
    companyId: companyIdSchema,
    name: nonEmptyStringSchema(),
  });

/**
 * employee：SOLO-ACC-05「核对员工/任职」+ ORG-03 全部入职事实的载体。
 * - id：稳定身份；ACC-04「重试不重建员工身份」以 id + operationId 幂等保证。
 * - displayName：读回可比对的业务值（公开资料本体是 profile 文档，不在此）。
 * - currentDocuments：员工只持各必需文档当前引用（02-company-contract §11.1）；
 *   准入判定据此读回版本内容（ORG-03「文件实际保存、所有权/版本读回」）。
 * - assemblyEvidence：Host 实际装配的版本（ORG-03「对当前版本的实际请求装配」）；
 *   与 currentDocuments 不一致即失效相关部分（「普通变化只失效相关部分」）。
 * - memoryInitialized：记忆初始化事实；初始记忆允许空集合（ORG-03）。
 * - verifiedCapabilities：已通过最小验证的能力（ORG-03「所需工具/能力的最小验证」），
 *   与任职的 requiredCapabilities 求差得到具体缺项。
 */
const currentDocumentsSchema: SoloipsSchema<SoloipsEmployeeRecord["currentDocuments"]> =
  objectSchema<SoloipsEmployeeRecord["currentDocuments"]>({
    profile: optionalSchema(documentVersionIdSchema),
    avatar: optionalSchema(documentVersionIdSchema),
    soul: optionalSchema(documentVersionIdSchema),
    operating: optionalSchema(documentVersionIdSchema),
  });

const employeeRecordSchema: SoloipsSchema<SoloipsEmployeeRecord> =
  objectSchema<SoloipsEmployeeRecord>({
    id: employeeIdSchema,
    displayName: nonEmptyStringSchema(),
    currentDocuments: currentDocumentsSchema,
    assemblyEvidence: currentDocumentsSchema,
    memoryInitialized: booleanSchema(),
    verifiedCapabilities: arraySchema(nonEmptyStringSchema()),
  });

/**
 * appointment（任职）：ORG-03 准入首项「有效任职和权限代际」。
 * - employeeId/departmentId：ACC-05「核对任职」的关联链。
 * - requiredCapabilities：岗位必需能力，准入逐项核对（ORG-03）。
 * - generation：权限代际；同一员工新任职递增、撤销不复活（ORG-06），
 *   ACC-05 读回核对的可比较值。
 * - status：「有效」任职的判定面（active/revoked）；撤销后准入必须拒绝。
 */
const appointmentRecordSchema: SoloipsSchema<SoloipsAppointmentRecord> =
  objectSchema<SoloipsAppointmentRecord>({
    id: appointmentIdSchema,
    employeeId: employeeIdSchema,
    departmentId: departmentIdSchema,
    requiredCapabilities: arraySchema(nonEmptyStringSchema()),
    generation: positiveIntegerSchema(),
    status: literalUnionSchema(["active", "revoked"] as const),
  });

/**
 * document_version：个人文档集 + 作品版本的不可变版本表
 * （02-company-contract §11.1 个人资产保存边界；ACC-05「已保存作品版本」）。
 * - versionId：不可变版本身份；读回「同一版本/摘要」的锚点。
 * - ownerId：所有权；准入判定核对当前引用指向的版本确属本人（ORG-03）。
 * - documentType：区分四类必需文档与作品（work 无当前引用提升）。
 * - content：正文本体；准入判定验证非空白（ACC-04「文件在但内容无效」必须失败）。
 * - digest：内容摘要；读回与准入均复核（内容与摘要不一致即数据不一致信号）。
 * - previousVersionId：前版引用（CAS 提升链与可恢复候选定位）。
 * - appointmentId：保存时的任职用途；受限初始化阶段允许缺省。
 */
const documentTypeSchema = literalUnionSchema([
  "profile",
  "avatar",
  "soul",
  "operating",
  "work",
] as const);

const documentVersionRecordSchema: SoloipsSchema<SoloipsDocumentVersionRecord> =
  objectSchema<SoloipsDocumentVersionRecord>({
    versionId: documentVersionIdSchema,
    ownerId: employeeIdSchema,
    documentType: documentTypeSchema,
    content: stringSchema(),
    digest: nonEmptyStringSchema(),
    previousVersionId: optionalSchema(documentVersionIdSchema),
    appointmentId: optionalSchema(appointmentIdSchema),
  });

/**
 * operation（操作台账 = 「准入」候选表）：DEV-08 operationId 纪律 + ORG-05 恢复窗口。
 * - id：稳定操作键；ACC-05「核对 operationId」、幂等重放的主键。
 * - kind：恢复核对路由 + operationId 跨种类复用冲突检测。
 * - status：意图先行（pending）→ 提交（committed）；崩溃留痕供接管方核对
 *   （SOLO-FENCE-01 §3「核对未决 operationId」）。
 * - employeeId：未知结果按员工阻塞相关新操作的核对锚点（ORG-05）。
 * - intent：恢复所需最小意图（大字段如正文不入意图，以 digest 代替）。
 * - result：已提交结果；同 operationId 重放直接返回，不重复执行
 *   （ACC-04「重试不产生第二条员工身份/第二个任职」）。
 */
const operationRecordSchema: SoloipsSchema<SoloipsOperationRecord> =
  objectSchema<SoloipsOperationRecord>({
    id: operationIdSchema,
    kind: literalUnionSchema([
      "company.create",
      "department.create",
      "employee.create",
      "appointment.create",
      "appointment.revoke",
      "employee.initialize-memory",
      "employee.verify-capability",
      "employee.record-assembly",
      "document.save",
      "work-entry.request",
    ] as const),
    status: literalUnionSchema(["pending", "committed"] as const),
    employeeId: optionalSchema(employeeIdSchema),
    intent: jsonRecordSchema(),
    result: optionalSchema(jsonRecordSchema()),
  });

// ─────────────────────────────────────────────────────────────────────────────
// domain spec（单 domain、单 opener；core 是唯一业务 opener 包，ARCH-D02）
// ─────────────────────────────────────────────────────────────────────────────

/** 各表的静态声明：键为品牌 id，值为上面的记录 schema（显式定型，无推断歧义）。 */
const SOLOIPS_COMPANY_TABLES: {
  readonly company: SoloipsDomainTableSpec<SoloipsCompanyId, SoloipsCompanyRecord>;
  readonly department: SoloipsDomainTableSpec<SoloipsDepartmentId, SoloipsDepartmentRecord>;
  readonly employee: SoloipsDomainTableSpec<SoloipsEmployeeId, SoloipsEmployeeRecord>;
  readonly appointment: SoloipsDomainTableSpec<SoloipsAppointmentId, SoloipsAppointmentRecord>;
  readonly document_version: SoloipsDomainTableSpec<
    SoloipsDocumentVersionId,
    SoloipsDocumentVersionRecord
  >;
  readonly operation: SoloipsDomainTableSpec<SoloipsOperationId, SoloipsOperationRecord>;
} = {
  company: { valueSchema: companyRecordSchema },
  department: { valueSchema: departmentRecordSchema },
  employee: { valueSchema: employeeRecordSchema },
  appointment: { valueSchema: appointmentRecordSchema },
  document_version: { valueSchema: documentVersionRecordSchema },
  operation: { valueSchema: operationRecordSchema },
};

export const SOLOIPS_COMPANY_DOMAIN_SPEC = {
  name: SOLOIPS_COMPANY_DOMAIN_NAME,
  version: SOLOIPS_COMPANY_DOMAIN_VERSION,
  tables: SOLOIPS_COMPANY_TABLES,
} as const satisfies SoloipsDomainSpec;

/** 表名联合（供提交门与读路径共用）。 */
export type SoloipsCompanyTableName = keyof typeof SOLOIPS_COMPANY_TABLES;
