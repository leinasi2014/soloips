/**
 * SOLOIPS-WEB-I18N-EN
 *
 * `soloips` 命名空间的**英文字典**，按 `zh`（键集真源）检查完备性。
 *
 * 完备性由类型强制，不靠人工比对：
 *  - `zh` 的键集是 `SoloipsLocaleKey`（见 `./zh.js`）；
 *  - 本文件声明 `satisfies Record<SoloipsLocaleKey, string>`——**少一个键即
 *    编译失败**，多一个键同样失败（对象字面量的多余属性检查）。
 *  - 运行期再做一次键集双向断言（`packages/web/tests/i18n-assets.spec.ts`）：
 *    类型层的 `satisfies` 覆盖不到「有人把 zh 与 en 都改成同一份错误形状」这类
 *    协同改动，运行期断言把「两字典键集相等」变成可观察事实（设计 §7 V1）。
 *
 * 〔约束〕本文件**不得**成为第二份键集真源：任何新增键先加 `zh`，再补本文件；
 * 反向操作（先写 en）会让「键集真源」这一约定失去意义。
 *
 * 〔约束〕与 `zh` 同：通用词（`ok`/`cancel`/`close`/`save`/`loading`…）**不在**
 * 本命名空间定义，由 DSH `common` 命名空间提供（设计 §6「`common` 复用」）。
 */

import type { SoloipsLocaleKey } from "./zh.js";

export const en = {
  // ── 错误码文案 ────────────────────────────────────────────────────────────

  "soloips.error.unknown": "Something went wrong ({code}). Copy the diagnostics and try again.",
  "soloips.error.configInvalid":
    "The deployment configuration is invalid, so the service did not start. Ask an administrator to check it.",
  "soloips.error.adapterInvalid":
    "The runtime interface does not match the expected contract, so the service did not start. Ask an administrator to check it.",
  "soloips.error.storeClosed":
    "The data store is closed; the workspace is read-only and this action is unavailable.",
  // 〔约束〕lease 两键**不得**承诺零副作用（F-02）：失权可能在 pending 意图已
  // 落盘、乃至业务记录已部分写入之后才被检出（`core/src/commit-gate.ts:336-347`
  // 的发布顺序 + `:371-405` 的逐点复核，无跨表回滚）。故只说明「写入已停止、
  // 结果需核对」，并保留操作编号；对应中文见 `./zh.js` 的同名键。
  "soloips.error.leaseLost":
    "The write lease is no longer held, so writing has stopped. The result of this operation must be reconciled — it may already be partially written. Keep this operation id and do not resubmit it; do not retry automatically — first check whether another process is writing.",
  "soloips.error.leaseUnknown":
    "The write-lease state could not be confirmed, so writing has stopped. The result of this operation must be reconciled — it may already be partially written. Keep this operation id and do not resubmit it; reconcile the pending operation and the lease state first.",
  "soloips.error.validation": "The input does not meet the requirements. Check it and try again.",
  "soloips.error.precondition":
    "The current state does not allow this action (the target may be missing or revoked). Refresh and check again.",
  "soloips.error.conflict":
    "This operation id is already used by a different operation, so nothing was written.",
  "soloips.error.accountMismatch":
    "The account binding does not match, so access to this data root was refused. Ask an administrator to verify the deployment account.",
  "soloips.error.recordInvalid":
    "Stored data does not match the expected structure (possible corruption). Copy the diagnostics so it can be investigated.",
  "soloips.error.adapter.generic":
    "A runtime interface call failed ({code}). Copy the diagnostics so it can be investigated.",
  "soloips.error.diagnosticCopy": "Copy diagnostics",

  // ── 入职缺项文案 ──────────────────────────────────────────────────────────

  "soloips.onboarding.gap.generic":
    "An onboarding item is not satisfied ({reason}). Copy the diagnostics so it can be investigated.",

  "soloips.onboarding.gap.employee.employeeNotFound":
    "No record was found for this employee. Check that the employee exists and the id is correct.",
  "soloips.onboarding.gap.appointment.appointmentMissing":
    "This employee has no appointment yet. Create one first.",
  "soloips.onboarding.gap.appointment.appointmentRevoked":
    "All appointments for this employee have been revoked. Create a new appointment.",

  "soloips.onboarding.gap.profile.documentMissing":
    "No saved current version of the public profile exists. Save the public profile first.",
  "soloips.onboarding.gap.profile.documentContentInvalid":
    "The public profile content is invalid or does not match what was saved. Save it again.",
  "soloips.onboarding.gap.profile.documentOwnerMismatch":
    "The current public profile version is not owned by this employee. Save it again.",

  "soloips.onboarding.gap.avatar.documentMissing":
    "No saved current version of the avatar exists. Save the avatar first.",
  "soloips.onboarding.gap.avatar.documentContentInvalid":
    "The avatar content is invalid or does not match what was saved. Save it again.",
  "soloips.onboarding.gap.avatar.documentOwnerMismatch":
    "The current avatar version is not owned by this employee. Save it again.",

  "soloips.onboarding.gap.soul.documentMissing":
    "No saved current version of the SOUL document exists. Save it first.",
  "soloips.onboarding.gap.soul.documentContentInvalid":
    "The SOUL document content is invalid or does not match what was saved. Save it again.",
  "soloips.onboarding.gap.soul.documentOwnerMismatch":
    "The current SOUL document version is not owned by this employee. Save it again.",

  "soloips.onboarding.gap.operating.documentMissing":
    "No saved current version of the OPERATING document exists. Save it first.",
  "soloips.onboarding.gap.operating.documentContentInvalid":
    "The OPERATING document content is invalid or does not match what was saved. Save it again.",
  "soloips.onboarding.gap.operating.documentOwnerMismatch":
    "The current OPERATING document version is not owned by this employee. Save it again.",

  "soloips.onboarding.gap.memory.memoryNotInitialized":
    "This employee's memory has not been initialized yet. Initialize it first.",
  "soloips.onboarding.gap.capability.capabilityNotVerified":
    "The required capability “{capability}” has not been verified yet. Verify it first.",

  "soloips.onboarding.gap.assembly.assemblyEvidenceMissing":
    "There is no evidence that the required documents were actually assembled. Complete the assembly first.",
  "soloips.onboarding.gap.assembly.assemblyEvidenceStale":
    "The assembly evidence points at an older version; the current version has not been assembled. Assemble again.",

  // ── 工作准入拒绝文案 ──────────────────────────────────────────────────────

  "soloips.work.entry.refused.onboardingNotReady":
    "Onboarding is not complete, so work cannot be claimed yet. Finish the onboarding items first.",
  "soloips.work.entry.refused.employeeOperationUnknown":
    "This employee has an operation with an unknown result, so new work cannot start. Reconcile the pending operation — do not retry under a new id.",

  // ── Company panel copy (FE-1a) ────────────────────────────────────────────

  "soloips.company.panel.title": "Companies",

  "soloips.company.form.name.label": "Company name",
  "soloips.company.form.name.placeholder": "Enter a company name",
  "soloips.company.form.type.label": "Company type",
  "soloips.company.form.name.required": "Enter a company name first.",
  "soloips.company.form.review": "Create…",
  "soloips.company.confirm.summary": "The following company will be created:",
  "soloips.company.confirm.submit": "Confirm creation",
  "soloips.company.confirm.cancel": "Back to editing",

  "soloips.company.submitting.first": "Creating the company…",
  "soloips.company.submitting.retry": "Retrying under the same operation id…",

  "soloips.company.outcome.committed": "The company was created.",
  "soloips.company.outcome.replayed":
    "This operation id had already created a company, so nothing was created again — the original result is shown.",
  // 〔约束〕与 zh 同：不得承诺零副作用（未决意图可能已落盘、乃至业务已部分写入）。
  "soloips.company.outcome.unknown":
    "The result of this operation id is not yet known — the company may or may not exist. Keep operation id {operationId} and do not start another creation; reconcile the result before deciding what to do next.",
  "soloips.company.outcome.refused":
    "The quota is exhausted, so no company was created: the “{resource}” allowance of the {planCode} plan is {current}/{limit}. Adjust and submit again.",
  "soloips.company.outcome.unavailable":
    "The business service is not ready yet, so this call did not run. Try again later — it will reuse the same operation id {operationId}.",
  "soloips.company.outcome.failed":
    "Creating the company failed and the outcome of this operation must be reconciled. Keep operation id {operationId} and do not start another creation.",

  "soloips.company.action.retry": "Retry",
  "soloips.company.action.new": "Create another company",
  "soloips.company.action.refresh": "Refresh",

  "soloips.company.type.platform": "Platform company",
  "soloips.company.type.operation": "Operating subsidiary",
  "soloips.company.type.enterprise": "User company",
  "soloips.company.type.subsidiary": "User subsidiary",

  "soloips.company.status.active": "Active",
  "soloips.company.status.archived": "Archived",

  "soloips.company.limit.company": "user companies",
  "soloips.company.limit.subsidiary": "subsidiaries",
  "soloips.company.plan.free": "Free",
  "soloips.company.plan.pro": "Pro",
  "soloips.company.plan.enterprise": "Enterprise",

  "soloips.company.list.heading": "Companies",
  "soloips.company.list.empty": "No company has been created yet.",
  "soloips.company.list.unavailable":
    "The business service is not ready yet, so the company list cannot be read. This does not mean there are no companies — refresh later.",
  "soloips.company.list.rootNotFound":
    "No record of that company exists, so its subsidiaries cannot be shown (this does not mean it has none). Refresh and check again.",
  "soloips.company.list.loading": "Reading the company list…",
  "soloips.company.list.failed": "Reading the company list failed.",
  "soloips.company.list.item.aria": "Company {name}",
} satisfies Record<SoloipsLocaleKey, string>;
