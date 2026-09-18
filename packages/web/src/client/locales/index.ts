/**
 * SOLOIPS-WEB-I18N-DICTIONARIES
 *
 * `soloips` 命名空间的字典汇总入口：`zh`（键集真源）、`en`（按真源检查完备）
 * 与键联合类型 `SoloipsLocaleKey`。
 *
 * 用途与边界：
 *  - 本入口**只导出数据与类型**（纯 `Record<string, string>`），不 import 任何
 *    运行时依赖——注册动作（`ctx.locale.register('soloips', { zh, en })`）属
 *    浏览器半边的接线切片（i18n-2），本切片不触碰 `src/client/index.ts`。
 *  - 本目录是**唯一允许含译文的源文件**（设计 §6「字典位置」；底册 §5.5 的零硬编码
 *    门禁据此排除本目录）。
 *
 * 〔待决〕命名空间经 `declare module '@deepseek-ai/dsh-client-ui-slots'` 合并进
 * `LocaleNamespaceMap` 后，框架注入的 `t` seat 才会按键联合校验（设计 §6
 * 「类型强制」）。该增强语句需要 `@deepseek-ai/dsh-client-ui-slots` 的类型面，
 * 而本仓当前依赖集**不含**该包——故类型增强随注册接线（i18n-2）一并落地。
 * 在此之前，`SoloipsLocaleKey` 是唯一可用的键域，映射表（`../i18n/*.ts`）以
 * `satisfies SoloipsLocaleKey` 钉住取值。
 */

export { zh, type SoloipsLocaleKey } from "./zh.js";
export { en } from "./en.js";

/**
 * `soloips` 字典的命名空间名（设计 §6「命名空间」：单命名空间、不拆多个）。
 *
 * 与键前缀的关系：键名**本身**带 `soloips.` 前缀（PRD §3.4.2 的既有键名建议
 * 就是全限定形），故注册与消费两侧都不需要再拼前缀——本常量只是给接线切片
 * （i18n-2）一个可引用的稳定名字，避免字面量散落。
 */
export const SOLOIPS_LOCALE_NAMESPACE = "soloips";
