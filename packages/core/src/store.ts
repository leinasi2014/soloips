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
 *
 * ── BE-3：team 数据层与三步成团协议（P-1…P-9）────────────────────────────
 *
 * `team` 表由本切片首次创建；`scope.kind='team'` 的任职自此可建（此前以
 * `PRECONDITION` 如实拒绝，见 `createAppointment` 内的改点说明）。
 *
 * **三步成团不是原子提交**（P-9）：`team.create`(pending, 无组长) →
 * `appointment.create`(team_lead) → `team.activate`(P-4 校验后转可用)。三步三个
 * `operationId` 各自独立可恢复；**不得**合并成一次提交（P-9 原文）。
 *
 * 〔组长归属：`appointment.create` **不**回填 `team.leadAppointmentId`〕
 * 与部长链（`department.leaderAppointmentId` 由 `createAppointment` 回填）
 * **刻意不同**。理由：
 *  1. P-9 把「哪条任职是组长」的落点定在 `team.activate`（第③步显式指认，
 *     `SoloipsActivateTeamInput.leadAppointmentId`）。若第②步自动回填，则
 *     「团队可用」与「组长已指认」变成同一件事，第③步的 P-4 校验就没有独立
 *     的写入对象——而 P-9.3 要求 `activate` 是**唯一**通道。
 *  2. 回填会让「第二组长」（P-5 拒绝的路径）在团队记录上留下痕迹的顺序变得
 *     依赖实现细节；显式指认则「谁被指认为组长」只有一处可写。
 *  3. 部长链没有对应的「激活」步骤（部门无 pending 态），故两者不同形是
 *     契约差异的真实反映，不是为了不一致而不一致。
 * 因此：**`team.leadAppointmentId` 的写入点只有两处**——`createTeam`（不写，
 * 保持缺省）与 `activateTeam`（P-4 校验通过后写入）。P-8.4 的「换任」路径即
 * 「新建 `team_lead` 任职 + 再次 `activate` 并显式改指」。
 *
 * 〔P-8 悬挂处置〕`reconcileTeams` 是**显式**恢复辅助（只标记、不自动修复，
 * P-8.3）；读面（`getTeam`/`listTeams`）**同时**执行同判据的纯读核验，因此
 * 「未跑 reconcile 也不会把失效团队读作可用」（P-8.2 由读面自身满足）。
 * 〔为什么不在 open 时自动跑〕见 `SoloipsCoreService.reconcileTeams` 的注释。
 *
 * 〔P-7 禁物理删除〕`team` 表**没有** delete 路径：`closeTeam` 只写 `archived`。
 *
 * 〔P-6 组长撤职 → 团队不可用：本切片的联动方案〕**在 `revokeAppointment`
 * 内联动**（同一次提交、同一串行槽位），而不是只靠 `reconcileTeams` 兜底：
 *  - 撤职时**已在写**（同一命令、同一 operationId 的提交槽位），把团队置为
 *    `inactive` 不引入新的失败模式，也不会出现「撤职成功但团队仍显示可用」的
 *    中间窗口；
 *  - P-6 的语义是「**立即**不可用」（§3.2 的 L2 行亦写「撤职后立即失效」），
 *    靠扫描兜底会把失效推迟到下一次显式 reconcile——那时团队已被读作可用过；
 *  - `reconcileTeams` 仍**保留**（覆盖两类联动覆盖不到的情形）：① 撤职发生在
 *    本切片之前/之外的路径（如直接改介质）；② 引用悬挂（P-8 的崩溃残留，
 *    与撤职无关）。两者判据同一（`#evaluateLeadReference` 的 P-4 四项），
 *    故不产生第二套语义。
 *  联动是**只标记**（`active` → `inactive`），**不**自动指定继任者（P-6 明确
 * 禁止自动继任：那会引入未裁定的继任策略）。
 */

import type {
  SoloipsDomain,
  SoloipsDomainGlobal,
  SoloipsStoragePort,
  SoloipsStorageStack,
  SoloipsWriterLease,
} from "soloips-adapter-dsh/contracts";

import type {
  SoloipsActivateTeamInput,
  SoloipsActivateTeamResult,
  SoloipsAdministratorProjection,
  SoloipsAdministratorView,
  SoloipsAppointmentId,
  SoloipsAppointmentRecord,
  SoloipsAppointmentRole,
  SoloipsAppointmentScope,
  SoloipsAppointmentView,
  SoloipsCloseTeamInput,
  SoloipsCloseTeamResult,
  SoloipsCommitOutcome,
  SoloipsCommitPreconditionVerdict,
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
  SoloipsCreateTeamInput,
  SoloipsCreateTeamResult,
  SoloipsDepartmentId,
  SoloipsDepartmentRecord,
  SoloipsDocumentType,
  SoloipsDocumentVersionId,
  SoloipsDocumentVersionRecord,
  SoloipsEmployeeAffiliation,
  SoloipsEmployeeId,
  SoloipsEmployeeRecord,
  SoloipsInitializeMemoryInput,
  SoloipsInitializeMemoryResult,
  SoloipsJsonValue,
  SoloipsLeadReferenceVerdict,
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
  SoloipsTeamFunctionSource,
  SoloipsTeamId,
  SoloipsTeamReconcileResult,
  SoloipsTeamRecord,
  SoloipsTeamView,
  SoloipsUpdateTeamFunctionInput,
  SoloipsUpdateTeamFunctionResult,
  SoloipsVerifyCapabilityInput,
  SoloipsVerifyCapabilityResult,
  SoloipsWorkEntryAdmitted,
  SoloipsWorkEntryInput,
  SoloipsWorkEntryOrigin,
  SoloipsWorkEntryOutcome,
  SoloipsWorkEntryRefused,
} from "./contracts.js";
import { SOLOIPS_COMPANY_DOMAIN_NAME, SOLOIPS_PLACEHOLDER_ACCOUNT_ID } from "./contracts.js";
import { SoloipsCommitGate } from "./commit-gate.js";
import type { SoloipsCompanyPublisher } from "./commit-gate.js";
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
  newTeamId,
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

/** 团队职能来源形状校验（JS 调用方的 functionSource 不受类型保护）。 */
const TEAM_FUNCTION_SOURCES: readonly SoloipsTeamFunctionSource[] = [
  "leader-defined",
  "system-suggested",
];

function requireFunctionSourceShape(value: unknown): SoloipsTeamFunctionSource {
  if (typeof value === "string" && (TEAM_FUNCTION_SOURCES as readonly string[]).includes(value)) {
    // 受控单次断言：includes 已证明成员资格，数组的字面量类型即联合本身。
    return value as SoloipsTeamFunctionSource;
  }
  throw new SoloipsCoreError(
    "SOLOIPS_CORE_VALIDATION",
    `functionSource 必须是 ${TEAM_FUNCTION_SOURCES.join(" | ")} 之一`,
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

  #readTeam(id: string): SoloipsTeamRecord {
    const record = this.#domain.table("team").get(id as SoloipsTeamId);
    if (record === undefined) {
      throw new SoloipsCoreError("SOLOIPS_CORE_PRECONDITION", `团队 ${id} 不存在`);
    }
    return record;
  }

  // ── 团队读辅助（P-4 核验、可用判据、投影） ────────────────────────────────

  /**
   * 组长引用核验（**P-4 四项**）——读面的唯一判据来源。
   *
   * | # | 条件 | 不满足时的 `reason` |
   * |---|---|---|
   * | ① | 任职存在 | `appointment-missing` |
   * | ② | `status === 'active'` | `revoked` |
   * | ③ | 作用域可解析（§2.3 三分支） | `scope-unresolvable` |
   * | ④ | `scope.kind === 'team'` 且 `scope.teamId === team.id` | `not-team-scope` |
   * | ⑤ | `scope.companyId === team.companyId` | `company-mismatch` |
   * | ⑥ | `role === 'team_lead'` | `role-mismatch` |
   *
   * 〔为什么是六个分支而不是四个〕P-4 的四项中，第③项「同团队」与第②项
   * 「同公司」在**判别联合**上必须分两步判定（先确认 `kind==='team'` 才能读
   * `teamId`），且 §2.3 的三分支解析本身可能抛错（`scope-unresolvable`）。
   * 拆成六个可判定原因是为了 P-8.5/P-9.2 的「读面不得静默降级」：调用方需要
   * 知道**为什么**不可用，而不是只得到一个布尔。
   *
   * 〔`scope-unresolvable` 的处置〕§2.3 分支 3（无 `scope` 且解析不出公司）在
   * `#resolveAppointmentScope` 里抛 `SOLOIPS_CORE_RECORD_INVALID`。本核验
   * **捕获**它并归为「引用无效」：核验的语义是「这条引用是否可用」，不可判定
   * 的记录**不是**可用组长——若让它冒泡，则一个损坏的任职会让整个团队读面
   * 抛错，使「团队列表」因与它无关的记录而不可读。**注意**方向：这里**不**猜
   * 「它可能是有效的」，而是归入无效（fail-closed，与 `#assertNoActiveGeneralAssistant`
   * 的 fail-closed 方向一致——那里是「不可判定即拒绝新建」，这里是「不可判定
   * 即不算有效组长」）。
   */
  #evaluateLeadReference(team: SoloipsTeamRecord): SoloipsLeadReferenceVerdict {
    const appointmentId = team.leadAppointmentId;
    if (appointmentId === undefined) {
      return {
        valid: false,
        reason: "absent",
        message: `团队 ${team.id} 无组长引用（pending 期可缺省；转为可用时必须存在，P-4）`,
      };
    }
    const appointment = this.#domain.table("appointment").get(appointmentId);
    if (appointment === undefined) {
      return {
        valid: false,
        reason: "appointment-missing",
        appointmentId,
        message: `团队 ${team.id} 的组长引用 ${appointmentId} 读不到对应任职记录（悬挂引用，P-8）`,
      };
    }
    if (appointment.status !== "active") {
      return {
        valid: false,
        reason: "revoked",
        appointmentId,
        message: `团队 ${team.id} 的组长任职 ${appointmentId} 已撤销（P-6：团队不可用，换任须显式操作）`,
      };
    }
    let scope: SoloipsAppointmentScope;
    try {
      scope = this.#resolveAppointmentScope(appointment);
    } catch (error) {
      // §2.3 分支 3：不可判定 → 不算有效组长（fail-closed，不猜）。
      const detail = error instanceof SoloipsCoreError ? error.message : String(error);
      return {
        valid: false,
        reason: "scope-unresolvable",
        appointmentId,
        message:
          `团队 ${team.id} 的组长任职 ${appointmentId} 作用域不可判定（${detail}）；` +
          "按不可用处置，不做任何猜测",
      };
    }
    if (scope.kind !== "team") {
      return {
        valid: false,
        reason: "not-team-scope",
        appointmentId,
        message: `团队 ${team.id} 的组长任职 ${appointmentId} 作用域是 ${scope.kind} 级，不是该团队（P-4 第③项）`,
      };
    }
    if (scope.teamId !== team.id) {
      return {
        valid: false,
        reason: "not-team-scope",
        appointmentId,
        message: `团队 ${team.id} 的组长任职 ${appointmentId} 指向团队 ${scope.teamId}，不是本团队（P-4 第③项）`,
      };
    }
    if (scope.companyId !== team.companyId) {
      return {
        valid: false,
        reason: "company-mismatch",
        appointmentId,
        message:
          `团队 ${team.id} 的组长任职 ${appointmentId} 属于公司 ${scope.companyId}，` +
          `与本团队公司 ${team.companyId} 不符（P-4 第②项）`,
      };
    }
    if (appointment.role !== "team_lead") {
      return {
        valid: false,
        reason: "role-mismatch",
        appointmentId,
        message:
          `团队 ${team.id} 的组长任职 ${appointmentId} 的角色是 ${appointment.role ?? "未登记"}，` +
          "不是 team_lead（P-4 第④项）",
      };
    }
    return { valid: true, appointmentId, employeeId: appointment.employeeId };
  }

  /**
   * 可用判据（P-3 / P-8.2 / P-9.1 **同一判据**）：`status === 'active'` 且
   * 组长引用满足 P-4。
   *
   * 〔为什么两个条件都要〕`status === 'active'` 是**持久事实**（`activate` 写入、
   * 撤职联动写 `inactive`），P-4 核验是**当前读**——两者可能分叉：组长在
   * `activate` 之后被撤职、而本进程尚未跑 reconcile 时，`status` 仍是 `active`
   * 而引用已失效。此时**必须**读作不可用（P-8.2：读面不得把失效团队当可用返回）。
   * 反向（`status='inactive'` 但引用有效）同样不可用：换任后须显式 `activate`
   * （P-9.3：不得用直接改 status 的方式恢复）。
   */
  #isUsableTeam(team: SoloipsTeamRecord, verdict: SoloipsLeadReferenceVerdict): boolean {
    if (team.status !== "active") return false;
    return verdict.valid;
  }

  /**
   * 团队记录 → 读面投影（带 `usable` 与 `leadReference` 显式状态）。
   *
   * P-8.5/P-9.2「读面不得静默降级」的落点：不可用团队**不**被过滤掉或返回空
   * 成员列表冒充正常团队，而是带着 `usable: false` 与具体原因呈现。
   *
   * 〔单次核验〕`leadReference` 与 `usable` 由**同一次** `#evaluateLeadReference`
   * 结果导出（把结论作为参数传入 `#isUsableTeam`），避免「两次核验结果不一致」
   * 的读面自相矛盾。
   */
  #teamView(team: SoloipsTeamRecord): SoloipsTeamView {
    const leadReference = this.#evaluateLeadReference(team);
    return {
      id: team.id,
      companyId: team.companyId,
      ...(team.departmentId === undefined ? {} : { departmentId: team.departmentId }),
      name: team.name,
      function: team.function,
      functionSource: team.functionSource,
      ...(team.confirmedBy === undefined ? {} : { confirmedBy: team.confirmedBy }),
      ...(team.leadAppointmentId === undefined
        ? {}
        : { leadAppointmentId: team.leadAppointmentId }),
      status: team.status,
      createdAt: team.createdAt,
      usable: this.#isUsableTeam(team, leadReference),
      leadReference,
    };
  }

  /**
   * 职能来源与确认者的**配对**校验（data-contract §2.1）：
   * `system-suggested` 时 `confirmedBy` **必填**——缺它的记录是「未确认草稿」，
   * 不得被读作团队职能。`leader-defined` 时可省略（定义者即组长）。
   *
   * 〔为什么在 store 层而非 schema 层〕与 `appointment.scope` 的分工一致：
   * schema 层管字段形状，跨字段的业务规则在 store（`domain.ts` 的注释已声明
   * 该分工）。`confirmedBy` 指向的任职**存在性**另需读表核对（见调用点）。
   */
  #requireFunctionSourcePairing(
    functionSource: SoloipsTeamFunctionSource,
    confirmedBy: SoloipsAppointmentId | undefined,
  ): void {
    if (functionSource === "system-suggested" && confirmedBy === undefined) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        "functionSource='system-suggested' 时必须提供 confirmedBy：系统建议本身不是职能定义，" +
          "须由一名有效任职确认后才成为团队职能（data-contract §2.1）；" +
          "缺 confirmedBy 的记录是未确认草稿，不得被读作团队职能",
      );
    }
  }

  /**
   * 团队的公司/部门归属校验（§2.1 第①步「公司/部门存在且同账户」）。
   *
   * 「同账户」由根级绑定保证（一个业务存储根只绑定一个账户，§3.1），故此处
   * 只需核对**部门属于该公司**——跨公司引用即矛盾输入（与 `createAppointment`
   * 的部门级校验同一口径）。
   */
  #requireTeamPlacement(companyId: SoloipsCompanyId, departmentId?: SoloipsDepartmentId): void {
    this.#readCompany(companyId);
    if (departmentId === undefined) return;
    const department = this.#readDepartment(departmentId);
    if (department.companyId !== companyId) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        `departmentId ${departmentId} 属于公司 ${department.companyId}，` +
          `与 companyId ${companyId} 不一致（跨公司引用）`,
      );
    }
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

  /**
   * 作用域解析的**失败可判定**包装（BE-4a）：把 §2.3 分支 3 的
   * `SOLOIPS_CORE_RECORD_INVALID` 转成判别结果，供「扫描中遇到不可判定记录」的
   * 读面决定如何处置。
   *
   * 〔为什么需要它〕同一形状（无 `scope` 且解析不出公司）在**不同读面**上的正确
   * 处置**方向相反**，而两者都不能靠猜测：
   *  - 「这条记录**是不是**某集合的成员」类查询（`listEmployees`/
   *    `listAppointments`/`listAdministrators`）：不可判定即**报错**——跳过会让
   *    结果静默漏掉该记录，而它**可能**正是查询目标（fail-closed，与
   *    `#assertNoActiveGeneralAssistant` 同向）；
   *  - 「这条记录**是不是**某个已给出引用」类核验（`#evaluateLeadReference`）：
   *    不可判定即**不算命中**——核验的对象是引用有效性，一条不可判定的记录不是
   *    有效引用（该处用 try/catch 直接归类为 `scope-unresolvable`，不走本包装）。
   *
   * 本包装只把**已知的**分支 3 失败转成结果；其它异常（如介质读取失败）原样冒泡
   * ——那类失败不是「不可判定」，把它折进判别结果会把基础设施故障伪装成数据结论。
   */
  #tryResolveAppointmentScope(
    record: SoloipsAppointmentRecord,
  ): { readonly ok: true; readonly scope: SoloipsAppointmentScope } | { readonly ok: false } {
    try {
      return { ok: true, scope: this.#resolveAppointmentScope(record) };
    } catch (error) {
      if (error instanceof SoloipsCoreError && error.code === "SOLOIPS_CORE_RECORD_INVALID") {
        return { ok: false };
      }
      throw error;
    }
  }

  /**
   * 扫描任职表并**解析后**过滤（BE-4a 读投影的共同内核）。
   *
   * 〔顺序契约〕逐条解析、逐条判定；遇到分支 3 的记录**立即抛错**（不跳过、不继续
   * 收集）——「能定则定、不能定即报错」的落点，见 `#tryResolveAppointmentScope`。
   * 错误消息带上**本次查询的过滤条件**：调用方需要知道「哪次查询因为哪条记录而
   * 失败」，否则只能拿到一条与本次调用无关的孤立诊断。
   *
   * 〔D1：部门过滤的公司核对〕部门过滤**反解部门记录**（`filterDepartment`）并
   * 要求 `scope.companyId === filterDepartment.companyId`；不一致即
   * `SOLOIPS_CORE_RECORD_INVALID`。为什么必须核对：`#resolveAppointmentScope`
   * 的分支 1「有 `scope` 直接采用」**不**核对 `scope.departmentId` 与
   * `scope.companyId` 是否自洽（写面 `createAppointment` 才拒该形状），故迁移
   * 残留/外部直写可产生「声明的公司 ≠ 部门实际所属公司」的记录。若只比
   * `scope.departmentId`，这类记录会进入结果集，其 `scope.companyId` 是**记录
   * 自己写的值**——同一员工两条声明不同公司的记录会让聚合结果取决于介质遍历
   * 顺序，而 §2.3 明文**禁止任何时序/「首个」推断**。核对后，部门过滤下的全部
   * 命中共享**同一个由部门记录反解出的**公司，取值不再是「选择」。
   *
   * 〔只读〕本方法只经 domain 表读取，不产生 kind、不写状态、不持锁。
   */
  #scanAppointments(
    filter: {
      readonly companyId?: SoloipsCompanyId;
      readonly departmentId?: SoloipsDepartmentId;
      readonly employeeId?: SoloipsEmployeeId;
      readonly includeRevoked?: boolean;
    },
    query: string,
  ): readonly {
    readonly record: SoloipsAppointmentRecord;
    readonly scope: SoloipsAppointmentScope;
  }[] {
    const includeRevoked = filter.includeRevoked === true;
    // 部门过滤的公司基准：反解一次（部门记录缺失时保持 `undefined`，只在真有命中
    // 该部门的记录时才报错——「部门不存在」的空结果语义因此不受影响）。
    const filterDepartment =
      filter.departmentId === undefined
        ? undefined
        : this.#domain.table("department").get(filter.departmentId);
    const found: {
      readonly record: SoloipsAppointmentRecord;
      readonly scope: SoloipsAppointmentScope;
    }[] = [];
    for (const [, record] of this.#domain.table("appointment").entries()) {
      if (!includeRevoked && record.status !== "active") continue;
      // 直接字段先过滤（员工 id 无需解析作用域）——既省解析，也让「按员工查」
      // 在存在损坏记录时仍然可用（过滤条件与该记录无关）。
      if (filter.employeeId !== undefined && record.employeeId !== filter.employeeId) continue;
      const resolved = this.#tryResolveAppointmentScope(record);
      if (!resolved.ok) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_RECORD_INVALID",
          `任职 ${record.id} 的作用域不可判定（data-contract §2.3 分支 3），` +
            `无法参与「${query}」的归属过滤；` +
            "本读面**不跳过**不可判定记录（跳过会让结果静默漏掉该员工）——" +
            "须先经迁移工具人工确认后显式补写 scope/departmentId",
        );
      }
      const scope = resolved.scope;
      if (filter.companyId !== undefined && scope.companyId !== filter.companyId) continue;
      if (filter.departmentId !== undefined) {
        // 部门过滤只认部门级作用域：公司级/团队级任职**不挂部门**
        // （`team.departmentId` 是团队归属，不是任职归属），把它们算进来会让
        // 「部门员工名单」包含不属该部门的人。
        if (scope.kind !== "department" || scope.departmentId !== filter.departmentId) continue;
        // D1：声明的公司必须与部门记录反解出的公司一致（见方法头注释）。
        // 不一致 = 记录自相矛盾（写面会拒），fail-closed 报错而不是按任一侧取值。
        if (filterDepartment === undefined || scope.companyId !== filterDepartment.companyId) {
          throw new SoloipsCoreError(
            "SOLOIPS_CORE_RECORD_INVALID",
            `任职 ${record.id} 声明 scope.companyId=${scope.companyId}，` +
              `与部门 ${filter.departmentId} 实际所属公司 ` +
              `${filterDepartment === undefined ? "<部门记录缺失>" : filterDepartment.companyId} ` +
              `不一致，无法参与「${query}」的部门过滤；` +
              "部门过滤要求作用域公司由部门记录反解（读面不得采信记录自报的公司，" +
              "那会让同一查询的结果取决于介质遍历顺序——§2.3 禁止时序/「首个」推断）",
          );
        }
      }
      found.push({ record, scope });
    }
    return found;
  }

  /**
   * 员工读面的去重聚合（BE-4a）：把 `#scanAppointments` 的结果收成**员工集合**。
   *
   * 〔去重键 = `employeeId`〕同一员工多条任职命中只出现一次；命中的任职 id 全部
   * 收入 `appointmentIds`（保持扫描顺序、天然无重复——一条任职只被扫到一次）。
   *
   * 〔已删员工的悬挂任职〕任职指向的员工记录缺失（介质被外部改动/迁移残留）时
   * **抛** `SOLOIPS_CORE_RECORD_INVALID`：跳过它会让「该员工属于本公司」这一事实
   * 静默消失（与分支 3 同向的 fail-closed 处置）。
   */
  #affiliationsOf(
    hits: readonly {
      readonly record: SoloipsAppointmentRecord;
      readonly scope: SoloipsAppointmentScope;
    }[],
  ): readonly SoloipsEmployeeAffiliation[] {
    const byEmployee = new Map<
      SoloipsEmployeeId,
      { readonly record: SoloipsAppointmentRecord; readonly scope: SoloipsAppointmentScope }[]
    >();
    for (const hit of hits) {
      const existing = byEmployee.get(hit.record.employeeId);
      if (existing === undefined) {
        byEmployee.set(hit.record.employeeId, [hit]);
      } else {
        existing.push(hit);
      }
    }
    const found: SoloipsEmployeeAffiliation[] = [];
    for (const [employeeId, employeeHits] of byEmployee) {
      const employee = this.#domain.table("employee").get(employeeId);
      if (employee === undefined) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_RECORD_INVALID",
          `任职 ${employeeHits.map((hit) => hit.record.id).join("、")} 指向的员工 ${employeeId} 不存在` +
            "（悬挂引用）；员工列表**不跳过**这类记录（跳过会让该员工静默消失），" +
            "须先核对介质上被删除/迁移的员工记录",
        );
      }
      // 同一员工的全部命中共享同一 `companyId`——这条不变量**由过滤条件保证**，
      // 不是对数据的假设：按公司过滤时全部等于该值；按部门过滤时 `#scanAppointments`
      // 已核对每条命中的 `scope.companyId` 等于**部门记录反解出**的公司（D1）。
      // 故取首条不是「选择」而是取值——不引入时序/首任推断（§2.3 禁止的正是那类
      // 推断）。若该保证被移除（例如去掉 D1 核对），这里会退化为顺序相关的结果。
      // 需要逐条归属的调用方用 `listAppointments`（一条任职一项）。
      const first = employeeHits[0];
      if (first === undefined) continue; // 不可能：Map 的值由上面 push 建出，至少一项。
      found.push({
        employeeId,
        employee,
        companyId: first.scope.companyId,
        appointmentIds: employeeHits.map((hit) => hit.record.id),
      });
    }
    return found;
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
      // 〔BE-3 改点〕此前（BE-2）此处以 `SOLOIPS_CORE_PRECONDITION` 如实拒绝
      // 「team 表属 BE-3 未落地」。`team` 表已由本切片创建，故改为**真校验**：
      // `teamId` 存在且 `companyId` 一致，否则 `PRECONDITION`。
      //
      // 〔两种失败必须区分〕「团队不存在」与「跨公司引用」是不同的事实，调用方
      // 的可行动作也不同（前者：先建团队/查 ID 拼写；后者：换 companyId 或换
      // 团队）。折成一条消息会让「团队存在但属于别的公司」看起来像「团队没建
      // 成功」，从而诱发重复建团队。故两条消息各自明确。
      const team = this.#domain.table("team").get(scope.teamId);
      if (team === undefined) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_PRECONDITION",
          `scope.teamId ${scope.teamId} 不存在：团队级任职必须指向已存在的团队记录` +
            "（P-9 第①步 team.create 先建团队，第②步才建组长任职）；" +
            "请先建团队或核对 teamId",
        );
      }
      if (team.companyId !== scope.companyId) {
        throw new SoloipsCoreError(
          "SOLOIPS_CORE_PRECONDITION",
          `scope.teamId ${scope.teamId} 属于公司 ${team.companyId}，` +
            `与 scope.companyId ${scope.companyId} 不一致（跨公司引用）；` +
            "团队级任职不得跨公司指向别的公司的团队",
        );
      }
      // 〔P-5 第二组长拒绝〕同一 Team 已有有效组长时，再建 `team_lead` 任职须
      // 返回可判定拒绝（不产生第二条）。判定放在提交门的串行槽位内、意图落盘
      // 之前（与总助理唯一性同一机制，见 `#assertNoSecondTeamLead`）。
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

    // ── 唯一性判定（§2.4.2 总助理 / P-5 团队组长）：在提交门的串行槽位内、
    //    意图落盘之前 ────────────────────────────────────────────────────────
    //
    // 两条唯一性规则共用同一 `precondition` 钩子（提交门只接受一个）：
    //  - `general_assistant`：同一公司至多一条有效公司级总助理（§2.4.2）；
    //  - `team_lead`：同一团队至多一名有效组长（P-5，**BE-3 新增**）。
    // 两者互斥（角色不同即作用域 kind 不同，见 `ROLE_SCOPE_KIND`），故不可能
    // 同时命中；写成两条独立分支而不是一张表，是为了让各自的拒绝消息指向
    // 各自的契约条文。
    //
    // ── 〔BE-4c：契约扩展后的**兼容策略**（钉住 BE-2/BE-3 既有行为）〕──────────
    //
    // 门的 `precondition` 在 BE-4c 后**同时**接受「返回 `void` 并抛错」与
    // 「返回 `{ ok: false, refusal }`」两种拒绝形态（见 `SoloipsCommitRequest`）。
    // 本命令**继续使用抛错形态**，一字未改，理由：
    //  1. 唯一性拒绝**不是**本命令公开返回面的一部分——`createAppointment` 的返回
    //     类型是 `SoloipsCommitOutcome<SoloipsCreateAppointmentResult>`，拒绝以
    //     `SOLOIPS_CORE_PRECONDITION` 异常呈现是**已验收**的契约（scope-role.spec.ts
    //     的顺序与并发两条用例都按 `rejects.toMatchObject({code})` 断言）；
    //  2. 改成拒绝载荷会**改变本命令的公开返回类型**（多出 `| R` 分支），那是需要
    //     单独裁定的行为/契约变更，不属于 BE-4c 的「门扩展」范围（本片只做加法：
    //     让拒绝载荷**可表达**，不迁移既有判定）；
    //  3. 两种形态的**失败语义完全相同**——都在意图落盘之前、都在串行槽位内，
    //     都是零业务写、零新增未决意图。区别只在「拒绝以值还是以异常抵达调用方」，
    //     而这一点由各命令的既有公开契约决定，不由门决定。
    //
    // 〔为什么两种形态都不靠哨兵异常**翻译**〕「抛一个专用异常、由服务面 catch 后
    // 转成返回值」的方案已被裁定否决——`contracts.ts` 的
    // `SoloipsCommitPreconditionVerdict` 注释列了三条理由（失败语义与正常结果不
    // 混用、类型层不可穷举、与 BE-5 配额拒绝同构），那是权威说明处。
    //
    // 〔预留：第三分支归属（**本片不实现**）〕data-contract §2.4.4 的 **DL-1**
    // （同一部门至多一条有效 `department_lead`）与 **DL-2**（换任必须显式：先
    // `revokeAppointment` 再 `createAppointment`）已裁定归属「BE-4c 或其后首个 core
    // 切片」，落点正是**本三元表达式的第三个分支**（`role === 'department_lead'`
    // 且 `scope.kind === 'department'` → `#assertNoActiveDepartmentLead(scope.departmentId)`）。
    // 本片刻意**不**实现：它会把既有「后写者胜」的可见行为改为拒绝，属需要单独
    // 验收的行为变更；且 §2.4.4 明确「本裁定不重开 BE-2」。
    const uniqueness =
      role === "general_assistant" && scope.kind === "company"
        ? () => this.#assertNoActiveGeneralAssistant(scope.companyId)
        : role === "team_lead" && scope.kind === "team"
          ? () => this.#assertNoSecondTeamLead(scope.teamId)
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
        ...(uniqueness === undefined ? {} : { precondition: uniqueness }),
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

  /**
   * P-5 第二组长拒绝：同一 Team 已有**有效**组长时，再建 `team_lead` 任职
   * 返回可判定拒绝，**不得产生第二条**。
   *
   * ── 〔判定来源：扫**任职表**，不是读 `team.leadAppointmentId`〕──────────────
   *
   * 这是本方法的关键裁定，被真实介质探针抓到过（首版读 team 记录，漏判）：
   *
   * `team.leadAppointmentId` **只在 `team.activate` 写入**（见文件头「组长归属」
   * 段）。因此在 P-9 的第②步之后、第③步之前（团队仍是 `pending`），**已有**一条
   * 有效 `team_lead` 任职，而 team 记录上**没有**任何引用。若按 team 记录判定，
   * 这个窗口里的第二条 `team_lead` 会被放行——直接违背 P-5 的「不得产生第二条」
   * 与 P-9 第②步的「对齐 P-5（第二组长拒绝）」。
   *
   * 故判定**扫任职表**：存在 `status='active'` 且**作用域解析后**为
   * `{kind:'team', teamId: <本团队>}` 且 `role='team_lead'` 的任职即视为已有组长。
   * 这与 P-4 的语义一致（P-4 的四项正是「一条任职是不是某团队的组长」的判据），
   * 且不依赖 team 记录上的引用是否已写。
   *
   * 〔为什么这仍然允许「换任」〕撤职后旧任职 `status='revoked'`，扫描不再命中
   * ——正是 P-8.4「换任：建立新的 `team_lead` 任职并显式改指」所需的行为。
   * 若按 team 记录判定，撤职后引用仍在记录上，换任会被错误拒绝（见 `#evaluateLeadReference`
   * 的判据差异）。
   *
   * 〔作用域解析失败的记录〕§2.3 分支 3（无 `scope` 且解析不出公司）的任职
   * **无法归属到任何团队**，故不参与本判定（跳过）。这与总助理唯一性的
   * fail-closed 处理**方向不同**，理由：那里「不可判定」的记录**可能是**该公司的
   * 总助理（公司由 `departmentId` 之外的上下文给出），而这里判定的是「属于**本**
   * 团队」，一条解析不出归属的记录不可能被证明属于本团队——把它算作「本团队的
   * 组长」是**臆断**，而它若真属于本团队，其 `scope` 缺失本身已使 P-4 第③项
   * 不成立（它不是**有效**组长）。故跳过是唯一有依据的选择。
   *
   * 〔为什么在提交门的串行槽位内〕与总助理唯一性同一理由：判定必须与写入处于
   * 同一串行槽位，否则两个并发提交可同时通过「无有效组长」的检查。跨进程由
   * writer lease 排除。抛错即整体拒绝（零业务写、零未决意图）。
   */
  #assertNoSecondTeamLead(teamId: SoloipsTeamId): void {
    for (const [, record] of this.#domain.table("appointment").entries()) {
      if (record.status !== "active" || record.role !== "team_lead") continue;
      let scope: SoloipsAppointmentScope;
      try {
        scope = this.#resolveAppointmentScope(record);
      } catch {
        // 分支 3：无法归属到任何团队（见上「作用域解析失败的记录」）。
        continue;
      }
      if (scope.kind !== "team" || scope.teamId !== teamId) continue;
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_PRECONDITION",
        `团队 ${teamId} 已有有效的组长任职 ${record.id}` +
          "（data-contract §2.1.1 P-5：同一 Team 已有有效组长时不得再建 team_lead 任职）；" +
          "重复任命被拒绝，本次不产生任何业务写。如需换人，先撤销既有组长任职（P-6），再建新任职",
      );
    }
  }

  /**
   * 撤职 → 团队不可用（P-6）的**联动**：把以该任职为组长的 `active` 团队转为
   * `inactive`。
   *
   * 〔只标记、不继任〕P-6 明确禁止自动继任（「不是自动提升某成员继任」）：
   * 自动继任需要一套「谁继任」的规则（资历？能力匹配？部长指定？），那等于在
   * 契约里埋一个未裁定的策略。故本方法**只**写 `inactive`。
   *
   * 〔只影响 `active` 团队〕`pending` 团队不转（它本就不是可用态，且其
   * `leadAppointmentId` 可能尚未指认——见 P-9.4 的成因分工）；`archived` 是终态
   * （P-8.6 归档不参与扫描）。`inactive` 保持 `inactive`（幂等）。
   *
   * 〔为什么撤职要联动而不是只靠 reconcile〕见文件头的「P-6 联动方案」段。
   */
  #deactivateTeamsLedBy(
    appointmentId: SoloipsAppointmentId,
    publish: SoloipsCompanyPublisher,
  ): Promise<void> {
    const affected: SoloipsTeamId[] = [];
    for (const [id, team] of this.#domain.table("team").entries()) {
      if (team.status !== "active") continue;
      if (team.leadAppointmentId !== appointmentId) continue;
      affected.push(id);
    }
    return (async () => {
      for (const teamId of affected) {
        await publish.update("team", teamId, (current) => ({
          ...current,
          status: "inactive" as const,
        }));
      }
    })();
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
        // P-6 联动：以该任职为组长的 active 团队转为 inactive（只标记、不继任）。
        //
        // 〔顺序〕先撤职、再置团队不可用：若两步之间崩溃，留下的是「任职已撤销、
        // 团队仍 active」——此时**读面**的 P-4 核验会立即把它判为不可用
        // （`#isUsableTeam` 同时看 status 与引用有效性），故不会出现「失效团队被
        // 读作可用」的窗口。反向顺序（先置团队、后撤职）则会留下「团队 inactive、
        // 任职仍 active」——那会让换任前的团队凭空不可用，且与 P-6 的因果
        // （撤职 → 不可用）相反。
        await this.#deactivateTeamsLedBy(input.appointmentId, publish);
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

  /**
   * 工作准入前门（SOLO-ACC-04）：三条路径（经理派单/员工自领/自动调度）共用同一判定。
   *
   * ── 〔BE-4c：判定与提交落在**同一串行槽位**〕────────────────────────────────
   *
   * 本命令的**全部**判定——重放探测、未决阻塞、入职完备性——都在提交门的
   * `precondition` 内执行，即持有本 store 串行槽位时。这是 R-5.1…R-5.5 的要求
   * （`docs/prds/organization-full-backend-design-v0.1.md` §6「R-5 处置要求」，
   * P2-003 升级为硬要求）：
   *
   *  - **R-5.1 probe 在队内**：重放探测由 `#commitLocked` 自己完成（它就是槽位内的
   *    第一次读），不再有门外的 `probe()` 调用；
   *  - **R-5.2 外部 probe 禁止**：本命令**不**做任何提交前预检。`checkOnboarding`
   *    仍是可用的**展示用**查询（纯读、不参与提交决策），但其结果**不得**作为
   *    提交依据传入——本命令的签名里没有任何承载它的字段；
   *  - **R-5.3 判定输入在队内重取**：`evaluateOnboarding` 在 `precondition` 内调用，
   *    且 `#readModel()` 返回的是**每次调用现读**的取值器（闭包内直接读 domain 表），
   *    因此判定看到的是「本次写入将要基于的状态」；
   *  - **R-5.4 未决检查同在队内**：`listPendingOperations` 的阻塞判定同样在
   *    `precondition` 内；
   *  - **R-5.5 失败方向不变**：任一判定不通过即返回可判定拒绝，零业务写、零新增
   *    未决意图（`precondition` 在意图落盘之前）。**未放宽任何既有拒绝条件**。
   *
   * 〔为什么判定不能留在门外（修复前的形态）〕门外判定把「读-判-写」拆成两段：
   * 两个并发准入可同时通过「入职已完备」的检查，各自建出一条准入事实；未决阻塞
   * 检查也存在同样的窗口。M0.1 的单 operator 是**运行假设**，不是结构保证——契约
   * 不得依赖使用方式（R-5 的「为什么升级为硬要求」段）。
   *
   * 〔拒绝为什么是**返回值**而不是异常〕本命令的拒绝是公开返回面的一部分
   * （专属判别值 + 逐项缺项），故经 `SoloipsCommitPreconditionVerdict` 的
   * `{ ok: false, refusal }` 返回——**哨兵异常方案已被裁定否决**，理由逐条见
   * `contracts.ts` 的 `SoloipsCommitPreconditionVerdict` 注释（权威说明处）。
   *
   * 〔重放语义〕已提交的同 operationId 由门的重放分支直接返回原结果——**先于**
   * 本命令的任何业务判定，故「后来状态变化」（如任职被撤销、文档被改写）不会把
   * 一次已发生的准入重判为拒绝。这正是幂等性的定义：结果由首次执行决定。
   *
   * ── 〔BE-4c 的**行为变化**：三处，全部方向 fail-closed，逐条登记〕──────────
   *
   * 删除门外 probe 后，「同 operationId 命中既有记录」的分支改由门的重放检测承担。
   * 两处的判据**不完全等价**，故有三处可观察的行为变化（均已由 `work-entry.spec.ts`
   * 的用例钉住，且都只改变**拒绝的诊断码**，不放行任何此前被拒的输入）：
   *
   *  1. **同 ID + 别的 kind（未决）**：旧 → `unknown`（门外 probe 对 pending 一律
   *     返回 unknown，不比对 kind）；新 → `SOLOIPS_CORE_CONFLICT`（门的重放检测
   *     先比对 kind 字符串）。更严格：ID 复用被立即点破，而不是让调用方以为
   *     「重试同 ID 可能有结果」。
   *  2. **同 ID + committed 但缺 `result`**：旧 → `SOLOIPS_CORE_CONFLICT`（门外
   *     probe 分支里手工判 `result === undefined`）；新 → `SOLOIPS_CORE_RECORD_INVALID`
   *     （`#committedResult` 的既有判据）。新码更精确：记录标 committed 却缺载荷
   *     是**介质不自洽**，不是 ID 复用。
   *  3. **同 ID + 未知 kind（含 committed）**：旧 → `unknown`（probe 对未知 kind
   *     一律 unknown）；新 → `SOLOIPS_CORE_CONFLICT`（kind 比对先于「能否重放」的
   *     判断）。新行为与既有用例一致（`team-data.spec.ts`：未知 kind 的同 ID 换
   *     kind 复用被拒，「未知不等于可复用」）。
   *
   * 〔为什么这些变化可接受〕三者都是**拒绝**（不写任何业务状态），变化只在错误码
   * 或返回判别值；且新行为都指向更可行动的诊断。**没有**任何此前成功的输入在新实现
   * 下失败——`work-entry.spec.ts` 的既有 5 条用例逐条通过（断言未删改）。
   */
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
    const employeeId = input.employeeId;
    const taskId = input.taskId;
    const origin = input.origin;

    // 判定结论在槽位内产出、由 mutate 消费：precondition 与 mutate 之间**没有**
    // 其他本地提交可插入（同一串行槽位），故这个交接不会与别的事实错位。
    let admitted: SoloipsWorkEntryAdmitted | undefined;

    const outcome = await this.#gate.commit<SoloipsWorkEntryAdmitted, SoloipsWorkEntryRefused>(
      {
        operationId,
        kind: "work-entry.request",
        employeeId,
        intent: { employeeId, taskId, origin },
        precondition: (): SoloipsCommitPreconditionVerdict<SoloipsWorkEntryRefused> => {
          // ① 未决阻塞（ORG-05「未知仍阻止该员工其他新 operationId」；R-5.4）。
          //
          // 〔本次 vs 他人：本判据只阻塞**他人**的未决操作〕
          //  - 同 operationId 的未决记录**走不到这里**：门的重放检测在 `precondition`
          //    之前读同一张表，命中 pending 即按 `unknown` 返回（「结果未知，不得换
          //    ID 重做」——那是结果语义，不是「该员工还有未结清的事」）；
          //  - 本次请求的意图此刻**尚未落盘**：`precondition` 在意图写入之前执行，
          //    故扫描本来就扫不到自己。
          //
          // 〔`record.id !== operationId` 是**冗余守卫**，但**不是**可删的装饰〕
          // 上述两条已足以排除「本次意图被自己判成阻塞」，故本守卫在当前顺序下
          // **不可达**——变异自检的实测结论：单独删掉它（M5）全绿，即它当前不载荷。
          // 保留它有三个理由，且第三条是实测的：
          //  1. 让「阻塞集 = 他人的未决」这条语义在源码里逐字可读（判据即文档）；
          //  2. 本仓已有同类先例（`#scanAppointments` 的「不可能：Map 的值由上面
          //     push 建出」注释、`activateTeam` 的显式判空）——用显式守卫替代
          //     「靠顺序保证」的隐式前提，是本仓既有的防御风格；
          //  3. **它在顺序被改动时变成载荷性的**：把意图写入提到判定之前（M4 变异）
          //     后，带守卫时成功类用例仍全绿；**再去掉守卫**（M4+M5 复合变异）则
          //     10 条用例失败——因为本次刚落的 pending 意图把自己判成了阻塞。
          //     即：本守卫是「顺序契约被破坏」时的**第二道闸**，其代价为一次字符串
          //     比较，收益是那种改动不会静默地把所有准入变成拒绝。
          if (
            this.#gate
              .listPendingOperations()
              .some((record) => record.id !== operationId && record.employeeId === employeeId)
          ) {
            return {
              ok: false,
              refusal: { status: "refused", reason: "employee-operation-unknown" },
            };
          }
          // ② 入职完备性判定（R-5.3）：现读当前权威事实，不接受任何调用前算好的结论。
          const status: SoloipsOnboardingStatus = evaluateOnboarding(employeeId, this.#readModel());
          if (!status.ready) {
            // 拒绝不写任何状态：缺项可修正后重试（重试重新判定，重试有界=每次调用
            // 单次判定、无内部循环重试；SOLO-ACC-04「任务保持 pending」——core 不
            // 产生准入事实）。
            return {
              ok: false,
              refusal: { status: "refused", reason: "onboarding-not-ready", gaps: status.gaps },
            };
          }
          admitted = {
            status: "admitted",
            employeeId,
            appointmentId: status.appointmentId,
            generation: status.generation,
            taskId,
            origin,
          };
          return { ok: true };
        },
      },
      async () => {
        // 〔为什么显式判空而不是断言〕`admitted` 的类型仍含 `undefined`（编译器不跨
        // 回调传递收窄，与 `activateTeam` 同款）。断言（`as`）会让「precondition 忘
        // 了产出结论」变成静默的类型欺骗；显式判空让那种情形在这里以明确错误失败。
        if (admitted === undefined) {
          throw new SoloipsCoreError(
            "SOLOIPS_CORE_RECORD_INVALID",
            "work-entry 提交路径缺准入结论：precondition 应已产出（内部一致性错误）",
          );
        }
        return admitted;
      },
    );
    if (outcome.status === "unknown") {
      return { status: "unknown" };
    }
    if (outcome.status === "refused") {
      return outcome;
    }
    return { status: "admitted", replayed: outcome.status === "replayed", result: outcome.result };
  }

  // ── 团队命令（BE-3；三步成团协议 P-9） ────────────────────────────────────

  /**
   * P-9 第①步：建 `pending` 团队，**无组长**。
   *
   * 〔为什么不在这里建组长任职〕P-9 把「建团队 + 建组长任职」冻结为**三步、
   * 三个 kind、三个 `operationId`**：提交门不提供跨表事务，合并成一次提交会让
   * 「已建团队、未建组长」的中间态无法表达，反而使恢复无据。故本命令只写
   * team 记录，`status='pending'`、`leadAppointmentId` 缺省。
   *
   * 〔校验（P-9 第①步的校验列）〕公司存在；部门（若给）存在且同公司；`function`
   * 非空白；`functionSource`/`confirmedBy` 配对成立。
   */
  async createTeam(
    input: SoloipsCreateTeamInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCreateTeamResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.name, "团队名");
    requireNonEmpty(input.function, "团队职能");
    if (!isCompanyId(input.companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    if (input.departmentId !== undefined && !isDepartmentId(input.departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    if (input.confirmedBy !== undefined && !isAppointmentId(input.confirmedBy)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "confirmedBy 形状不合法");
    }
    const functionSource =
      input.functionSource === undefined
        ? ("leader-defined" as const)
        : requireFunctionSourceShape(input.functionSource);
    this.#requireFunctionSourcePairing(functionSource, input.confirmedBy);
    this.#requireTeamPlacement(input.companyId, input.departmentId);
    // `confirmedBy` 指向的任职必须存在（「由一名有效任职确认」——存在性可核；
    // 是否「有效」属 P-4 式判定的范畴，本命令只核对引用可解析）。
    if (input.confirmedBy !== undefined) {
      this.#readAppointment(input.confirmedBy);
    }

    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "team.create",
        intent: {
          companyId: input.companyId,
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          name: input.name,
          function: input.function,
          functionSource,
          ...(input.confirmedBy === undefined ? {} : { confirmedBy: input.confirmedBy }),
        },
      },
      async (publish) => {
        const id = newTeamId();
        await publish.put("team", id, {
          id,
          companyId: input.companyId,
          ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
          name: input.name,
          function: input.function,
          functionSource,
          ...(input.confirmedBy === undefined ? {} : { confirmedBy: input.confirmedBy }),
          // **不写 `leadAppointmentId`**：pending 的定义特征是无组长（P-9 第①步）。
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        });
        return { teamId: id, status: "pending" as const };
      },
    );
  }

  /**
   * 改团队职能定义。**不改变 `status`**（P-9.3：不得用 `team.update-function`
   * 等方式越过 `team.activate` 完成成团）。
   *
   * 〔归档团队可否改职能〕**拒绝**：归档是终态（P-7「只读保留供追溯」）。改
   * 归档团队的职能会让「历史事实」被改写，与归档的语义（不可变的历史）矛盾。
   */
  async updateTeamFunction(
    input: SoloipsUpdateTeamFunctionInput,
  ): Promise<SoloipsCommitOutcome<SoloipsUpdateTeamFunctionResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    requireNonEmpty(input.function, "团队职能");
    if (!isTeamId(input.teamId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "teamId 形状不合法");
    }
    const current = this.#readTeam(input.teamId);
    // 〔归档团队可否改职能〕**拒绝**：归档是终态（P-7「只读保留供追溯」）。改
    // 归档团队的职能会让「历史事实」被改写，与归档的语义（不可变的历史）矛盾。
    //
    // 〔为什么这个判定在 precondition 里而不是这里〕它是**状态相关**判定：
    // 判定依据（`status`）会被成功的执行本身改变。放在提交门之前会让
    // 「同 operationId 重放」永远走不到门的重放分支（第一次执行已把状态改了，
    // 第二次调用在这里就抛错）——即幂等重放不可达。`precondition` 在门的
    // **重放检测之后**、意图落盘**之前**执行，因此既保住重放语义，又保住
    // 「拒绝时零业务写、零未决意图」。
    //
    // 输入形状校验（下面那些 `require*`）留在门**之前**：它们只依赖入参、
    // 不依赖可变状态，首次通过则重放必然同样通过，故不阻塞重放。
    if (input.confirmedBy !== undefined && !isAppointmentId(input.confirmedBy)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "confirmedBy 形状不合法");
    }
    // 缺省保留记录上的既有来源（不做静默降级为 leader-defined——那会把
    // 「系统建议已确认」悄悄改写成「部长定义」，抹掉审计事实）。
    const functionSource =
      input.functionSource === undefined
        ? current.functionSource
        : requireFunctionSourceShape(input.functionSource);
    // 配对校验用**生效后**的组合：只给 confirmedBy 而不给 functionSource 时，
    // 沿用既有来源——若既有来源是 system-suggested 且未给 confirmedBy，则沿用
    // 记录上的 confirmedBy（已确认过的不因改职能文本而失效）。
    const confirmedBy = input.confirmedBy ?? current.confirmedBy;
    this.#requireFunctionSourcePairing(functionSource, confirmedBy);
    if (input.confirmedBy !== undefined) {
      this.#readAppointment(input.confirmedBy);
    }

    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "team.update-function",
        intent: {
          teamId: input.teamId,
          function: input.function,
          functionSource,
          ...(confirmedBy === undefined ? {} : { confirmedBy }),
        },
        // 状态相关判定：归档是终态，职能不得改写（理由见上方注释）。
        // 在门的重放检测之后执行，故不影响幂等重放。
        precondition: () => {
          const now = this.#readTeam(input.teamId);
          if (now.status === "archived") {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${input.teamId} 已归档（终态，P-7「只读保留供追溯」）；` +
                "归档团队的职能不得改写——历史事实不因归档而变更",
            );
          }
        },
      },
      async (publish) => {
        const updated = await publish.update("team", input.teamId, (record) => ({
          ...record,
          function: input.function,
          functionSource,
          ...(confirmedBy === undefined ? {} : { confirmedBy }),
          // status **原样保留**（P-9.3：本命令不是成团通道）。
        }));
        return {
          teamId: updated.id,
          function: updated.function,
          functionSource: updated.functionSource,
          status: updated.status,
        };
      },
    );
  }

  /**
   * P-9 第③步：校验 `leadAppointmentId` 满足 **P-4 四项**后 `pending` → `active`。
   *
   * 〔P-9.3〕本命令是**唯一**的 `pending` → `active` 通道。
   *
   * 〔可接受的起始状态〕只接受 `pending` 与 `inactive`：
   *  - `pending`：成团（P-9 的「续做」路径——扫描 pending，若组长已就绪则执行③）；
   *  - `inactive`：换任恢复（P-8.4 的「换任」路径：建立新 `team_lead` 任职并
   *    显式改指，再激活）。P-9.4 明确两种成因的恢复路径不同，但**恢复动作**都是
   *    「组长就绪后激活」——同一命令承载，不是把两个语义合并。
   *  - `active`：**拒绝**（幂等性由 operationId 承担；重复激活同一团队应复用
   *    原 operationId 得到 `replayed`，而不是换 ID 再激活一次——那会让「激活
   *    发生了两次」在台账里看似成立）。
   *  - `archived`：**拒绝**（终态，P-7）。
   *
   * 〔P-4 校验与状态判定都在提交门的串行槽位内〕与唯一性判定同一理由：读-判-写
   * 之间不得插入其他本地提交。故用 `precondition` 钩子（意图落盘前拒绝 = 零业务写、
   * 零未决意图）。**注意**：`precondition` 在门的**重放检测之后**执行，因此
   * 「同 operationId 重放」不会被状态判定挡住（见 `updateTeamFunction` 的同款
   * 说明）——这一点对 `activate` 尤其重要：它是唯一把 `pending` 变成 `active`
   * 的命令，若状态判定放在门之前，重放会因为「已是 active」而失败，幂等性破坏。
   */
  async activateTeam(
    input: SoloipsActivateTeamInput,
  ): Promise<SoloipsCommitOutcome<SoloipsActivateTeamResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isTeamId(input.teamId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "teamId 形状不合法");
    }
    if (input.leadAppointmentId !== undefined && !isAppointmentId(input.leadAppointmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "leadAppointmentId 形状不合法");
    }
    // 只读前置：取当前记录（团队不存在即 PRECONDITION）。这是**输入可解析性**
    // 检查，不是状态判定——状态判定全部在 precondition 内（见下）。
    this.#readTeam(input.teamId);
    // 显式指认的任职必须存在（换任路径：先 appointment.create，再 activate 改指）。
    if (input.leadAppointmentId !== undefined) {
      this.#readAppointment(input.leadAppointmentId);
    }

    const teamId = input.teamId;

    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "team.activate",
        intent: {
          teamId,
          ...(input.leadAppointmentId === undefined
            ? {}
            : { leadAppointmentId: input.leadAppointmentId }),
        },
        precondition: () => {
          // 每次都在槽位内重读当前状态：precondition 的执行时机在意图落盘之前，
          // 此处读到的就是本次写入将要基于的状态（同一串行槽位，无插入）。
          const now = this.#readTeam(teamId);
          if (now.status === "archived") {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${teamId} 已归档（终态，P-7）；归档团队不得再激活`,
            );
          }
          if (now.status === "active") {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${teamId} 已是可用状态；重复激活请复用同一 operationId（幂等重放），` +
                "而不是换 ID 再激活一次（P-9.3：activate 是唯一的成团通道，但不表示可以重复成团）",
            );
          }
          const targetLeadId = input.leadAppointmentId ?? now.leadAppointmentId;
          if (targetLeadId === undefined) {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${teamId} 无组长引用（记录上缺省且未显式指认），不满足 P-4 第①项；` +
                "团队留在当前状态。请先经 appointment.create 建 team_lead 任职，" +
                "再以 leadAppointmentId 显式指认（P-9 第②③步）",
            );
          }
          // 用「指认后的记录」做 P-4 核验：直接把 targetLeadId 当作
          // leadAppointmentId 评估，避免「先写引用再校验」造成的「校验未过却
          // 已改指」半途状态（若校验失败，本次提交整体拒绝、记录不变）。
          const verdict = this.#evaluateLeadReference({
            ...now,
            leadAppointmentId: targetLeadId,
          });
          if (!verdict.valid) {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${teamId} 的组长引用不满足 P-4（${verdict.reason}）：${verdict.message}；` +
                "团队留在当前状态，本次不产生任何业务写（P-9 第③步：不满足则拒绝）",
            );
          }
        },
      },
      async (publish) => {
        // 校验已在 precondition 内通过；此处只做写入（同一串行槽位，无插入）。
        const targetLeadId = input.leadAppointmentId ?? this.#readTeam(teamId).leadAppointmentId;
        // 〔为什么显式判空而不是断言〕`targetLeadId` 的类型仍含 `undefined`
        // （precondition 是回调，编译器不跨回调传递收窄）。断言（`as`）会让
        // 「precondition 忘了判空」变成静默的类型欺骗；显式判空让那种情形在这里
        // 以明确错误失败。
        if (targetLeadId === undefined) {
          throw new SoloipsCoreError(
            "SOLOIPS_CORE_RECORD_INVALID",
            `团队 ${teamId} 激活路径缺组长引用：precondition 应已拒绝该输入（内部一致性错误）`,
          );
        }
        const leadAppointmentId = targetLeadId;
        const updated = await publish.update("team", teamId, (record) => ({
          ...record,
          leadAppointmentId,
          status: "active" as const,
        }));
        return {
          teamId: updated.id,
          status: updated.status,
          leadAppointmentId,
        };
      },
    );
  }

  /**
   * 归档团队（`→ archived` 终态）。**不是删除**（P-7）。
   *
   * 〔用途〕P-9 恢复入口的「收敛」路径：确认第②步未提交且不再需要的 `pending`
   * 团队，经此显式归档，不得让其长期悬挂。
   *
   * 〔保留组长引用〕P-8/P-7：归档时**保留最后有效值**（历史事实），不因归档清空
   * `leadAppointmentId`——清空会让「当时谁是组长」在归档后不可考。
   *
   * 〔幂等〕已归档的团队再次 `close` 返回 `PRECONDITION`（复用 operationId 则
   * 得到 `replayed`）。`archived` 是终态，没有出边（P-7 的状态迁移路径
   * 「pending → 可用 ↔ 不可用 → 归档」）。判定放在 `precondition`（门的重放
   * 检测之后），故重放不受状态判定阻塞——见 `updateTeamFunction` 的同款说明。
   */
  async closeTeam(
    input: SoloipsCloseTeamInput,
  ): Promise<SoloipsCommitOutcome<SoloipsCloseTeamResult>> {
    this.#assertOpen();
    requireOperationIdShape(input.operationId);
    if (!isTeamId(input.teamId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "teamId 形状不合法");
    }
    // 只读前置：团队不存在即 PRECONDITION（输入可解析性，非状态判定）。
    this.#readTeam(input.teamId);
    return this.#gate.commit(
      {
        operationId: asOperationId(input.operationId),
        kind: "team.close",
        intent: { teamId: input.teamId },
        precondition: () => {
          const now = this.#readTeam(input.teamId);
          if (now.status === "archived") {
            throw new SoloipsCoreError(
              "SOLOIPS_CORE_PRECONDITION",
              `团队 ${input.teamId} 已归档（终态，P-7）；重复归档请复用同一 operationId（幂等重放）`,
            );
          }
        },
      },
      async (publish) => {
        // 〔P-7〕**只**写 status，不调用 publish.delete（team 表无删除路径）。
        const updated = await publish.update("team", input.teamId, (record) => ({
          ...record,
          status: "archived" as const,
        }));
        return { teamId: updated.id, status: updated.status };
      },
    );
  }

  /**
   * 悬挂组长引用的恢复辅助（P-8.1）：扫描全部 `status='active'` 团队，核验 P-4，
   * 失效者标记为 `inactive`。**只标记、不自动修复**（P-8.3）。
   *
   * 〔P-8.6〕`archived` 团队不参与扫描（归档是终态，不再要求有效组长）。
   * `pending` 团队也不「标记」——它本就不是可用态，其处置是「续做/收敛」
   * （P-9），故只**报告**在 `pending` 清单里。
   *
   * 〔P-8.5 可观察性〕返回 `markedInactive` 使「本次扫描改了什么」可见；调用方
   * 不必回查介质。
   *
   * ── 〔登记〕本命令**不经提交门**（core 内第二处此类写，第一处是账户绑定）──
   *
   * 为什么不经门（`#gate.commit` 的「意图先行 + operationId 幂等」）：
   *  1. **没有可预写的意图**：本命令的「意图」就是当前介质状态本身。写意图等于
   *     把整张 team 表复制进台账，而台账的用途是「同一 operationId 重放原结果」
   *     ——本命令**没有** operationId 入参（契约里它不是 `Soloips*Input`），因为
   *     它的重复执行结果恒等（幂等收敛），不需要重放语义；
   *  2. **写面频率**：P-8.1 允许「每次读面」都扫描。若每次扫描都产生一条台账
   *     记录，台账会以读面频率增长，损害它作为「未决操作锚点」的可用性
   *     （`listPendingOperations` 的核对价值来自它只含**业务操作**）；
   *  3. **有先例且同类**：账户绑定写入（`verifyAccountBinding` 的
   *     `domain.global.set`）同样不经门、同样只复核写权——两者都是「根级/系统级
   *     事实的收敛写入」，不是有 operationId 的业务操作。故这不是新开的口子，
   *     而是同一类的第二处。
   *
   * 〔代价与补偿〕不经门意味着没有「意图先行 + 串行槽位」保护。补偿：
   *  - **写前复核写权**（`#reconcileOne` 的 `lease.assertHeld`），失权即拒；
   *  - **幂等收敛**：多次 `update` 之间崩溃留下的部分标记是**收敛中间态**——
   *    已标记的保持 `inactive`，未标记的下次扫描继续处理；
   *  - **读面不依赖标记**：`#isUsableTeam` 始终按 P-4 实时核验，因此「标记没跑全」
   *    不会让失效团队被读作可用（P-8.2 由读面自身满足）。
   *
   * 〔收紧路径〕若后续裁定要求「core 内全部业务写都经提交门」，则为它登记
   * `team.reconcile` kind 并把本命令改为经门提交（入参加 `operationId`）——
   * 那是一次机械改造，本命令的语义与读面纪律不变。登记为切片遗留项。
   */
  async reconcileTeams(): Promise<SoloipsTeamReconcileResult> {
    this.#assertOpen();
    const markedInactive: SoloipsTeamId[] = [];
    const pending: SoloipsTeamId[] = [];
    const toDeactivate: SoloipsTeamId[] = [];
    let scanned = 0;
    for (const [id, team] of this.#domain.table("team").entries()) {
      if (team.status === "pending") {
        pending.push(id);
        continue;
      }
      // P-8.6：archived 不参与扫描；inactive 已是标记结果（幂等，不重复写）。
      if (team.status !== "active") continue;
      scanned += 1;
      if (this.#evaluateLeadReference(team).valid) continue;
      toDeactivate.push(id);
    }
    for (const teamId of toDeactivate) {
      await this.#reconcileOne(teamId);
      markedInactive.push(teamId);
    }
    return { scanned, markedInactive, pending };
  }

  /**
   * 单条收敛：把 `active` 但组长失效的团队置为 `inactive`。
   *
   * 〔写权〕不经 `#gate` 的写路径**必须**在写前自行复核写权——否则它就成了
   * 绕过 fence 的写口（`reconcileTeams` 的「代价与补偿」段）。
   *
   * 〔为什么用 `update` 而不是先读后 `put`〕`update` 在介质层是「读当前值 →
   * 应用修订 → 写回」，`revise` 里对 `current` 展开，因此**只**改 `status`：
   * 即使扫描与写入之间记录被改动（理论上被 lease 排除），也不会用陈旧快照
   * 覆盖其他字段。
   */
  async #reconcileOne(teamId: SoloipsTeamId): Promise<void> {
    try {
      await this.#lease.assertHeld();
    } catch (error) {
      throw wrapLeaseFailure("team-reconcile", error);
    }
    await this.#domain.table("team").update(teamId, (current) => ({
      ...current,
      status: "inactive" as const,
    }));
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
    if (!isCompanyId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
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
    if (!isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    const found: SoloipsDepartmentRecord[] = [];
    for (const [, record] of this.#domain.table("department").entries()) {
      if (record.companyId === companyId) found.push(record);
    }
    return found;
  }

  /**
   * 读取部门（读面；`get*` 惯例返回 `undefined`，**不抛**）。
   *
   * 〔不复用 `#readDepartment`〕后者抛 `SOLOIPS_CORE_PRECONDITION`（写路径辅助的
   * 「引用的既有事实不存在」语义）；查询里「部门不存在」是可预期结果，
   * 与 `getCompany`/`getEmployee` 同口径。混用会让调用方被迫用 try/catch 表达
   * 「没找到」，也让「查询」与「命令」的失败语义不再可区分。
   */
  getDepartment(id: SoloipsDepartmentId): SoloipsDepartmentRecord | undefined {
    this.#assertOpen();
    if (!isDepartmentId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    return this.#domain.table("department").get(id);
  }

  getEmployee(id: SoloipsEmployeeId): SoloipsEmployeeRecord | undefined {
    this.#assertOpen();
    if (!isEmployeeId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
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
    if (!isAppointmentId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "appointmentId 形状不合法");
    }
    const record = this.#domain.table("appointment").get(id);
    if (record === undefined) return undefined;
    return { ...record, scope: this.#resolveAppointmentScope(record) };
  }

  getDocumentVersion(id: SoloipsDocumentVersionId): SoloipsDocumentVersionRecord | undefined {
    this.#assertOpen();
    if (!isDocumentVersionId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "versionId 形状不合法");
    }
    return this.#domain.table("document_version").get(id);
  }

  /**
   * 读取团队（读面，**不产生 kind**；BE-3 验收⑤）。
   *
   * 〔P-8.2/P-9.1〕返回**任何状态**的团队，但 `usable` 与 `leadReference` 显式
   * 标注可用性与失效原因（P-8.5/P-9.2「读面不得静默降级」：不可用团队**不**被
   * 返回空成员列表或空任务列表冒充正常团队）。
   *
   * 〔与 `listTeams` 的分工〕本方法不设「只看可用」的开关：按 id 取一个团队是
   * **诊断/详情**场景，调用方需要看到状态；而列表是**选择可用团队**的场景，
   * 默认过滤才有意义。两者的默认值差异反映用途差异，不是不一致。
   */
  getTeam(id: SoloipsTeamId): SoloipsTeamView | undefined {
    this.#assertOpen();
    if (!isTeamId(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "teamId 形状不合法");
    }
    const record = this.#domain.table("team").get(id);
    return record === undefined ? undefined : this.#teamView(record);
  }

  /**
   * 列团队（读面，**不产生 kind**）。
   *
   * 〔默认只给可用〕P-3/P-8.2/P-9.1 的判据同一：`status='active'` 且组长引用满足
   * P-4。默认排除 `pending`（成团中间态）、`inactive`（不可用）、`archived`
   * （归档）——「可用团队列表」不得含它们。
   *
   * 〔`includeUnusable` 的用途〕管理/诊断视图需要看到「为什么这个团队不可用」，
   * 此时返回全部并逐项带 `usable`/`leadReference`（P-8.5 的显式状态要求）。
   *
   * 〔`departmentId` 过滤（BE-4a 扩键）〕组织树「部门 → 团队」与编组场景需要按
   * 部门收窄。**扩键而非新增方法**：同一份可用性判据与投影不应有第二条实现路径
   * （多一个方法就多一处可能与 P-4 判据漂移的读面）。缺省＝不过滤，既有语义不变。
   * 两个条件为**与**关系；`departmentId` 指向不存在/别的公司的部门时返回空数组
   * （查询语义是「在这个范围内找」，空结果是合法结论，不报错）。
   */
  listTeams(
    companyId: SoloipsCompanyId,
    options?: {
      readonly includeUnusable?: boolean;
      readonly departmentId?: SoloipsDepartmentId;
    },
  ): readonly SoloipsTeamView[] {
    this.#assertOpen();
    if (!isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    const departmentId = options?.departmentId;
    if (departmentId !== undefined && !isDepartmentId(departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    const includeUnusable = options?.includeUnusable === true;
    const found: SoloipsTeamView[] = [];
    for (const [, record] of this.#domain.table("team").entries()) {
      if (record.companyId !== companyId) continue;
      if (departmentId !== undefined && record.departmentId !== departmentId) continue;
      const view = this.#teamView(record);
      if (!includeUnusable && !view.usable) continue;
      found.push(view);
    }
    return found;
  }

  // ── 读投影扩容（BE-4a；全部只读：不产生 kind、不写状态、不跑 reconcile） ────

  /**
   * 列员工（两跳：`appointment` → `employee`；去重键 = `employeeId`）。
   *
   * 过滤参数**二选一**（类型层钉住；运行期再校验一次——JS 调用方不受类型保护）：
   *  - `companyId`：任意 kind 的任职，解析后 `companyId` 相符；
   *  - `departmentId`：仅部门级任职且 `departmentId` 相符（公司级/团队级不挂部门）。
   *
   * 〔status 口径〕只计 `status='active'` 的任职（撤销不构成当前归属）。
   * 〔不可判定记录〕分支 3 → `SOLOIPS_CORE_RECORD_INVALID` 冒泡，**不跳过**
   * （跳过会让结果静默漏掉该员工；与总助理唯一性判定同向 fail-closed）。
   */
  listEmployees(
    filter:
      | { readonly companyId: SoloipsCompanyId; readonly departmentId?: undefined }
      | { readonly departmentId: SoloipsDepartmentId; readonly companyId?: undefined },
  ): readonly SoloipsEmployeeAffiliation[] {
    this.#assertOpen();
    const companyId = filter.companyId;
    const departmentId = filter.departmentId;
    if ((companyId === undefined) === (departmentId === undefined)) {
      throw new SoloipsCoreError(
        "SOLOIPS_CORE_VALIDATION",
        "listEmployees 需要且只需要一个过滤键：companyId 或 departmentId" +
          "（两者都给会让「按公司」与「按部门」的语义混在一处，都不给则退化为全量扫描，非本方法用途）",
      );
    }
    if (companyId !== undefined) {
      if (!isCompanyId(companyId)) {
        throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
      }
      return this.#affiliationsOf(
        this.#scanAppointments({ companyId }, `按公司 ${companyId} 列员工`),
      );
    }
    if (departmentId === undefined || !isDepartmentId(departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    return this.#affiliationsOf(
      this.#scanAppointments({ departmentId }, `按部门 ${departmentId} 列员工`),
    );
  }

  /**
   * 列任职（过滤键可任意组合；**不去重**——一条任职一项）。
   *
   * 〔status 口径〕缺省只给 `active`（与 `listEmployees` 同一口径）；
   * `includeRevoked: true` 返回全部（历史/审计视图）。
   * 〔作用域〕返回项 `scope` 恒为解析后（§2.3）；分支 3 → `RECORD_INVALID` 冒泡。
   * 〔`departmentId` 与 `employeeId` 的组合〕与关系：部门级任职 + 该员工。
   */
  listAppointments(filter?: {
    readonly companyId?: SoloipsCompanyId;
    readonly departmentId?: SoloipsDepartmentId;
    readonly employeeId?: SoloipsEmployeeId;
    readonly includeRevoked?: boolean;
  }): readonly SoloipsAppointmentView[] {
    this.#assertOpen();
    const companyId = filter?.companyId;
    const departmentId = filter?.departmentId;
    const employeeId = filter?.employeeId;
    if (companyId !== undefined && !isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    if (departmentId !== undefined && !isDepartmentId(departmentId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "departmentId 形状不合法");
    }
    if (employeeId !== undefined && !isEmployeeId(employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    const hits = this.#scanAppointments(
      {
        ...(companyId === undefined ? {} : { companyId }),
        ...(departmentId === undefined ? {} : { departmentId }),
        ...(employeeId === undefined ? {} : { employeeId }),
        ...(filter?.includeRevoked === undefined ? {} : { includeRevoked: filter.includeRevoked }),
      },
      "列任职",
    );
    return hits.map((hit) => ({ ...hit.record, scope: hit.scope }));
  }

  /**
   * 列某员工的全部文档版本（历史，含非当前版本）。
   *
   * 〔为什么不按 `currentDocuments` 收窄〕本方法是**版本历史**：CAS 冲突时
   * 未提升的版本仍持久保留（02-company-contract §11.1），调用方需要看到它。
   * 当前引用由 `getEmployee().currentDocuments` 表达，两者分工不同。
   *
   * 〔空结果不是错误〕员工不存在或没有版本都返回空数组——列表方法不因过滤键
   * 指向不存在的实体而报错（需要存在性判定用 `getEmployee`）。
   */
  listDocumentVersions(employeeId: SoloipsEmployeeId): readonly SoloipsDocumentVersionRecord[] {
    this.#assertOpen();
    if (!isEmployeeId(employeeId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "employeeId 形状不合法");
    }
    const found: SoloipsDocumentVersionRecord[] = [];
    for (const [, record] of this.#domain.table("document_version").entries()) {
      if (record.ownerId === employeeId) found.push(record);
    }
    return found;
  }

  /**
   * 总助理读面（SA-01.1 的**显式状态**实现，data-contract §2.4.1）。
   *
   * 判据与 `#assertNoActiveGeneralAssistant` **同一口径**（读面不得有第二套语义）：
   * `status='active'` ∧ `role='general_assistant'` ∧ 作用域解析后
   * `kind='company'` 且 `companyId` 相符。
   *
   * 〔三态区分，缺一不可〕
   *  - 公司记录**读不到** → `uncovered`（查询未覆盖该公司）；
   *  - 公司存在且无有效总助理 → `vacant`（§2.4.1 的合法「待招募」态；
   *    `administrators` 显式为空数组，不让调用方去区分「缺省」与「空」）；
   *  - 存在一条 → `present`；**多于一条** → `inconsistent`（§2.4.2 的唯一性被
   *    破坏时不取首条掩盖，如实暴露，见 `SoloipsAdministratorProjection`）。
   *
   * 〔失败＝抛出，不是某个分支〕store 已关闭、介质读取失败、以及**作用域不可
   * 判定**的记录（§2.3 分支 3）都抛错。最后一条是刻意的 fail-closed：一条
   * `role='general_assistant'` 但解析不出归属的记录**可能**就是本公司的总助理
   * （猜「不是」同样是猜，与 `#assertNoActiveGeneralAssistant` 同向），故查询
   * 失败而不是返回 `vacant`——否则数据损坏会被读成「待招募」。
   * 撤销的任职**不是**失败：它确定不占名额（与唯一性判定一致），故不入选。
   *
   * 〔读面纪律〕不产生 kind、不写状态、不跑 reconcile（P-8.1 的落盘由
   * `reconcileTeams` 显式承担）。
   */
  listAdministrators(companyId: SoloipsCompanyId): SoloipsAdministratorProjection {
    this.#assertOpen();
    if (!isCompanyId(companyId)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "companyId 形状不合法");
    }
    if (this.#domain.table("company").get(companyId) === undefined) {
      return {
        status: "uncovered",
        companyId,
        message:
          `公司 ${companyId} 不在本读面的覆盖范围内（公司记录不存在）；` +
          "这不表示该公司「没有总助理」——两者不得互相冒充（SA-01.1）",
      };
    }
    const administrators: SoloipsAdministratorView[] = [];
    for (const [, record] of this.#domain.table("appointment").entries()) {
      if (record.status !== "active" || record.role !== "general_assistant") continue;
      // 作用域先解析后比较（§2.3）：存量记录（无 scope、只有 departmentId）
      // 解析为**部门级**，因此不会被误算作公司总助理；不可判定则抛错（见上）。
      const scope = this.#resolveAppointmentScope(record);
      if (scope.kind !== "company" || scope.companyId !== companyId) continue;
      administrators.push({
        appointmentId: record.id,
        employeeId: record.employeeId,
        status: "active",
        scope,
      });
    }
    if (administrators.length === 0) {
      return {
        status: "vacant",
        companyId,
        administrators: [],
        message:
          `公司 ${companyId} 没有有效的公司级 general_assistant 任职（data-contract §2.4.1 的` +
          "「待招募总助理」合法状态）；招募入口见 §2.4.2（createEmployee + createAppointment）",
      };
    }
    if (administrators.length > 1) {
      return {
        status: "inconsistent",
        companyId,
        administrators,
        message:
          `公司 ${companyId} 存在 ${administrators.length} 条有效的公司级 general_assistant 任职，` +
          "违反 data-contract §2.4.2「同一公司同一时刻至多一条」；" +
          "读面如实暴露全部条目（不取首条掩盖），须先撤销多余任职",
      };
    }
    return { status: "present", companyId, administrators };
  }

  getOperation(id: SoloipsOperationId): SoloipsOperationRecord | undefined {
    this.#assertOpen();
    if (!isOperationIdShape(id)) {
      throw new SoloipsCoreError("SOLOIPS_CORE_VALIDATION", "operationId 形状不合法");
    }
    return this.#gate.getOperation(id);
  }

  listPendingOperations(): readonly SoloipsOperationRecord[] {
    this.#assertOpen();
    return this.#gate.listPendingOperations();
  }
}
