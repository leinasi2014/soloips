/**
 * 内容摘要：FNV-1a 64 位（非密码学）。
 *
 * 用途仅是持久读回核对——「重载须读回同一版本/摘要」（02-company-contract §11.1）
 * 与准入判定对当前文档的内容一致性复核（ORG-03「文件实际保存、所有权/版本读回」）。
 * 它不是安全哈希：不用于凭据、不抵御故意碰撞；需要密码学强度时另行引入并声明。
 *
 * 实现为同步纯函数（无 Node API 依赖），使领域逻辑可在任意 JS 宿主下测试。
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function soloipsDigestOf(content: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= BigInt(content.charCodeAt(index));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return `fnv1a64_${hash.toString(16).padStart(16, "0")}`;
}
