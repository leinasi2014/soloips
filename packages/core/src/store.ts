/**
 * store：唯一 opener 的打开路径 + 业务命令实现。
 *
 * 打开顺序（SEAM-12/13/14，设计探针 consumer.ts 同序）：
 *   1. acquireWriterLease({root})——在装载任何可写 domain/缓存**之前**取得跨进程写权；
 *   2. createStack({root})——backend 与 facility 由同一 canonical root 构造；
 *   3. requireFacility(stack.facility)——facility 必须显式传入；类型层无回退，
 *      本文件（以及 core 全部源码）不存在 `ctx.storageDomain` 回退（SEAM-X1）；
 *   4. facility.open(SPEC)——租约窗口内打开业务 domain（唯一 opener）。
 *   释放逆序：domain.close() → stack.dispose() → lease.dispose()。
 *
 * 失败语义：任一步失败即释放已建立部分并抛出，服务不发布（fail-closed）。
 * 崩溃遗留的未决操作不自动清理，交由接管方经 listPendingOperations 核对
 * （SOLO-FENCE-01 §3/§4：不按文件年龄擅自清锁，在线入口不绕过停写边界）。
 */

import type {
  SoloipsDomain,
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

import type {
  SoloipsAppointmentId,
  SoloipsAppointmentRecord,
  SoloipsCommitOutcome,
  SoloipsCompanyId,
  SoloipsCompanyRecord,
  SoloipsCoreBinding,
  SoloipsCoreService,
  SoloipsCreateAppointmentInput,
  SoloipsCreateAppointmentResult,
  SoloipsCreateCompanyInput,
  SoloipsCreateCompanyResult,
  SoloipsCreateDepartmentInput,
  SoloipsCreateDepartmentResult,
  SoloipsCreateEmployeeInput,
  SoloipsCreateEmployeeResult,
  SoloipsDepartmentId,
  SoloipsDepartmentRecord,
  SoloipsDocumentType,
  SoloipsDocumentVersionId,
  SoloipsDocumentVersionRecord,
  SoloipsEmployeeId,
  SoloipsEmployeeRecord,
  SoloipsInitializeMemoryInput,
  SoloipsInitializeMemoryResult,
  SoloipsOnboardingStatus,
  SoloipsOperationId,
  SoloipsOperationRecord,
  SoloipsRecordAssemblyInput,
  SoloipsRecordAssemblyResult,
  SoloipsRequiredDocumentType,
  SoloipsRevokeAppointmentInput,
  SoloipsRevokeAppointmentResult,
  SoloipsSaveDocumentInput,
  SoloipsSaveDocumentResult,
  SoloipsVerifyCapabilityInput,
  SoloipsVerifyCapabilityResult,
  SoloipsWorkEntryAdmitted,
  SoloipsWorkEntryInput,
  SoloipsWorkEntryOrigin,
  SoloipsWorkEntryOutcome,
} from "./contracts.js";
import { SoloipsCommitGate } from "./commit-gate.js";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "./domain.js";
import { soloipsDigestOf } from "./digest.js";
import { SoloipsCoreError } from "./errors.js";
import {
  asOperationId,
  isAppointmentId,
  isCompanyId,
  isDepartmentId,
  isDocumentVersionId,
  isEmployeeId,
  isOperationIdShape,
  newAppointmentId,
  newCompanyId,
  newDepartmentId,
  newEmployeeId,
  newDocumentVersionId,
} from "./ids.js";
import { evaluateOnboarding, type SoloipsOnboardingReadModel } from "./onboarding.js";

export interface SoloipsStoreOpenOptions {
  /** adapter 的 storage 端口（插件层已结构校验；测试注入 fake）。 */
  readonly storage: SoloipsStoragePort;
  /** 已解析的绝对存储根；adapter 不做 home 解析，core 不接受相对路径。 */
  readonly root: string;
  readonly backend?: string;
}

/** 公司树最大深度（防止过度嵌套） */
const MAX_TREE_DEPTH = 10;

/** POSIX 或 Windows 盘符绝对路径的形状判定（不引入 node:path，保持可移植）。 */
function isAbsoluteLikePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function validateRoot(root: string): void {
  if (root.length === 0 || root.trim() !== root || !isAbsoluteLikePath(root)) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_CONFIG_INVALID",
      "storageRoot 必须是已解析、无首尾空白的绝对路径",
    );
  }
}

function requireOperationIdShape(value: string): void {
  if (!isOperationIdShape(value)) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_VALIDATION",
      "operationId 必须是非空白且长度不超过 256 的字符串",
    );
  }
}

function requireNonEmpty(value: string, what: string): void {
  if (value.trim().length === 0) {
    throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", `${what}不能为空白`);
  }
}

const REQUIRED_DOCUMENT_TYPES: readonly SoloipsRequiredDocumentType[] = [
  "profile",
  "avatar",
  "soul",
  "operating",
];

/** 四类必需文档的运行期判定（JS 调用方的 documentType 不受类型保护）。 */
function isRequiredDocumentType(value: SoloipsDocumentType): value is SoloipsRequiredDocumentType {
  return (REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(value);
}

const WORK_ENTRY_ORIGINS: readonly SoloipsWorkEntryOrigin[] = [
  "manager-dispatch",
  "self-claim",
  "scheduler-assign",
];

/**
 * 打开公司存储（唯一 opener 路径）。顺序契约见文件头。
 * 返回的 service 不暴露 domain/表句柄：一切持久写都经提交门。
 */
export async function openSoloipsCompanyStore(
  options: SoloipsStoreOpenOptions,
): Promise<SoloipsCoreService> {
  validateRoot(options.root);

  // 1. 跨进程写权先行（ORG-06 / SOLO-FENCE-01 §2）。
  const lease = await options.storage.acquireWriterLease({ root: options.root });

  let stack: SoloipsStorageStack;
  try {
    // 2. 同一 canonical root 构造 backend + facility。
    stack = await options.storage.createStack({
      root: options.root,
      ...(options.backend === undefined ? {} : { backend: options.backend }),
    });
  } catch (error) {
    await lease.dispose();
    throw error;
  }

  // 3. 显式传入 facility：requireFacility(undefined) 是类型错误，无运行期回退。
  const facility = options.storage.requireFacility(stack.facility);

  let domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>;
  try {
    // 4. 租约窗口内打开业务 domain（唯一 opener；同实例重复 open 由 adapter 拒绝）。
    domain = await facility.open(SOLOIPS_COMPANY_DOMAIN_SPEC);
  } catch (error) {
    try {
      await stack.dispose();
    } finally {
      await lease.dispose();
    }
    throw error;
  }

  return new SoloipsCompanyStore(domain, stack, lease);
}

class SoloipsCompanyStore implements SoloipsCoreService {
  #closed = false;
  readonly #domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>;
  readonly #stack: SoloipsStorageStack;
  readonly #lease: SoloipsWriterLease;
  readonly #gate: SoloipsCommitGate;

  constructor(
    domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>,
    stack: SoloipsStorageStack,
    lease: SoloipsWriterLease,
  ) {
    this.#domain = domain;
    this.#stack = stack;
    this.#lease = lease;
    this.#gate = new SoloipsCommitGate(domain, lease);
  }

  get binding(): SoloipsCoreBinding {
    return {
      root: this.#stack.binding.root,
      backend: this.#stack.binding.backend,
      storageId: this.#stack.binding.storageId,
      domainName: this.#domain.name,
      leaseGeneration: this.#lease.generation,
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    // 逆序释放（SEAM-14）：domain（排空已排队写入）→ stack → lease。
    try {
      await this.#domain.close();
    } finally {
      try {
        await this.#stack.dispose();
      } finally {
        await this.#lease.dispose();
      }
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new SoloipsCoreError("SOLOIPS_CORE_STORE_CLOSED", "store 已关闭，拒绝业务读写");
    }
  }

  // ── 读辅助 ────────────────────────────────────────────────────────────────

  #readCompany(id: string): SoloipsCompanyRecord {
    const record = this.#domain.table("company").get(id as SoloipsCompanyId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `公司 ${id} 不存在`);
    }
    return record;
  }

  #readDepartment(id: string): SoloipsDepartmentRecord {
    const record = this.#domain.table("department").get(id as SoloipsDepartmentId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `部门 ${id} 不存在`);
    }
    return record;
  }

  #readEmployee(id: string): SoloipsEmployeeRecord {
    const record = this.#domain.table("employee").get(id as SoloipsEmployeeId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `员工 ${id} 不存在`);
    }
    return record;
  }

  #readAppointment(id: string): SoloipsAppointmentRecord {
    const record = this.#domain.table("appointment").get(id as SoloipsAppointmentId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `任职 ${id} 不存在`);
    }
    return record;
  }

  #readDocumentVersion(id: string): SoloipsDocumentVersionRecord {
    const record = this.#domain.table("document_version").get(id as SoloipsDocumentVersionId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `文档版本 ${id} 不存在`);
    }
    return record;
  }

  #readModel(): SoloipsOnboardingReadModel {
    return {
      getEmployee: (id) => this.#domain.table("employee").get(id),
      listAppointmentsByEmployee: (employeeId) => {
        const found: SoloipsAppointmentRecord[] = [];
        for (const [, record] of this.#domain.table("appointment").entries()) {
          if (record.employeeId === employeeId) found.push(record);
        }
        return found;
      },
      getDocumentVersion: (id) =>
        isDocumentVersionId(id)
          ? this.#domain.table("document_version").get(id as SoloipsDocumentVersionId)
          : undefined,
    };
  }

  /** 同一员工下一个任职代际：现有最高代际 + 1（撤销不复活旧代际，ORG-06）。 */
  #nextGeneration(employeeId: string): number {
    let max = 0;
    for (const [, record] of this.#domain.table("appointment").entries()) {
      if (record.employeeId === employeeId && record.generation > max) max = record.generation;
    }
    return max + 1;
  }

  // ── 组织命令 ──────────────────────────────────────────────────────────────

  /**
   * 计算公司树的深度（从根到目标公司的边数，根深度为 0）
   * @throws 祖先链断裂时抛出错误
   */
  #computeDepth(companyId: SoloipsCompanyId): number {
    let depth = 0;
    let current: SoloipsCompanyRecord | undefined = this.#domain.table("company").get(companyId);
    while (current?.parentCompanyId !== undefined && depth < MAX_TREE_DEPTH) {
      depth++;
      const parent = this.#domain.table("company").get(current.parentCompanyId);
      if (parent === undefined) {
        // 祖先链断裂：父公司 ID 存在但记录缺失
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          `祖先链断裂：父公司 ${current.parentCompanyId} 不存在`,
        );
      }
      current = parent;
    }
    return depth;
  }

  async createCompany(
    input: SoloipsCreateCompanyInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateCompanyResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.name, "公司名");

    // 验证父公司存在（如有提供）
    if (input.parentCompanyId !== undefined) {
      if (!isCompanyId(input.parentCompanyId)) {
        throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "parentCompanyId 形状不合法");
      }
      const parent = this.#readCompany(input.parentCompanyId);
      // 检查父公司类型：operation 类型不能有子级（平台公司和用户公司可以有）
      if (parent.type === "operation") {
        throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "运营子公司不能创建子级公司");
      }
      // 检查深度限制（根深度为 0，到根的边数）
      const parentDepth = this.#computeDepth(input.parentCompanyId);
      if (parentDepth >= MAX_TREE_DEPTH - 1) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          `公司树深度不能超过 ${MAX_TREE_DEPTH} 层`,
        );
      }
    }

    const companyType = input.type ?? "enterprise";
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "company.create",
        intent: {
          name: input.name,
          type: companyType,
          ...(input.parentCompanyId !== undefined ? { parentCompanyId: input.parentCompanyId } : {}),
        },
      },
      async (publish) => {
        const id = newCompanyId();
        await publish.put("company", id, {
          id,
          // accountId 由 Host 层注入（SoloipsCoreService 接口契约）
          // 测试场景使用 "seed" 占位
          accountId: "seed",
          ...(input.parentCompanyId !== undefined ? { parentCompanyId: input.parentCompanyId } : {}),
          type: companyType,
          name: input.name,
          status: "active",
          createdAt: new Date().toISOString(),
        });
        return { companyId: id };
      },
    );
  }

  async createDepartment(
    input: SoloipsCreateDepartmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateDepartmentResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.name, "部门名");
    if (!isCompanyId(input.companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    this.#readCompany(input.companyId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "department.create",
        intent: { companyId: input.companyId, name: input.name },
      },
      async (publish) => {
        const id = newDepartmentId();
        await publish.put("department", id, {
          id,
          companyId: input.companyId,
          name: input.name,
        });
        return { departmentId: id };
      },
    );
  }

  async createEmployee(
    input: SoloipsCreateEmployeeInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateEmployeeResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.displayName, "员工显示名");
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "employee.create",
        intent: { displayName: input.displayName },
      },
      async (publish) => {
        const id = newEmployeeId();
        await publish.put("employee", id, {
          id,
          displayName: input.displayName,
          currentDocuments: {},
          assemblyEvidence: {},
          memoryInitialized: false,
          verifiedCapabilities: [],
        });
        return { employeeId: id };
      },
    );
  }

  async createAppointment(
    input: SoloipsCreateAppointmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateAppointmentResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    if (!isDepartmentId(input.departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    const required = input.requiredCapabilities ?? [];
    for (const capability of required) {
      requireNonEmpty(capability, "岗位必需能力名");
    }
    this.#readEmployee(input.employeeId);
    this.#readDepartment(input.departmentId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "appointment.create",
        employeeId: input.employeeId,
        intent: {
          employeeId: input.employeeId,
          departmentId: input.departmentId,
          requiredCapabilities: [...required],
        },
      },
      async (publish) => {
        const id = newAppointmentId();
        const generation = this.#nextGeneration(input.employeeId);
        await publish.put("appointment", id, {
          id,
          employeeId: input.employeeId,
          departmentId: input.departmentId,
          requiredCapabilities: [...required],
          generation,
          status: "active",
        });
        return { appointmentId: id, generation };
      },
    );
  }

  async revokeAppointment(
    input: SoloipsRevokeAppointmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsRevokeAppointmentResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isAppointmentId(input.appointmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "appointmentId 形状不合法");
    }
    this.#readAppointment(input.appointmentId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "appointment.revoke",
        intent: { appointmentId: input.appointmentId },
      },
      async (publish) => {
        const updated = await publish.update("appointment", input.appointmentId, (current) => ({
          ...current,
          status: "revoked" as const,
        }));
        return { appointmentId: input.appointmentId, status: updated.status };
      },
    );
  }

  // ── 入职事实命令 ──────────────────────────────────────────────────────────

  async initializeEmployeeMemory(
    input: SoloipsInitializeMemoryInput,
  ): Promise<SoloipsCommitOutcome<SoloipsInitializeMemoryResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    this.#readEmployee(input.employeeId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "employee.initialize-memory",
        employeeId: input.employeeId,
        intent: {},
      },
      async (publish) => {
        const updated = await publish.update("employee", input.employeeId, (current) => ({
          ...current,
          memoryInitialized: true,
        }));
        return { employeeId: input.employeeId, memoryInitialized: updated.memoryInitialized };
      },
    );
  }

  async verifyEmployeeCapability(
    input: SoloipsVerifyCapabilityInput,
  ): Promise<SoloipsCommitOutcome<SoloipsVerifyCapabilityResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.capability, "能力名");
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    this.#readEmployee(input.employeeId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "employee.verify-capability",
        employeeId: input.employeeId,
        intent: { capability: input.capability },
      },
      async (publish) => {
        const updated = await publish.update("employee", input.employeeId, (current) =>
          current.verifiedCapabilities.includes(input.capability)
            ? current
            : {
                ...current,
                verifiedCapabilities: [...current.verifiedCapabilities, input.capability],
              },
        );
        return { employeeId: input.employeeId, verifiedCapabilities: updated.verifiedCapabilities };
      },
    );
  }

  async recordAssemblyEvidence(
    input: SoloipsRecordAssemblyInput,
  ): Promise<SoloipsCommitOutcome<SoloipsRecordAssemblyResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    if (!REQUIRED_DOCUMENT_TYPES.includes(input.documentType)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "装配证据只覆盖四类必需文档");
    }
    if (!isDocumentVersionId(input.versionId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "versionId 形状不合法");
    }
    const version = this.#readDocumentVersion(input.versionId);
    if (version.ownerId !== input.employeeId) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", "装配证据只能指向本人保存的版本");
    }
    if (version.documentType !== input.documentType) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", "装配证据的文档类型与版本记录不符");
    }
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "employee.record-assembly",
        employeeId: input.employeeId,
        intent: { documentType: input.documentType, versionId: input.versionId },
      },
      async (publish) => {
        const updated = await publish.update("employee", input.employeeId, (current) => ({
          ...current,
          assemblyEvidence: {
            ...current.assemblyEvidence,
            [input.documentType]: input.versionId,
          },
        }));
        return { employeeId: input.employeeId, assemblyEvidence: updated.assemblyEvidence };
      },
    );
  }

  // ── 文档/作品版本命令 ─────────────────────────────────────────────────────

  async saveEmployeeDocument(
    input: SoloipsSaveDocumentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsSaveDocumentResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    if (input.appointmentId !== undefined) {
      if (!isAppointmentId(input.appointmentId)) {
        throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "appointmentId 形状不合法");
      }
      this.#readAppointment(input.appointmentId);
    }
    this.#readEmployee(input.employeeId);
    const requiredType: SoloipsRequiredDocumentType | undefined = isRequiredDocumentType(
      input.documentType,
    )
      ? input.documentType
      : undefined;
    const digest = soloipsDigestOf(input.content);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "document.save",
        employeeId: input.employeeId,
        intent: { employeeId: input.employeeId, documentType: input.documentType, digest },
      },
      async (publish) => {
        // 顺序契约（02-company-contract §11.1）：正文先耐久保存，再 CAS 提升当前引用。
        const versionId = newDocumentVersionId();
        const employeeNow = this.#readEmployee(input.employeeId);
        const previousId =
          requiredType === undefined ? undefined : employeeNow.currentDocuments[requiredType];
        await publish.put("document_version", versionId, {
          versionId,
          ownerId: input.employeeId,
          documentType: input.documentType,
          content: input.content,
          digest,
          ...(previousId === undefined ? {} : { previousVersionId: previousId }),
          ...(input.appointmentId === undefined ? {} : { appointmentId: input.appointmentId }),
        });
        if (requiredType === undefined) {
          return { versionId, digest, outcome: "saved" as const };
        }
        if (
          input.expectedPreviousVersion !== undefined &&
          input.expectedPreviousVersion !== previousId
        ) {
          // 冲突：版本已持久保留为可恢复候选，不假报生效。
          return {
            versionId,
            digest,
            outcome: "conflict" as const,
            ...(previousId === undefined ? {} : { currentVersionId: previousId }),
          };
        }
        await publish.update("employee", input.employeeId, (current) => ({
          ...current,
          currentDocuments: { ...current.currentDocuments, [requiredType]: versionId },
        }));
        return { versionId, digest, outcome: "promoted" as const };
      },
    );
  }

  // ── 工作准入（SOLO-ACC-04：三条路径共用同一判定） ─────────────────────────

  async requestWorkEntry(input: SoloipsWorkEntryInput): Promise<SoloipsWorkEntryOutcome> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    requireNonEmpty(input.taskId, "任务引用");
    if (!WORK_ENTRY_ORIGINS.includes(input.origin)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "origin 必须是三条准入路径之一");
    }
    const operationId = asOperationId(input.operationId);

    const probe = this.#gate.probe(operationId);
    if (probe === "unknown") {
      return { status: "unknown" };
    }
    if (probe === "replayed") {
      const record = this.#gate.getOperation(operationId);
      if (
        record === undefined ||
        record.kind !== "work-entry.request" ||
        record.result === undefined
      ) {
        throw new SoloipsCoreError("SOLOIPS_CORE_CONFLICT", "operationId 与既有操作冲突，无法重放");
      }
      // 受控单次断言：record.result 由本命令的 admitted 结果持久而来。
      return {
        status: "admitted",
        replayed: true,
        result: record.result as SoloipsWorkEntryAdmitted,
      };
    }

    // 该员工存在未决操作时阻塞新准入（ORG-05「未知仍阻止该员工其他新 operationId」）。
    if (
      this.#gate.listPendingOperations().some((record) => record.employeeId === input.employeeId)
    ) {
      return { status: "refused", reason: "employee-operation-unknown" };
    }

    const status: SoloipsOnboardingStatus = evaluateOnboarding(input.employeeId, this.#readModel());
    if (!status.ready) {
      // 拒绝不写任何状态：缺项可修正后重试（重试重新判定，重试有界=每次调用单次
      // 判定、无内部循环重试；SOLO-ACC-04「任务保持 pending」——core 不产生准入事实）。
      return { status: "refused", reason: "onboarding-not-ready", gaps: status.gaps };
    }

    const admitted: SoloipsWorkEntryAdmitted = {
      status: "admitted",
      employeeId: input.employeeId,
      appointmentId: status.appointmentId,
      generation: status.generation,
      taskId: input.taskId,
      origin: input.origin,
    };
    const outcome = await this.#gate.commit(
      {
        operationId,
        kind: "work-entry.request",
        employeeId: input.employeeId,
        intent: { employeeId: input.employeeId, taskId: input.taskId, origin: input.origin },
      },
      () => Promise.resolve(admitted),
    );
    if (outcome.status === "unknown") {
      return { status: "unknown" };
    }
    return { status: "admitted", replayed: outcome.status === "replayed", result: outcome.result };
  }

  // ── 查询投影（只读；返回介质对象，调用方不得原地修改） ─────────────────────

  checkOnboarding(employeeId: SoloipsEmployeeId): SoloipsOnboardingStatus {
    this.#assertOpen();
    if (!isEmployeeId(employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    return evaluateOnboarding(employeeId, this.#readModel());
  }

  getCompany(id: SoloipsCompanyId): SoloipsCompanyRecord | undefined {
    this.#assertOpen();
    return this.#domain.table("company").get(id);
  }

  /** 获取指定公司的所有直接子公司 */
  listSubsidiaries(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[] {
    this.#assertOpen();
    if (!isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    const found: SoloipsCompanyRecord[] = [];
    for (const [, record] of this.#domain.table("company").entries()) {
      if (record.parentCompanyId === companyId) found.push(record);
    }
    return found;
  }

  /** 获取公司树（顶层公司及所有下级公司，使用 DFS 保持原有遍历顺序） */
  getCompanyTree(companyId: SoloipsCompanyId): readonly SoloipsCompanyRecord[] {
    this.#assertOpen();
    if (!isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }

    // O(n) 算法：一次性构建 id→record 和 parent→children 映射
    const idMap = new Map<string, SoloipsCompanyRecord>();
    const childrenMap = new Map<string, string[]>();

    for (const [, record] of this.#domain.table("company").entries()) {
      idMap.set(record.id, record);
      const parentId = record.parentCompanyId ?? "ROOT";
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(record.id);
    }

    // 检查根公司是否存在
    if (!idMap.has(companyId)) return [];

    // DFS 遍历（保持原有顺序）
    const result: SoloipsCompanyRecord[] = [];
    const stack: string[] = [companyId];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const company = idMap.get(current);
      if (company) result.push(company);

      const children = childrenMap.get(current) ?? [];
      // 逆序入栈以保持原有顺序
      for (let i = children.length - 1; i >= 0; i--) {
        const childId = children[i];
        if (childId !== undefined && !visited.has(childId)) {
          stack.push(childId);
        }
      }
    }

    return result;
  }

  listDepartments(companyId: SoloipsCompanyId): readonly SoloipsDepartmentRecord[] {
    this.#assertOpen();
    const found: SoloipsDepartmentRecord[] = [];
    for (const [, record] of this.#domain.table("department").entries()) {
      if (record.companyId === companyId) found.push(record);
    }
    return found;
  }

  getEmployee(id: SoloipsEmployeeId): SoloipsEmployeeRecord | undefined {
    this.#assertOpen();
    return this.#domain.table("employee").get(id);
  }

  getAppointment(id: SoloipsAppointmentId): SoloipsAppointmentRecord | undefined {
    this.#assertOpen();
    return this.#domain.table("appointment").get(id);
  }

  getDocumentVersion(id: SoloipsDocumentVersionId): SoloipsDocumentVersionRecord | undefined {
    this.#assertOpen();
    return this.#domain.table("document_version").get(id);
  }

  getOperation(id: SoloipsOperationId): SoloipsOperationRecord | undefined {
    this.#assertOpen();
    return this.#gate.getOperation(id);
  }

  listPendingOperations(): readonly SoloipsOperationRecord[] {
    this.#assertOpen();
    return this.#gate.listPendingOperations();
  }
}
