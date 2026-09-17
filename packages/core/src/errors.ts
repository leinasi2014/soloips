/**
 * soloips-core 的结构化失败。`message` 是诊断文本，`code` 才是稳定契约
 * （DEV-06：错误通过稳定错误码与可行动说明传递，包装保留去敏后的原因）。
 */

import type { SoloipsCoreErrorCode } from "./contracts.js";

export class SoloipsCoreError extends Error {
  override readonly name = "SoloipsCoreError";

  constructor(
    readonly code: SoloipsCoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** 读取 adapter 侧错误的稳定码（结构判别，不 import adapter 运行时）。 */
export function soloipsAdapterErrorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { readonly code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * 把 `SoloipsWriterLease.assertHeld()` 的失败翻译为 core 的稳定码：
 * 失权（adapter 码 SOLOIPS_ADAPTER_LEASE_NOT_HELD）与状态未知分别可判定
 * （SOLO-FENCE-01 §4：失权与锁状态未知都拒绝写入并保留诊断）。
 */
export function wrapLeaseFailure(context: string, error: unknown): SoloipsCoreError {
  const code: SoloipsCoreErrorCode =
    soloipsAdapterErrorCodeOf(error) === "SOLOIPS_ADAPTER_LEASE_NOT_HELD"
      ? "SOLOIPS_CORE_LEASE_NOT_HELD"
      : "SOLOIPS_CORE_LEASE_CHECK_FAILED";
  return new SoloipsCoreError(code, `${context}：写权复核失败，本次发布被拒绝`, { cause: error });
}
