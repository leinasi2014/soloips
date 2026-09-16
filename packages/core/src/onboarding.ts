/**
 * 入职/准入判定：ORG-03「完整必要入职，增量复核」的可执行投影，
 * SOLO-ACC-04 三条工作路径（经理派单/员工自领/自动调度）共用本判定。
 *
 * 纪律（ORG-03 / DEP-D04）：
 *  - 模型自报、文件存在、assigned 标志均不能独自形成 ready——本判定只读
 *    权威持久事实（当前引用指向的版本记录），并复核内容与摘要；
 *  - 文件存在但内容无效（空白/摘要不符）必须失败，缺项返回具体原因；
 *  - 初始记忆允许空集合：只要求「已初始化」事实；
 *  - 装配证据必须指向当前版本：普通文档变化只失效相关部分（证据过期）。
 *
 * 本模块是纯读函数：不写状态、不持锁、不产生任何副作用。
 */

import type {
  SoloipsAppointmentRecord,
  SoloipsDocumentVersionRecord,
  SoloipsEmployeeId,
  SoloipsEmployeeRecord,
  SoloipsOnboardingGap,
  SoloipsOnboardingStatus,
  SoloipsRequiredDocumentType,
} from "./contracts";
import { soloipsDigestOf } from "./digest";

/** 判定所需的只读投影（由 store 提供；sync 读面与 adapter 契约一致）。 */
export interface SoloipsOnboardingReadModel {
  getEmployee(id: SoloipsEmployeeId): SoloipsEmployeeRecord | undefined;
  listAppointmentsByEmployee(employeeId: SoloipsEmployeeId): readonly SoloipsAppointmentRecord[];
  getDocumentVersion(id: string): SoloipsDocumentVersionRecord | undefined;
}

const REQUIRED_DOCUMENT_TYPES: readonly SoloipsRequiredDocumentType[] = [
  "profile",
  "avatar",
  "soul",
  "operating",
];

const DOCUMENT_LABELS: Readonly<Record<SoloipsRequiredDocumentType, string>> = {
  profile: "公开资料（profile）",
  avatar: "头像（avatar）",
  soul: "SOUL/性格文档（soul）",
  operating: "OPERATING/操作规范（operating）",
};

function gap(
  item: SoloipsOnboardingGap["item"],
  reason: SoloipsOnboardingGap["reason"],
  message: string,
  extra?: {
    readonly documentType?: SoloipsRequiredDocumentType;
    readonly documentDetail?: SoloipsOnboardingGap["documentDetail"];
    readonly capability?: string;
  },
): SoloipsOnboardingGap {
  return {
    item,
    reason,
    message,
    // 条件展开保持 exactOptionalPropertyTypes：缺省即省略，不写 undefined。
    ...(extra?.documentType === undefined ? {} : { documentType: extra.documentType }),
    ...(extra?.documentDetail === undefined ? {} : { documentDetail: extra.documentDetail }),
    ...(extra?.capability === undefined ? {} : { capability: extra.capability }),
  };
}

/** 选择当前有效任职：有多条 active 时取代际最高者（最新授权压旧代际）。 */
function currentAppointment(
  appointments: readonly SoloipsAppointmentRecord[],
): SoloipsAppointmentRecord | undefined {
  let best: SoloipsAppointmentRecord | undefined;
  for (const appointment of appointments) {
    if (appointment.status !== "active") continue;
    if (best === undefined || appointment.generation > best.generation) best = appointment;
  }
  return best;
}

/**
 * 单个必需文档的核对：存在 → 属主 → 内容有效（非空白 + 摘要一致）。
 * 摘要复核即「所有权/版本读回」：读回的内容与保存时摘要不符视为数据不一致。
 */
function documentGaps(
  employee: SoloipsEmployeeRecord,
  documentType: SoloipsRequiredDocumentType,
  read: SoloipsOnboardingReadModel,
): SoloipsOnboardingGap[] {
  const label = DOCUMENT_LABELS[documentType];
  const currentId = employee.currentDocuments[documentType];
  if (currentId === undefined) {
    return [
      gap(documentType, "document-missing", `缺少${label}的已保存当前版本`, { documentType }),
    ];
  }
  const version = read.getDocumentVersion(currentId);
  if (version === undefined) {
    return [
      gap(documentType, "document-missing", `${label}的当前引用 ${currentId} 读不到对应版本记录`, {
        documentType,
      }),
    ];
  }
  if (version.ownerId !== employee.id) {
    return [
      gap(
        documentType,
        "document-owner-mismatch",
        `${label}当前版本的属主是 ${version.ownerId}，不是员工本人`,
        { documentType },
      ),
    ];
  }
  if (version.content.trim().length === 0) {
    return [
      gap(documentType, "document-content-invalid", `${label}已保存但内容无效（空白内容）`, {
        documentType,
        documentDetail: "blank-content",
      }),
    ];
  }
  if (soloipsDigestOf(version.content) !== version.digest) {
    return [
      gap(
        documentType,
        "document-content-invalid",
        `${label}内容与保存时摘要不一致（疑似数据损坏）`,
        { documentType, documentDetail: "digest-mismatch" },
      ),
    ];
  }
  return [];
}

/** 装配证据核对：证据必须存在且指向当前版本（ORG-03「对当前版本的实际请求装配」）。 */
function assemblyGaps(
  employee: SoloipsEmployeeRecord,
  documentType: SoloipsRequiredDocumentType,
): SoloipsOnboardingGap[] {
  const label = DOCUMENT_LABELS[documentType];
  const evidence = employee.assemblyEvidence[documentType];
  if (evidence === undefined) {
    return [
      gap("assembly", "assembly-evidence-missing", `缺少${label}的实际装配证据`, {
        documentType,
      }),
    ];
  }
  if (evidence !== employee.currentDocuments[documentType]) {
    return [
      gap(
        "assembly",
        "assembly-evidence-stale",
        `${label}的装配证据指向旧版本，当前版本未被实际装配`,
        {
          documentType,
        },
      ),
    ];
  }
  return [];
}

/**
 * 完整入职判定（ORG-03）。返回 ready 与所依据的任职/代际，
 * 或逐项具体的缺项清单（SOLO-ACC-04 outcome：非泛化失败）。
 */
export function evaluateOnboarding(
  employeeId: SoloipsEmployeeId,
  read: SoloipsOnboardingReadModel,
): SoloipsOnboardingStatus {
  const gaps: SoloipsOnboardingGap[] = [];

  const employee = read.getEmployee(employeeId);
  if (employee === undefined) {
    return {
      ready: false,
      gaps: [gap("employee", "employee-not-found", `员工 ${employeeId} 不存在`)],
    };
  }

  const appointments = read.listAppointmentsByEmployee(employeeId);
  const appointment = currentAppointment(appointments);
  if (appointment === undefined) {
    gaps.push(
      appointments.length === 0
        ? gap("appointment", "appointment-missing", "尚无任职记录")
        : gap("appointment", "appointment-revoked", "全部任职均已撤销，无当前有效任职"),
    );
  }

  for (const documentType of REQUIRED_DOCUMENT_TYPES) {
    gaps.push(...documentGaps(employee, documentType, read));
    gaps.push(...assemblyGaps(employee, documentType));
  }

  if (!employee.memoryInitialized) {
    gaps.push(gap("memory", "memory-not-initialized", "记忆尚未初始化（初始记忆允许为空集合）"));
  }

  if (appointment !== undefined) {
    const verified = new Set(employee.verifiedCapabilities);
    for (const capability of appointment.requiredCapabilities) {
      if (!verified.has(capability)) {
        gaps.push(
          gap(
            "capability",
            "capability-not-verified",
            `岗位必需能力「${capability}」未通过最小验证`,
            {
              capability,
            },
          ),
        );
      }
    }
  }

  if (gaps.length > 0 || appointment === undefined) {
    return { ready: false, gaps };
  }
  return {
    ready: true,
    employeeId,
    appointmentId: appointment.id,
    generation: appointment.generation,
  };
}
