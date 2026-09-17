/**
 * 受控 id 工厂：品牌 id 的唯一构造点。
 *
 * DEV-05：品牌断言只出现在这里——工厂先做形状校验（前缀 + 非空），
 * 再以单次断言收窄；业务代码不得自行断言品牌。
 */

import { randomUUID } from "node:crypto";

import type {
  SoloipsAppointmentId,
  SoloipsCompanyId,
  SoloipsDepartmentId,
  SoloipsDocumentVersionId,
  SoloipsEmployeeId,
  SoloipsOperationId,
  SoloipsTeamId,
} from "./contracts.js";

/** 单次受控断言：从校验过的普通字符串收窄为品牌 id（唯一断言点）。 */
function asId<Id extends string>(value: string): Id {
  return value as Id;
}

function newPrefixedId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function isPrefixedId(prefix: string, value: string): boolean {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

// ── 生成（进程内唯一；跨进程一致性由持久读回与 operationId 幂等承担） ──────────

export function newCompanyId(): SoloipsCompanyId {
  return asId<SoloipsCompanyId>(newPrefixedId("cmp"));
}

export function newDepartmentId(): SoloipsDepartmentId {
  return asId<SoloipsDepartmentId>(newPrefixedId("dep"));
}

export function newEmployeeId(): SoloipsEmployeeId {
  return asId<SoloipsEmployeeId>(newPrefixedId("emp"));
}

export function newAppointmentId(): SoloipsAppointmentId {
  return asId<SoloipsAppointmentId>(newPrefixedId("apt"));
}

export function newDocumentVersionId(): SoloipsDocumentVersionId {
  return asId<SoloipsDocumentVersionId>(newPrefixedId("docver"));
}

/**
 * 团队 id 生成（BE-2 品牌先行；`team` 表属 BE-3，本切片只建品牌与工厂）。
 *
 * 生成路径当前**无调用方**（BE-3 的 `createTeam` 才会用），先随品牌一并落地，
 * 使「品牌 → 工厂 → 谓词 → 持久校验器」四件套保持同一切片内的完整性，
 * 避免 BE-3 再回头改契约文件。`isTeamId` 则**已被** scope 校验使用。
 */
export function newTeamId(): SoloipsTeamId {
  return asId<SoloipsTeamId>(newPrefixedId("team"));
}

// ── 边界校验（调用方传来的 id 不受类型系统保护，入口处必须校验形状） ──────────

export function isCompanyId(value: string): boolean {
  return isPrefixedId("cmp", value);
}

export function isDepartmentId(value: string): boolean {
  return isPrefixedId("dep", value);
}

export function isEmployeeId(value: string): boolean {
  return isPrefixedId("emp", value);
}

export function isAppointmentId(value: string): boolean {
  return isPrefixedId("apt", value);
}

export function isDocumentVersionId(value: string): boolean {
  return isPrefixedId("docver", value);
}

/** 团队 id 形状（scope 校验用；`team` 表属 BE-3）。 */
export function isTeamId(value: string): boolean {
  return isPrefixedId("team", value);
}

/**
 * 稳定操作键：由调用方提供。接受任意非空白字符串（前缀由调用方约定），
 * 只要求稳定与可重放（DEV-08）；长度上限防滥用。
 */
export function asOperationId(value: string): SoloipsOperationId {
  return asId<SoloipsOperationId>(value);
}

export function isOperationIdShape(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256;
}
