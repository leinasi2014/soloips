/**
 * 测试种子：经**公开命令面**搭建一个「完整入职」的员工（ORG-03 全项满足），
 * 供准入判定与工作路径用例裁剪使用。不直达介质——只有损坏/未决注入用例
 * 才使用 fakeMediumTable。
 */

import type {
  SoloipsAppointmentId,
  SoloipsCompanyId,
  SoloipsCoreService,
  SoloipsDepartmentId,
  SoloipsEmployeeId,
  SoloipsOperationId,
} from "../src/contracts";
import { asOperationId } from "../src/ids";

export interface SeededCompany {
  readonly service: SoloipsCoreService;
  readonly companyId: SoloipsCompanyId;
  readonly departmentId: SoloipsDepartmentId;
  readonly employeeId: SoloipsEmployeeId;
  readonly appointmentId: SoloipsAppointmentId;
}

export interface SeedOptions {
  /** 指定不保存/不完成的入职项，用于制造具体缺项。 */
  readonly skip?: ReadonlySet<string>;
  /** 覆盖某文档的保存内容（默认有效非空）。 */
  readonly documentContent?: Readonly<Record<string, string>>;
  /** 任职要求的岗位能力。 */
  readonly requiredCapabilities?: readonly string[];
}

let seedCounter = 0;

export function nextSeedOperationId(label: string): SoloipsOperationId {
  seedCounter += 1;
  return asOperationId(`seed-${label}-${seedCounter}`);
}

/**
 * 测试用的部署账户（模拟部署层经 config 注入的 `accountId`）。
 *
 * 〔约束〕刻意**不用** `"seed"`：该值是 BE-1 之前硬编码的**占位账户**，
 * `openSoloipsCompanyStore` 会以 `SOLOIPS_CORE_CONFIG_INVALID` 拒绝它
 * （存量占位数据不得被当作部署账户）。用别的值才能让测试反映真实部署形态。
 */
export const TEST_ACCOUNT_ID = "acct-test-primary";

/** 另一个账户：用于「根内出现异账户公司记录即拒绝打开」的用例。 */
export const TEST_OTHER_ACCOUNT_ID = "acct-test-foreign";

/** 组建完整入职员工；skip 的项保持缺失。 */
export async function seedOnboardedEmployee(
  service: SoloipsCoreService,
  options: SeedOptions = {},
): Promise<SeededCompany> {
  const skip = options.skip ?? new Set<string>();
  const company = await service.createCompany({
    operationId: nextSeedOperationId("company"),
    name: "测试公司",
  });
  if (company.status !== "committed") throw new Error(`种子失败：${company.status}`);
  const department = await service.createDepartment({
    operationId: nextSeedOperationId("department"),
    companyId: company.result.companyId,
    name: "创作部",
  });
  if (department.status !== "committed") throw new Error(`种子失败：${department.status}`);
  const employee = await service.createEmployee({
    operationId: nextSeedOperationId("employee"),
    displayName: "员工甲",
  });
  if (employee.status !== "committed") throw new Error(`种子失败：${employee.status}`);

  const required = options.requiredCapabilities ?? [];
  const appointment = await service.createAppointment({
    operationId: nextSeedOperationId("appointment"),
    employeeId: employee.result.employeeId,
    departmentId: department.result.departmentId,
    ...(required.length === 0 ? {} : { requiredCapabilities: [...required] }),
  });
  if (appointment.status !== "committed") throw new Error(`种子失败：${appointment.status}`);

  const documentTypes = ["profile", "avatar", "soul", "operating"] as const;
  for (const documentType of documentTypes) {
    if (skip.has(documentType)) continue;
    const content =
      options.documentContent?.[documentType] ?? `有效的${documentType}内容 seed-${seedCounter}`;
    const saved = await service.saveEmployeeDocument({
      operationId: nextSeedOperationId(`doc-${documentType}`),
      employeeId: employee.result.employeeId,
      documentType,
      content,
    });
    if (saved.status !== "committed") throw new Error(`种子失败：${saved.status}`);
    if (saved.result.outcome !== "promoted") throw new Error(`种子失败：${saved.result.outcome}`);
    if (skip.has(`assembly:${documentType}`)) continue;
    const evidence = await service.recordAssemblyEvidence({
      operationId: nextSeedOperationId(`assembly-${documentType}`),
      employeeId: employee.result.employeeId,
      documentType,
      versionId: saved.result.versionId,
    });
    if (evidence.status !== "committed") throw new Error(`种子失败：${evidence.status}`);
  }

  if (!skip.has("memory")) {
    const memory = await service.initializeEmployeeMemory({
      operationId: nextSeedOperationId("memory"),
      employeeId: employee.result.employeeId,
    });
    if (memory.status !== "committed") throw new Error(`种子失败：${memory.status}`);
  }

  for (const capability of required) {
    if (skip.has(`capability:${capability}`)) continue;
    const verified = await service.verifyEmployeeCapability({
      operationId: nextSeedOperationId(`capability-${capability}`),
      employeeId: employee.result.employeeId,
      capability,
    });
    if (verified.status !== "committed") throw new Error(`种子失败：${verified.status}`);
  }

  return {
    service,
    companyId: company.result.companyId,
    departmentId: department.result.departmentId,
    employeeId: employee.result.employeeId,
    appointmentId: appointment.result.appointmentId,
  };
}
