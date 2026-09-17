/**
 * store：唯一 opener 的打开路径 + 业务命令实现。
 *
 * 打开顺序（SEAM-12/13/14，设计探针 consumer.ts 同序）：
 *   1. acquireWriterLease({root})——在装载任何可写 domain/缓存**之前**取得跨进程写权；
 *   2. createStack({root})——backend 与 facility 由同一 canonical root 构造；
 *   3. requireFacility(stack.facility)——facility 必须显式传入；类型层无回退，
 *      本文件（以及 core 全部源码）不存在 `ctx.storageDomain` 回退（SEAM-X1）；
 *   4. facility.open(SPEC)——租约窗口内打开业务 domain（唯一 opener）；
 *   5. 账户绑定校验（§3.1）——读根级绑定元数据与公司记录，不符即拒（fail-closed）。
 *      必须在 open **之后**：两类事实都只能经已打开的 domain 读取（无旁路读路径）。
 *   释放逆序：domain.close() → stack.dispose() → lease.dispose()。
 *
 * 失败语义：任一步失败即释放已建立部分并抛出，服务不发布（fail-closed）。
 * 崩溃遗留的未决操作不自动清理，交由接管方经 listPendingOperations 核对
 * （SOLO-FENCE-01 §3/§4：不按文件年龄擅自清锁，在线入口不绕过停写边界）。
 *
 * 〔裁定〕§3.1「判据的字段落点」〔待决〕项——本切片实现裁定为**打开时校验**：
 * 不给 operation 记录加绑定代际字段，而在打开时按绑定元数据整根拒绝。
 * 理由：绑定不符时**整个根**都不属于当前账户，此时任何 operation（含换绑前的）
 * 都不应重放——按根拒绝比逐条给 operation 打代际标记更强且更简单，且不需要
 * 改动 operation schema（避免一次破坏性 schema 变更，见 R-3 的迁移边界）。
 * 「换绑后重放换绑后 operationId」按常规语义返回原结果：绑定未变即不受影响。
 */

import type {
  SoloipsDomain,
  SoloipsDomainGlobal,
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

import type {
  SoloipsAppointmentId,
  SoloipsAppointmentRecord,
  SoloipsAppointmentRole,
  SoloipsAppointmentScope,
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
  SoloipsJsonValue,
  SoloipsOnboardingStatus,
  SoloipsOperationId,
  SoloipsOperationRecord,
  SoloipsRecordAssemblyInput,
  SoloipsRecordAssemblyResult,
  SoloipsRequiredDocumentType,
  SoloipsRevokeAppointmentInput,
  SoloipsRevokeAppointmentResult,
  SoloipsRootBindingRecord,
  SoloipsSaveDocumentInput,
  SoloipsSaveDocumentResult,
  SoloipsTeamId,
  SoloipsVerifyCapabilityInput,
  SoloipsVerifyCapabilityResult,
  SoloipsWorkEntryAdmitted,
  SoloipsWorkEntryInput,
  SoloipsWorkEntryOrigin,
  SoloipsWorkEntryOutcome,
} from "./contracts.js";
import { SOLOIPS_COMPANY_DOMAIN_NAME, SOLOIPS_PLACEHOLDER_ACCOUNT_ID } from "./contracts.js";
import { SoloipsCommitGate } from "./commit-gate.js";
import { SOLOIPS_COMPANY_DOMAIN_SPEC } from "./domain.js";
import { soloipsDigestOf } from "./digest.js";
import { SoloipsCoreError, wrapLeaseFailure } from "./errors.js";
import {
  asOperationId,
  isAppointmentId,
  isCompanyId,
  isDepartmentId,
  isDocumentVersionId,
  isEmployeeId,
  isOperationIdShape,
  isTeamId,
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
  /**
   * 部署层注入的账户（S0 过渡例外：config 注入而非 Session 派生，data-contract §3.1）。
   *
   * 〔约束〕必填。缺失/空白/占位账户（`SOLOIPS_PLACEHOLDER_ACCOUNT_ID`）一律
   * `SOLOIPS_CORE_CONFIG_INVALID`——账户是**根级绑定事实**的比对基准，
   * 缺省一个「安全默认账户」会让绑定校验退化成无校验。
   */
  readonly accountId: string;
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

/**
 * 账户形状校验（部署注入值）。
 *
 * 拒绝空白与**占位账户** `"seed"`：后者是 BE-1 之前 `createCompany` 硬编码写入的
 * 历史标记，把它当部署账户会让「存量占位数据」与「部署账户」同名，
 * 从而使 §3.1 的「不认领、不自动改归」在运行期不可判定。
 */
function validateAccountId(accountId: string): void {
  if (accountId.length === 0 || accountId.trim() !== accountId) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_CONFIG_INVALID",
      "accountId 必须是非空、无首尾空白的字符串（由部署层经 config 注入）",
    );
  }
  if (accountId === SOLOIPS_PLACEHOLDER_ACCOUNT_ID) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_CONFIG_INVALID",
      `accountId 不得为占位账户 "${SOLOIPS_PLACEHOLDER_ACCOUNT_ID}"：该值是 BE-1 之前硬编码的存量标记，` +
        "部署层须注入真实账户标识（如 DSH_HOME/cordis.patch.yml 的 soloips-core.config.accountId）",
    );
  }
}

/** 占位账户记录的人工处置指引：给出具体重置路径（错误消息必须可行动）。 */
function placeholderResetGuidance(root: string): string {
  return (
    `按 data-contract §3.1 的「不认领、不自动改归」，core 不自动迁移。` +
    `处置：若旧数据无需保留，重置数据根（删除 ${root} 下的 ${SOLOIPS_COMPANY_DOMAIN_NAME}.db 或 ` +
    `${SOLOIPS_COMPANY_DOMAIN_NAME}/ 目录，以及根内同域的绑定与租约文件）后重新启动；` +
    `若需保留，须经独立切片的显式迁移脚本改归目标账户并留痕`
  );
}

/**
 * 取出 domain 的 global 单例句柄，并确认它可用（fail-closed）。
 *
 * 为什么需要运行期确认：core 的 spec **声明了** global 槽，因此契约要求 domain
 * 暴露可用的句柄（真实 adapter 的 `wrapHostDomain` 在 spec 有 global 时一律转发
 * 宿主句柄）。一个「spec 有 global 却不给句柄」的 storage 端口不符合冻结契约，
 * 此时**不能**降级为「跳过绑定校验」——那会让账户绑定静默失效。
 * 故以 `SOLOIPS_CORE_ADAPTER_INVALID`（端口不合契约）拒绝，并给出可行动说明。
 *
 * 该分支在实践中由不合规的测试替身触发（手写的 fake domain 忘记实现 global 槽），
 * 真实 adapter 路径不会走到这里。
 */
function requireGlobalHandle(
  domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>,
): SoloipsDomainGlobal<SoloipsRootBindingRecord> {
  // 静态类型已保证句柄存在（spec 声明了 global）；此处补**运行期**确认，
  // 因为 storage 端口在运行期可能不合契约（静态类型不设防）。
  const handle: unknown = domain.global;
  const probe = handle as { readonly get?: unknown; readonly set?: unknown } | null | undefined;
  if (typeof handle !== "object" || handle === null) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_ADAPTER_INVALID",
      "domain 未提供 global 单例句柄：core 的 spec 声明了根级绑定元数据槽，" +
        "storage 端口必须转发该句柄（否则账户绑定无法校验）；拒绝打开而不降级为「跳过绑定校验」",
    );
  }
  if (typeof probe?.get !== "function" || typeof probe.set !== "function") {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_ADAPTER_INVALID",
      "domain 的 global 单例句柄缺少 get/set：不符合冻结契约（SoloipsDomainGlobal）；拒绝打开",
    );
  }
  // 受控单次断言：上面已运行期证明 get/set 均为函数（契约要求的全部成员）。
  return handle as SoloipsDomainGlobal<SoloipsRootBindingRecord>;
}

/**
 * 打开时校验账户绑定（data-contract §3.1）——在 domain open **之后**、发布服务之前。
 *
 * 为什么必须在 open 之后：绑定元数据与公司记录都只能经**已打开**的 domain 读取
 * （core 不存在绕过 opener 的读路径，SEAM-X1）。因此「先 open、再校验、失败即逆序
 * 释放并抛出」是本设计的固有顺序；校验失败时服务不发布（fail-closed）。
 *
 * 三条判据（任一不符即 `SOLOIPS_CORE_ACCOUNT_MISMATCH`，且**不写任何状态**）：
 *  1. **绑定元数据**：已绑定且账户不符 → 拒绝。这条覆盖「换绑后旧 operation 重放」：
 *     绑定不符即拒，旧操作的意图不会作用于新账户的根（§3.1 换绑规则表）。
 *  2. **存量占位数据**：根内任何公司记录的 `accountId` 为占位账户 → 拒绝 + 处置指引。
 *     不静默认领为部署账户的数据。
 *  3. **异账户公司记录**：根内任何公司记录的 `accountId` 与部署账户不符 → 拒绝
 *     （「一个业务存储根只绑定一个账户」）。
 *
 * 首次打开（未绑定）时写入绑定元数据：**先校验根内记录、再写绑定**，避免
 * 「校验失败却已留下绑定」的半途状态。该写入与业务写同样受写权约束——
 * 写前复核租约（binding 是介质上的持久事实，不得成为绕过 fence 的写路径）。
 */
async function verifyAccountBinding(
  domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>,
  root: string,
  accountId: string,
  lease: SoloipsWriterLease,
): Promise<void> {
  const globalHandle = requireGlobalHandle(domain);

  // 1. 绑定元数据先行（「打开时先读绑定元数据再校验根内公司记录」）。
  const binding = globalHandle.get();
  if (binding.state === "bound" && binding.accountId !== accountId) {
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_ACCOUNT_MISMATCH",
      `存储根已绑定账户 "${binding.accountId}"（代际 ${binding.generation}，绑定于 ${binding.boundAt}），` +
        `与部署账户 "${accountId}" 不符；拒绝打开。` +
        "换绑后旧 operationId 不得重放（data-contract §3.1），" +
        "如需换绑请显式重置或迁移数据根",
    );
  }

  // 2/3. 根内公司记录逐条比对（§3.1「根内出现其他账户的公司记录即拒绝打开」）。
  for (const [id, record] of domain.table("company").entries()) {
    if (record.accountId === accountId) continue;
    if (record.accountId === SOLOIPS_PLACEHOLDER_ACCOUNT_ID) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_ACCOUNT_MISMATCH",
        `公司 ${id} 属于占位账户 "${SOLOIPS_PLACEHOLDER_ACCOUNT_ID}"（BE-1 之前的硬编码占位数据），` +
          `与部署账户 "${accountId}" 不符；拒绝打开。${placeholderResetGuidance(root)}`,
      );
    }
    throw new SoloipsCoreError(
      "SOLOIPS_CORE_ACCOUNT_MISMATCH",
      `公司 ${id} 属于账户 "${record.accountId}"，与部署账户 "${accountId}" 不符；` +
        `一个业务存储根只绑定一个账户（data-contract §3.1），拒绝打开。` +
        `根：${root}`,
    );
  }

  // 4. 首次打开（未绑定）：校验通过后写入绑定事实（写前复核写权）。
  if (binding.state === "unbound") {
    try {
      await lease.assertHeld();
    } catch (error) {
      throw wrapLeaseFailure("account-binding", error);
    }
    await domain.global.set({
      state: "bound",
      accountId,
      generation: 1,
      boundAt: new Date().toISOString(),
    });
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
 * 岗位/作用域匹配表（BE-2 岗位校验）：角色的层级与作用域必须一致。
 *
 * 依据 data-contract §2.1 的角色定义（公司级/部门级/团队级），只落**数据层**
 * 一致性——`department_lead` 是部门级角色，配公司级作用域即矛盾。
 *
 * 〔`member` 归团队级的依据〕§2.1 对该值只写「普通成员」未标层级，但其**唯一**
 * 已登记用法是团队组成：§2.1.1 的「一个团队恰好一名 `team_lead` + N 名 `member`」
 * 与 §2.1「按当前有效代际取 `team_lead`/`member` 任职」两处都把它读作**团队级**
 * 任职。本表据此归团队级（**推断**，锚点已注明；若后续裁定 member 可跨级，改本表
 * 一处即可）。
 *
 * 〔`owner` 的契约语义与实现缺口的差异〕**owner 契约语义为账户级**（data-contract
 * §2.1 :201 的注释原文「公司所有者（账户级）」），但当前 `scope` 联合**无账户级
 * 分支**（同节 :192-195 只有 `company`/`department`/`team` 三个变体，且三分支都带
 * `companyId`）。故本表**暂映射 `company`**——这是在既有联合内能表达的最接近形态，
 * 不是「owner 已被正确定义」的结论。
 * **〔实现缺口：账户级 scope 待决，需要跨公司 owner 表达时扩第四分支〕**：当前映射
 * 使 owner 任职被限定在**单个** `companyId` 上，无法表达「一个 owner 跨多家公司」；
 * 若产品侧出现跨公司 owner 需求（或子公司由母公司 owner 统辖的裁定落地），须扩
 * `SoloipsAppointmentScope` 的第四分支并同步改本表——届时 owner 的映射变更会同时
 * 影响已写入的记录，属需要显式迁移的变更，不得静默改判。
 *
 * 〔边界〕本表**不做**授权判定：它不回答「谁有权创建什么」，只回答「这条任职记录
 * 自身的角色与作用域是否自洽」。基于 actor 的角色白名单（backend-design §2.2
 * 「不能自我升权」）**不在本切片**——SA-02 声明 Host 传入的 actor 属半可信输入、
 * 不得作授权唯一依据，且 M0.1 无权限服务（data-contract §3.2 A-4/A-6）。
 */
const ROLE_SCOPE_KIND: Readonly<Record<SoloipsAppointmentRole, SoloipsAppointmentScope["kind"]>> = {
  owner: "company",
  general_assistant: "company",
  department_lead: "department",
  team_lead: "team",
  member: "team",
};

/** 命令入参 `scope` 的形状校验（JS 调用方不受类型保护；unknown 进、校验后出）。 */
function requireScopeShape(value: unknown): SoloipsAppointmentScope {
  if (typeof value !== "object" || value === null) {
    throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "scope 必须是对象（判别联合）");
  }
  const raw = value as {
    readonly kind?: unknown;
    readonly companyId?: unknown;
    readonly departmentId?: unknown;
    readonly teamId?: unknown;
  };
  if (typeof raw.companyId !== "string" || !isCompanyId(raw.companyId)) {
    throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "scope.companyId 形状不合法");
  }
  // 受控单次断言：上面的形状谓词已证明是公司 id 形状（品牌断言只出现在
  // src/ids.ts 与 schema.ts 的收窄点；此处镜像 schema.ts 的做法并注明依据）。
  const companyId = raw.companyId as SoloipsCompanyId;
  if (raw.kind === "company") {
    return { kind: "company", companyId };
  }
  if (raw.kind === "department") {
    if (typeof raw.departmentId !== "string" || !isDepartmentId(raw.departmentId)) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        "scope.kind='department' 时 scope.departmentId 形状不合法",
      );
    }
    const departmentId = raw.departmentId as SoloipsDepartmentId; // 受控断言：谓词已证明形状
    return { kind: "department", companyId, departmentId };
  }
  if (raw.kind === "team") {
    if (typeof raw.teamId !== "string" || !isTeamId(raw.teamId)) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        "scope.kind='team' 时 scope.teamId 形状不合法",
      );
    }
    const teamId = raw.teamId as SoloipsTeamId; // 受控断言：谓词已证明形状
    return { kind: "team", companyId, teamId };
  }
  throw new SoloipsCoreError(
    "SOLOIPS_CORE_VALIDATION",
    "scope.kind 必须是 company | department | team 之一",
  );
}

/** 角色形状校验（JS 调用方的 role 不受类型保护）。 */
function requireRoleShape(value: unknown): SoloipsAppointmentRole {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_SCOPE_KIND, value)) {
    // 受控单次断言：hasOwnProperty 已证明 value 是 ROLE_SCOPE_KIND 的键，
    // 而该表的键集与 SoloipsAppointmentRole 一一对应（Record 类型强制）。
    return value as SoloipsAppointmentRole;
  }
  throw new SoloipsCoreError(
    "SOLOIPS_CORE_VALIDATION",
    `role 必须是 ${Object.keys(ROLE_SCOPE_KIND).join(" | ")} 之一`,
  );
}

/**
 * 作用域 → 纯 JSON 值（operation 意图的持久载荷）。
 *
 * 逐分支展开而非直接塞入联合类型：意图是**纯 JSON 记录**（`SoloipsJsonValue`），
 * 显式列出各分支的字段使「意图里到底写了什么」在代码里可读，也让 BE-3 新增
 * 分支时编译器在此处报错（不静默丢字段）。
 */
function scopeIntentOf(scope: SoloipsAppointmentScope): SoloipsJsonValue {
  switch (scope.kind) {
    case "company":
      return { kind: "company", companyId: scope.companyId };
    case "department":
      return {
        kind: "department",
        companyId: scope.companyId,
        departmentId: scope.departmentId,
      };
    case "team":
      return { kind: "team", companyId: scope.companyId, teamId: scope.teamId };
  }
}

/**
 * 打开公司存储（唯一 opener 路径）。顺序契约见文件头。
 * 返回的 service 不暴露 domain/表句柄：一切持久写都经提交门。
 *
 * 账户绑定（data-contract §3.1）在 open **之后**、发布服务之前校验：
 * 校验所需的两类事实（根级绑定元数据、公司记录）都只能经已打开的 domain 读取，
 * 故顺序为 lease → stack → facility → open → 绑定校验 → 发布。任一不符即逆序释放
 * 并抛出（fail-closed，服务不发布、无业务状态变更）。
 */
export async function openSoloipsCompanyStore(
  options: SoloipsStoreOpenOptions,
): Promise<SoloipsCoreService> {
  validateRoot(options.root);
  validateAccountId(options.accountId);

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

  try {
    // 5. 账户绑定校验 + 首次绑定写入（§3.1）；不符即拒（fail-closed）。
    await verifyAccountBinding(domain, options.root, options.accountId, lease);
  } catch (error) {
    // 校验失败：逆序释放已建立的 domain/stack/lease，服务不发布。
    try {
      await domain.close();
    } finally {
      try {
        await stack.dispose();
      } finally {
        await lease.dispose();
      }
    }
    throw error;
  }

  return new SoloipsCompanyStore(domain, stack, lease, options.accountId);
}

class SoloipsCompanyStore implements SoloipsCoreService {
  #closed = false;
  readonly #domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>;
  readonly #stack: SoloipsStorageStack;
  readonly #lease: SoloipsWriterLease;
  readonly #gate: SoloipsCommitGate;
  /**
   * 部署层注入的账户（S0 过渡例外，data-contract §3.1）。
   *
   * 〔约束〕**只读且不暴露为命令入参**：业务命令、UI、模型不得逐次传入或覆盖
   * accountId（§3.1 命令面）。它只在 store 内部用于写入公司归属与（后续切片的）
   * 归属比对——命令面不存在承载它的字段。
   */
  readonly #accountId: string;

  constructor(
    domain: SoloipsDomain<typeof SOLOIPS_COMPANY_DOMAIN_SPEC>,
    stack: SoloipsStorageStack,
    lease: SoloipsWriterLease,
    accountId: string,
  ) {
    this.#domain = domain;
    this.#stack = stack;
    this.#lease = lease;
    this.#accountId = accountId;
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

  /**
   * 任职作用域的**严格三分支**解析（data-contract §2.3，BE-003 修正后的运行时纪律）。
   *
   * | # | 条件 | 结果 |
   * |---|---|---|
   * | 1 | 有 `scope` | 直接采用（**不做任何推断**；显式字段优先） |
   * | 2 | 无 `scope` 且有 `departmentId` | `{kind:'department', companyId: <由部门记录反解>, departmentId}` |
   * | 3 | 无 `scope` 且**解析不出公司**（含无 `departmentId`、或部门记录缺失） | `SOLOIPS_CORE_RECORD_INVALID` |
   *
   * 〔约束〕**不写回、不猜测**：分支 2 的解析结果只存在于本次返回值里，介质上的
   * 记录保持原样（§2.3「读取时不写回」）。写回只允许发生在**迁移工具**中且须人工
   * 确认——core 读取路径不得代劳。
   *
   * 〔约束〕**禁止时序推断**：「无 `scope` 且首个 `general_assistant` → 公司级」这条
   * 规则已从运行时**删除**（BE-003）——它依赖读取顺序这一不稳定事实，会在并发、
   * 分页、重放、数据根迁移下产出非确定性结果。存量记录里**没有**任何信息能区分
   * 公司级与部门级，因此「能定则定、不能定即报错」。
   *
   * 〔为什么必须在 store 层〕分支 2 要反解 `companyId`，只能经**已打开的 domain**
   * 读 `department` 表（core 不存在绕过 opener 的读路径，SEAM-X1）；纯 schema 层
   * 拿不到表访问。
   */
  #resolveAppointmentScope(record: SoloipsAppointmentRecord): SoloipsAppointmentScope {
    if (record.scope !== undefined) {
      // 分支 1：显式字段优先，推断只服务缺失场景。
      return record.scope;
    }
    const departmentId = record.departmentId;
    if (departmentId === undefined) {
      // 分支 3：无 scope 且无 departmentId —— 不可判定，报错而不猜。
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_RECORD_INVALID",
        `任职 ${record.id} 缺少 scope 且无 departmentId，无法判定作用域（data-contract §2.3 分支 3）；` +
          "core 不按时序/「首个」猜测归属，须经迁移工具人工确认后显式补写",
      );
    }
    const department = this.#domain.table("department").get(departmentId);
    if (department === undefined) {
      // 分支 3（第二种形态）：「无法解析出公司」——部门记录缺失即解析不出归属。
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_RECORD_INVALID",
        `任职 ${record.id} 的 departmentId ${departmentId} 读不到对应部门记录，无法反解 companyId` +
          "（data-contract §2.3 分支 3）；拒绝推断",
      );
    }
    // 分支 2：现有形状即部门级任职（companyId 由部门记录反解）。
    return { kind: "department", companyId: department.companyId, departmentId };
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
          ...(input.parentCompanyId !== undefined
            ? { parentCompanyId: input.parentCompanyId }
            : {}),
        },
      },
      async (publish) => {
        const id = newCompanyId();
        await publish.put("company", id, {
          id,
          // 账户来自部署注入（构造期绑定，非命令入参）：SoloipsCreateCompanyInput
          // 刻意**不含** accountId，业务命令不得传入或覆盖（data-contract §3.1 命令面）。
          accountId: this.#accountId,
          ...(input.parentCompanyId !== undefined
            ? { parentCompanyId: input.parentCompanyId }
            : {}),
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

  /**
   * 创建任职（BE-2：scope/role + 部长链）。
   *
   * 作用域来源（§2.3 严格三分支，与读取面**同一套**判定）：
   *  - 给了 `scope` → 用之；
   *  - 没给 `scope` 但给了 `departmentId` → 部门级（`companyId` 由部门记录反解）；
   *  - 两者都没有 → `SOLOIPS_CORE_RECORD_INVALID`（**不猜**）。
   *
   * 岗位校验（BE-2 验收④）：`role` 与 `scope.kind` 必须匹配（`department_lead`
   * 只能落在部门级作用域上，不能产生公司级 `general_assistant`）。这是**数据层
   * 自洽**校验，不是授权判定（见 `ROLE_SCOPE_KIND` 注释）。
   *
   * 部长链（BE-2 验收②）：`role === 'department_lead'` 且作用域为部门级时，**回填**
   * `department.leaderAppointmentId`（部门记录指向任职，§1.1 裁定）。
   *
   * 唯一性（data-contract §2.4.2）：同一公司同一时刻**至多一条**有效公司级
   * `general_assistant`；重复招募返回可判定拒绝（`SOLOIPS_CORE_PRECONDITION`，
   * 语义为「状态不允许该操作」），且**不产生任何业务写**（连意图都不落——
   * 判定在提交门的串行槽位内、意图落盘之前执行，见 `SoloipsCommitRequest.precondition`）。
   */
  async createAppointment(
    input: SoloipsCreateAppointmentInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateAppointmentResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isEmployeeId(input.employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    const required = input.requiredCapabilities ?? [];
    for (const capability of required) {
      requireNonEmpty(capability, "岗位必需能力名");
    }
    this.#readEmployee(input.employeeId);

    // ── 入参形状校验（JS 调用方不受类型保护） ──────────────────────────────
    if (input.departmentId !== undefined && !isDepartmentId(input.departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    const requestedScope = input.scope === undefined ? undefined : requireScopeShape(input.scope);
    const role = input.role === undefined ? undefined : requireRoleShape(input.role);
    if (input.actorAppointmentId !== undefined && !isAppointmentId(input.actorAppointmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "actorAppointmentId 形状不合法");
    }

    // ── 作用域判定（三分支；与读取面同规则，不引入第二套语义） ─────────────
    // 两个字段并存时**必须一致**：`scope.kind='department'` 与 `departmentId` 不一致
    // 即矛盾输入（静默取舍会让记录里同时存在两个互相矛盾的事实）。
    if (requestedScope !== undefined && requestedScope.kind === "department") {
      if (input.departmentId !== undefined && input.departmentId !== requestedScope.departmentId) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          `departmentId ${input.departmentId} 与 scope.departmentId ${requestedScope.departmentId} 不一致`,
        );
      }
    } else if (requestedScope !== undefined && input.departmentId !== undefined) {
      // 公司级/团队级作用域不该带 departmentId：部门归属由 scope 承载，两者并存即矛盾。
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        `scope.kind='${requestedScope.kind}' 时不得同时提供 departmentId（部门归属由 scope 承载）`,
      );
    }

    let scope: SoloipsAppointmentScope;
    if (requestedScope !== undefined) {
      scope = requestedScope;
    } else if (input.departmentId !== undefined) {
      // 分支 2：有 departmentId 即部门级，companyId 由部门记录反解。
      const department = this.#readDepartment(input.departmentId);
      scope = {
        kind: "department",
        companyId: department.companyId,
        departmentId: input.departmentId,
      };
    } else {
      // 分支 3：两者皆无 —— 不可判定，报错而不猜（无时序推断）。
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_RECORD_INVALID",
        "createAppointment 需要 scope 或 departmentId 之一以判定作用域" +
          "（data-contract §2.3 分支 3：能定则定、不能定即报错；不做任何时序/「首个」推断）",
      );
    }

    // 作用域内引用的实体必须存在，且归属必须自洽（跨公司引用即数据错误）。
    this.#readCompany(scope.companyId);
    if (scope.kind === "department") {
      const department = this.#readDepartment(scope.departmentId);
      if (department.companyId !== scope.companyId) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          `scope.departmentId ${scope.departmentId} 属于公司 ${department.companyId}，` +
            `与 scope.companyId ${scope.companyId} 不一致`,
        );
      }
    }
    if (scope.kind === "team") {
      // team 表属 BE-3：本切片无法核对团队记录存在性，如实拒绝而不是假装校验通过
      // （BE-3 落地后此处改为读 team 表核对归属）。
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_PRECONDITION",
        "team 级任职依赖 team 表（BE-3 未落地），本切片不接受 scope.kind='team'",
      );
    }

    // ── 岗位校验（角色与作用域必须匹配） ──────────────────────────────────
    if (role !== undefined) {
      const expectedKind = ROLE_SCOPE_KIND[role];
      if (scope.kind !== expectedKind) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_VALIDATION",
          `角色 ${role} 是${expectedKind}级角色，与作用域 kind='${scope.kind}' 不匹配`,
        );
      }
    }

    // ── 唯一性判定（§2.4.2）：在提交门的串行槽位内、意图落盘之前 ──────────
    const uniqueness =
      role === "general_assistant"
        ? { kind: "company" as const, companyId: scope.companyId }
        : undefined;

    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "appointment.create",
        employeeId: input.employeeId,
        intent: {
          employeeId: input.employeeId,
          scope: scopeIntentOf(scope),
          ...(role === undefined ? {} : { role }),
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          requiredCapabilities: [...required],
          // SA-02：actor 只作审计线索（谁声称执行了该动作），不作授权依据。
          ...(input.actorAppointmentId === undefined
            ? {}
            : { actorAppointmentId: input.actorAppointmentId }),
        },
        ...(uniqueness === undefined
          ? {}
          : { precondition: () => this.#assertNoActiveGeneralAssistant(uniqueness.companyId) }),
      },
      async (publish) => {
        const id = newAppointmentId();
        const generation = this.#nextGeneration(input.employeeId);
        await publish.put("appointment", id, {
          id,
          employeeId: input.employeeId,
          // departmentId 只在部门级作用域下写入（公司级/团队级不挂部门）。
          ...(scope.kind === "department" ? { departmentId: scope.departmentId } : {}),
          scope,
          ...(role === undefined ? {} : { role }),
          requiredCapabilities: [...required],
          generation,
          status: "active",
        });
        // 部长链回填：部门记录指向该任职（§1.1「通过任职表达更灵活」）。
        //
        // 〔披露〕**本切片不为部长做唯一性拒绝**，与总助理不同：data-contract 只为
        // 团队组长登记了唯一性协议（§2.1.1 P-4/P-5/P-8），**没有**为部门部长登记
        // 对应规则（「一个部门至多一名部长」既无条文也无 BE-2 验收项）。因此第二条
        // `department_lead` 任职会**覆盖** `leaderAppointmentId`（后写者胜），
        // 旧任职本身仍 active。这是**未裁定**的行为，已在测试中钉住可见；
        // 不得据此声称「部长唯一性已实现」——补规则属后续切片（见报告遗留项）。
        if (role === "department_lead" && scope.kind === "department") {
          const departmentId = scope.departmentId;
          await publish.update("department", departmentId, (current) => ({
            ...current,
            leaderAppointmentId: id,
          }));
        }
        return { appointmentId: id, generation };
      },
    );
  }

  /**
   * 唯一性判定：同公司是否已有**有效**的公司级 `general_assistant`（§2.4.2）。
   *
   * 判定口径（逐项说明为什么这样算）：
   *  - 只算 `status === 'active'`：撤销后的任职不占名额（否则「撤职后无法重新招募」
   *    会成为隐藏规则）；
   *  - 只算**公司级**（`scope.kind === 'company'`）：部门级/团队级任职不构成
   *    「公司总助理」；
   *  - **作用域经 §2.3 严格三分支解析后再比较**：存量记录（无 `scope`）按部门级
   *    解析，因此不会被误当成公司级总助理——若直接读 `record.scope` 会漏判/误判。
   *
   * 〔fail-closed 方向〕分支 3 的记录（无 `scope`、解析不出公司）**不能假定它不是
   * 总助理**：它可能是公司级、也可能不是，而「不可判定」不等于「不冲突」。故解析
   * 抛出的 `SOLOIPS_CORE_RECORD_INVALID` 直接冒泡——本次新建被拒（零业务写），
   * 数据不一致因此**可见**，而不是让「同公司至多一条」在数据损坏时静默失效。
   * 这也与 §2.3「不猜」一致：猜「它不是总助理」同样是猜。
   *
   * 判定在提交门的串行槽位内执行（调用方经 `precondition` 传入），因此「读-判-写」
   * 之间没有其他本地提交可插入。
   */
  #assertNoActiveGeneralAssistant(companyId: SoloipsCompanyId): void {
    for (const [, record] of this.#domain.table("appointment").entries()) {
      if (record.status !== "active" || record.role !== "general_assistant") continue;
      const scope = this.#resolveAppointmentScope(record);
      if (scope.kind !== "company" || scope.companyId !== companyId) continue;
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_PRECONDITION",
        `公司 ${companyId} 已有有效的公司级 general_assistant 任职 ${record.id}` +
          "（data-contract §2.4.2：同一公司同一时刻至多一条）；" +
          "重复招募被拒绝，本次不产生任何业务写。如需换人，先撤销既有任职",
      );
    }
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

  /**
   * 读取任职。
   *
   * 〔读面纪律，data-contract §2.3〕返回记录上的 `scope` **恒为解析后的作用域**：
   * 存量记录（无 `scope`、只有 `departmentId`）在此按分支 2 补出
   * `{kind:'department', companyId: <由部门反解>, departmentId}`，使调用方可以
   * 直接读 `scope.companyId` 而不必自己实现三分支（D-1 登记的缺陷正是「直接读
   * `apt.scope.companyId`」在缺 `scope` 时抛错）。
   *
   * 〔约束〕这**不是写回**：介质上的记录逐字不变（§2.3「不写回、不猜测」）；
   * 解析结果只存在于本次返回值里。分支 3（无 `scope` 且解析不出公司）抛
   * `SOLOIPS_CORE_RECORD_INVALID`——「能定则定、不能定即报错」。
   *
   * 〔与其它读面的差异〕本方法返回**浅拷贝**（其余读面直接返回介质对象）：因为要
   * 附加解析出的 `scope`，不能改写介质对象本身。副作用是调用方更不可能经返回值
   * 原地污染介质（方向与「不得原地修改」的约束一致）。
   */
  getAppointment(id: SoloipsAppointmentId): SoloipsAppointmentRecord | undefined {
    this.#assertOpen();
    const record = this.#domain.table("appointment").get(id);
    if (record === undefined) return undefined;
    return { ...record, scope: this.#resolveAppointmentScope(record) };
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
