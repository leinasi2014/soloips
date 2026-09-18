#!/usr/bin/env node
/**
 * 零硬编码文案门禁（`SOLO-I18N-01` §6「零硬编码门禁」；本仓**首个**等价物）。
 *
 * 为什么需要它：设计 §6 登记的事实是——`pnpm run verify-client-ui-i18n` 存在于
 * **DSH fork**（`deepseek-harness/scripts/verify-client-ui-i18n.ts`），本仓
 * `package.json` **没有**该脚本（2026-09-18 实测）。UI 设计稿与底册引用「仓库有
 * 自动化门禁」时指的是 fork 的那一份；在本仓接线之前，「零硬编码」是**不可验证**
 * 的声明。本脚本把「界面文案只能来自字典」变成可执行的检查。
 *
 * 检测面（与设计 §6「门禁的触发面」逐条对应）：
 *  1. **JSX 文本**——`<div>你好</div>` 里的字面文本；
 *  2. **携带文案的属性**——`alt`/`aria-label`/`placeholder`/`title`/`label`/
 *     `description` 等（属性名清单移植自 fork 的 `COPY_ATTRIBUTES` 与其后缀规则，
 *     含 `cancelLabel`/`truncatedLabel` 这类自定义命名）；
 *  3. **喂给上述两类的表达式**——模板串、拼接、三元、数组、对象字面量
 *     （`{ title: '…' }`）、变量声明与返回语句中命中文案命名的那些。
 *
 * 允许有译文的源文件：**只有** `src/client/locales/` 目录（设计 §6「字典位置」；
 * 底册 §5.5「locale 字典文件是唯一允许拥有译文的源文件」）。本脚本在**发现阶段**
 * 就把该目录排除，并额外在检测函数里保留一层同义守卫（防御性：直接传入字典路径
 * 也不会被误报）。
 *
 * 〔与 fork 脚本的差异，刻意如此〕
 *  - **不移植 desktop 分支**（`textContent`/`innerText` 赋值、`setTitle`/`prompt`
 *    实参）：那些只对 fork 的 `apps/desktop/**` 生效，本仓无该目录。
 *  - **排除规则更窄**：fork 还排除 basename 为 `locale.ts`/`locales.ts` 的文件
 *    （任何目录下）。本仓只排除 `locales/` **目录**——少一个可被利用的豁免口
 *    （把文案藏进别处的 `locale.ts` 在 fork 口径下不会被检查）。
 *  - **最小文件数守卫取本仓实际规模**（见 `MINIMUM_SCANNED_CLIENT_SOURCES`）。
 *
 * 退出状态：0 = 扫描面内无硬编码文案；1 = 有违规，或扫描面被误缩到下限以下
 * （「假绿」防护：扫描面为空时**必须**失败，不得报告「0 违规」）。
 *
 * 证据边界：**通过只代表「本次扫描的源文件里没有命中检测规则的硬编码文案」**。
 * 它不证明界面文案齐全、不证明字典键被正确消费（那属渲染层测试），也不覆盖
 * `.css`/`.json`/模板文件中的文本。反例见
 * `packages/web/tests/i18n-assets.spec.ts` 的「鉴别力」用例。
 *
 * 用法：
 *   node scripts/development/verify-client-ui-i18n.mjs [--root <dir>]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** 默认扫描根：web 浏览器半边的源码树（设计 §6「门禁的触发面」）。 */
const DEFAULT_SCAN_ROOT = join(repoRoot, "packages", "web", "src", "client");

/**
 * 扫描面下限（防「假绿」）。
 *
 * 取值 **2** = 本片（i18n-1）引入门禁时 `src/client/**`（不含 `locales/`）的
 * 实际可扫描文件数（`i18n/error-codes.ts` + `i18n/onboarding-gaps.ts`）。
 *
 * 〔理由〕本值**不是**「客户端只有两个文件」的声明，而是「扫描面不得被误缩成
 * 空集/近空集」的守卫——最典型的故障是把排除名单写宽（例如把 `i18n/` 也当
 * 「非界面代码」排除）或把扫描根指错，此时脚本会安静地报告「0 违规」。
 * 新增客户端文件**不必**抬高本值；**减少**到本值以下即失败（`--root` 指向
 * 测试用临时树时同样适用，故反例测试必须连同真实文件一起复制，见测试注释）。
 */
const MINIMUM_SCANNED_CLIENT_SOURCES = 2;

/** 携带文案的属性名（精确清单，移植自 fork 的 `COPY_ATTRIBUTES`）。 */
const COPY_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-valuetext",
  "cancelLabel",
  "closeLabel",
  "confirmLabel",
  "copyLabel",
  "description",
  "emptyLabel",
  "label",
  "placeholder",
  "title",
  "truncatedLabel",
]);

/** 自定义文案属性的命名后缀（如 `submitTitle`/`hintText`）。 */
const COPY_ATTRIBUTE_SUFFIX =
  /(?:Aria|Copy|Description|Heading|Label|Message|Placeholder|Summary|Text|Title|Tooltip)$/;

/** 变量/属性/函数名命中即视为「这个名字拥有文案」的命名规则。 */
const COPY_NAME =
  /(?:^|_)(?:aria|copy|description|empty|heading|label|message|placeholder|summary|text|title|tooltip)(?:s|_.*)?$/i;
const COPY_SUFFIX =
  /(?:aria|copy|description|empty|heading|label|labels|message|placeholder|summary|text|title|tooltip|tabs)$/i;

/** 语言无关记号：这些字面量即使命中命名规则也不构成「产品文案」。 */
const IMMUTABLE_LANGUAGE_TOKENS = new Set([
  "B",
  "Function",
  "GB",
  "K",
  "KB",
  "M",
  "MB",
  "Symbol",
  "false",
  "function()",
  "n",
  "null",
  "true",
  "undefined",
]);

/** 形如 i18n 键的字符串（`soloips.error.configInvalid`）不是产品文案。 */
const LOCALE_KEY = /^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/;

/**
 * 一处硬编码文案。
 *
 * @typedef {{ column: number, file: string, line: number, reason: string, text: string }} UiI18nViolation
 */

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { root: DEFAULT_SCAN_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--root") {
      const value = argv[index + 1];
      if (value === undefined) fail("--root 需要一个目录参数");
      options.root = resolve(value);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write("usage: verify-client-ui-i18n.mjs [--root <dir>]\n");
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/** 路径是否为字典文件（`locales/` 目录下；防御性守卫，见文件头）。 */
function localeOwner(file) {
  const normalized = file.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return segments.includes("locales");
}

/**
 * 递归发现扫描面内的 `.ts`/`.tsx` 源文件。
 *
 * 排除：`locales/` 目录（字典是唯一允许有译文的源文件）、`*.d.ts`（无运行时
 * 文案）、`node_modules`/`lib`/`dist`（非源树）。返回**排序后**的相对路径，
 * 使输出顺序稳定、可复现。
 */
function discoverSources(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      if (entry === "node_modules" || entry === "lib" || entry === "dist") continue;
      if (entry === "locales") continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
        found.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  };
  walk(root);
  return found.sort();
}

function containsProductText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return (
    normalized !== "" &&
    !IMMUTABLE_LANGUAGE_TOKENS.has(normalized) &&
    !LOCALE_KEY.test(normalized) &&
    /\p{L}/u.test(normalized)
  );
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

/** 属性名是否「携带文案」（`…Key` 结尾的除外：那是键名，不是文案）。 */
function copyAttribute(name) {
  return !name.endsWith("Key") && (COPY_ATTRIBUTES.has(name) || COPY_ATTRIBUTE_SUFFIX.test(name));
}

function compactText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

/** 是否像自然语言（有空白或 CJK，或以大写字母开头）——用于收紧字符串返回值判定。 */
function looksLikeNaturalText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return /\s|[\u3400-\u9fff]/u.test(normalized) || /^[A-Z]/.test(normalized);
}

/**
 * 检测单个源文件里的硬编码文案。
 *
 * @param {string} file - 诊断用的仓库相对路径。
 * @param {string} sourceText - 源码文本（TS 或 TSX）。
 * @returns {UiI18nViolation[]} 按源码位置排序的违规项。
 */
export function findUiI18nViolations(file, sourceText) {
  if (localeOwner(file)) return [];
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = new Map();

  const report = (node, text, reason, naturalOnly = false) => {
    if (
      !containsProductText(text) ||
      (naturalOnly && !looksLikeNaturalText(text)) ||
      violations.has(node.getStart(source))
    ) {
      return;
    }
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.set(node.getStart(source), {
      column: position.character + 1,
      file,
      line: position.line + 1,
      reason,
      text: compactText(text),
    });
  };

  const collectExpression = (node, reason, naturalOnly = false) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, node.text, reason, naturalOnly);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      report(
        node,
        [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(""),
        reason,
        naturalOnly,
      );
      return;
    }
    if (ts.isCallExpression(node)) {
      // 调用结果是动态值；携带文案的实参经各自的语法位置单独访问。
      return;
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      collectExpression(node.expression, reason, naturalOnly);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      collectExpression(node.whenTrue, reason, naturalOnly);
      collectExpression(node.whenFalse, reason, naturalOnly);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        collectExpression(node.right, reason, naturalOnly);
      } else if (
        node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        collectExpression(node.left, reason, naturalOnly);
        collectExpression(node.right, reason, naturalOnly);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isExpression(element)) collectExpression(element, reason, naturalOnly);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = propertyName(property.name);
        const propertyOwnsCopy =
          name !== undefined && (COPY_NAME.test(name) || COPY_SUFFIX.test(name));
        collectExpression(property.initializer, reason, naturalOnly || !propertyOwnsCopy);
      }
    }
  };

  const enclosingFunctionName = (node) => {
    let current = node.parent;
    while (!ts.isSourceFile(current)) {
      if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
        return current.name === undefined ? undefined : propertyName(current.name);
      }
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        const parent = current.parent;
        return ts.isVariableDeclaration(parent) ? propertyName(parent.name) : undefined;
      }
      current = current.parent;
    }
    return undefined;
  };

  const hasExplicitStringReturn = (node) => {
    let current = node.parent;
    while (!ts.isSourceFile(current)) {
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isArrowFunction(current) ||
        ts.isFunctionExpression(current)
      ) {
        return current.type?.kind === ts.SyntaxKind.StringKeyword;
      }
      current = current.parent;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text, "JSX text");

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (copyAttribute(name) && node.initializer !== undefined) {
        if (ts.isStringLiteral(node.initializer)) {
          report(node.initializer, node.initializer.text, `${name} attribute`);
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression !== undefined
        ) {
          collectExpression(node.initializer.expression, `${name} attribute`);
        }
      }
    }

    if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      collectExpression(node.expression, "JSX child");
    }

    if (file.endsWith(".tsx") && ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name !== undefined && (COPY_NAME.test(name) || COPY_SUFFIX.test(name))) {
        collectExpression(node.initializer, `${name} property`);
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const name = propertyName(node.name);
      if (name !== undefined && (COPY_NAME.test(name) || COPY_SUFFIX.test(name))) {
        collectExpression(node.initializer, `${name} value`);
      }
    }

    if (ts.isBindingElement(node) && node.initializer !== undefined) {
      const name = propertyName(node.name);
      if (name !== undefined && (COPY_NAME.test(name) || COPY_SUFFIX.test(name))) {
        collectExpression(node.initializer, `${name} default value`);
      }
    }

    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      const name = enclosingFunctionName(node);
      if (name !== undefined && (COPY_NAME.test(name) || COPY_SUFFIX.test(name))) {
        collectExpression(node.expression, `${name} return value`);
      } else if (file.endsWith(".tsx") && hasExplicitStringReturn(node)) {
        collectExpression(node.expression, "string return value", true);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...violations.values()].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
}

/** 诊断用路径：仓库内用仓库相对路径，仓库外（`--root` 临时树）用绝对路径。 */
function displayPath(root, file) {
  const absolute = resolve(root, file);
  const rel = relative(repoRoot, absolute);
  return rel.startsWith("..") || isAbsolute(rel)
    ? absolute.replaceAll("\\", "/")
    : rel.replaceAll("\\", "/");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!statSync(options.root, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`扫描根不存在或不是目录：${options.root}`);
  }
  const files = discoverSources(options.root);
  if (files.length < MINIMUM_SCANNED_CLIENT_SOURCES) {
    fail(
      `verify-client-ui-i18n: 扫描面被缩到 ${String(files.length)} 个源文件，` +
        `低于下限 ${String(MINIMUM_SCANNED_CLIENT_SOURCES)}（扫描根 ${options.root}）。` +
        "扫描面为空/近空时不得报告「0 违规」——请检查排除名单与扫描根。",
    );
  }
  const violations = files.flatMap((file) =>
    findUiI18nViolations(file, readFileSync(join(options.root, file), "utf8")),
  );
  if (violations.length > 0) {
    process.stderr.write(
      `verify-client-ui-i18n: ${String(violations.length)} 处硬编码界面文案：\n`,
    );
    for (const violation of violations) {
      process.stderr.write(
        `  ${displayPath(options.root, violation.file)}:${String(violation.line)}:` +
          `${String(violation.column)} ${violation.reason}: ${JSON.stringify(violation.text)}\n`,
      );
    }
    process.stderr.write(
      "界面文案必须来自 `soloips` 字典（`src/client/locales/`），经映射表按键查得；\n" +
        "不得直接嵌在源码里（SOLO-I18N-01 §6；底册 §5.5）。\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `verify-client-ui-i18n: ${String(files.length)} 个客户端源文件的文案均由字典拥有` +
      `（扫描根 ${options.root.replaceAll("\\", "/")}；字典目录除外）。\n`,
  );
}

if (import.meta.filename === resolve(process.argv[1] ?? "")) main();
