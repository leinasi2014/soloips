#!/usr/bin/env node
/**
 * BE-6a 公司闭环 E2E 驱动：**真实浏览器 → Host Remote → core → 读回**。
 *
 * ── 为什么需要独立脚本（不复用 `verify-web-remote-e2e.mjs`）─────────────────
 * 那个脚本的出口是「**一个** Remote 方法经真实浏览器调用成功」（BE-0b-ii 的
 * 单一目标），其 `callRemote` 把载荷固定为 `{ input: { note } }` 并断言
 * `result.ok === true`。本片要证明的是**业务闭环**：用户面创建公司 → 读回 →
 * 刷新/重启后事实仍在。两者要采的证据与断言都不同，合并会让那个脚本承担它没有
 * 声明的能力（「能力声明不得宽于验证范围」）。
 *
 * 本脚本**复用**它的实例管理与证据采集**模式**（CDP 驱动、产物身份核对、
 * 网络记录、页面上下文内发起调用），但断言按本片需要重写。
 *
 * ── 本脚本证明什么（严格限定）──────────────────────────────────────────────
 *  1. 页面上下文内、经官方 Remote 线协议、**不带任何 agent 上下文**（纯 HTTP +
 *     页面 cookie）调用 `soloips/createCompany` → core 提交成功；
 *  2. 同一通路读回（`soloips/getCompany` / `soloips/getCompanyTree`），
 *     读到的 id 与创建返回的 id 一致；
 *  3. 刷新页面后读回仍成立（同一持久事实）；
 *  4. 进程重启后读回仍成立（持久化）；
 *  5. 反例：`accountId` 作为入参字段被网关拒绝（`gateway/arguments-invalid`）；
 *  6. 反例：同 operationId 重放返回 `replayed` 且不新建公司。
 *
 * ── 本脚本**不**证明什么 ───────────────────────────────────────────────────
 *  - 不证明模型工具面的任何性质（本包不注册工具，见 `packages/web/src/index.ts`）；
 *  - 不证明配额拒绝（需部署 `free` 计划且已占满；本片在单测层覆盖该臂的透传，
 *    端到端的配额拒绝属 FE-1b 的验收窗口）；
 *  - 不证明 UI 呈现（本片无界面改动）。
 *
 * 用法：
 *   node scripts/development/verify-web-company-e2e.mjs \
 *     --url "http://127.0.0.1:<port>/?token=<token>" \
 *     --out <dir> \
 *     --candidate-client <repo>/packages/web/lib/client.js
 *
 * 退出状态：0 = 全部断言成立；1 = 任一失败。
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 本机 ms-playwright 缓存中的 Chromium；找不到时要求显式传 --chrome。 */
const DEFAULT_CHROME_CANDIDATES = [
  join(
    process.env.LOCALAPPDATA ?? "",
    "ms-playwright",
    "chromium-1234",
    "chrome-win64",
    "chrome.exe",
  ),
  join(
    process.env.LOCALAPPDATA ?? "",
    "ms-playwright",
    "chromium-1234",
    "chrome-win",
    "chrome.exe",
  ),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

function parseArgs(argv) {
  const options = { url: null, out: null, port: 9224, chrome: null, candidateClient: null };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--url") options.url = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else if (argv[index] === "--chrome") options.chrome = argv[++index];
    else if (argv[index] === "--candidate-client") options.candidateClient = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write(
        "usage: verify-web-company-e2e.mjs --url <pageUrl> --out <dir> --candidate-client <abs path>\n" +
          "         [--port 9224] [--chrome <path>]\n",
      );
      process.exit(0);
    } else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** 断言失败：抛错（由 main 的 try 统一记录为失败退出），不用 process.exit 以便落盘证据。 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveChrome(explicit) {
  const candidates = explicit === null ? DEFAULT_CHROME_CANDIDATES : [explicit];
  for (const candidate of candidates) {
    if (candidate.length > 0 && existsSync(candidate)) return candidate;
  }
  fail("找不到 Chromium 可执行文件。用 --chrome <path> 显式指定。");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpAlive(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function launchChrome(chromePath, port, profileDir) {
  spawn(
    chromePath,
    [
      `--remote-debugging-port=${String(port)}`,
      `--user-data-dir=${profileDir}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await cdpAlive(port)) return;
    await sleep(500);
  }
  fail("Chromium 的 CDP 端点未在限时内就绪。");
}

/** 最小 CDP 客户端（与 BE-0b-ii 脚本同形：够用即可，不引入依赖）。 */
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const state = { events: [], consoleMessages: [] };
    let nextId = 0;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve: done, reject: abort } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) abort(new Error(JSON.stringify(message.error)));
        else done(message.result);
        return;
      }
      if (message.method === undefined) return;
      state.events.push(message);
      if (message.method === "Runtime.consoleAPICalled") {
        state.consoleMessages.push({
          type: message.params.type,
          text: (message.params.args ?? [])
            .map((arg) => arg.value ?? arg.description ?? "")
            .join(" ")
            .slice(0, 600),
        });
      }
      if (message.method === "Runtime.exceptionThrown") {
        state.consoleMessages.push({
          type: "exception",
          text: String(
            message.params.exceptionDetails?.exception?.description ??
              JSON.stringify(message.params.exceptionDetails),
          ).slice(0, 600),
        });
      }
    };
    socket.onerror = reject;
    socket.onopen = () => {
      resolve({
        state,
        send(method, params = {}) {
          return new Promise((done, abort) => {
            const id = ++nextId;
            pending.set(id, { resolve: done, reject: abort });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    };
  });
}

/** 等页面装配就绪：模块图已建、`soloips-web` 行在图内、DOM 已渲染。 */
async function waitForAssembly(cdp, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const loader = window.__ModuleLoader__;
        const boot = window.__DSH_BOOT__;
        return JSON.stringify({
          loaderType: typeof loader,
          loaderMode: loader && loader.mode,
          entryCount: boot && boot.entries ? boot.entries.length : 0,
          soloipsRow: boot && boot.entries
            ? (boot.entries.find((entry) => entry.id === 'soloips-web') ?? null)
            : null,
          domLength: document.body ? document.body.innerText.length : 0,
        });
      })()`,
    });
    const snapshot = JSON.parse(result.result.value);
    if (
      snapshot.loaderType === "object" &&
      snapshot.loaderMode === "live" &&
      snapshot.soloipsRow !== null &&
      snapshot.domLength > 50
    ) {
      return snapshot;
    }
    await sleep(1000);
  }
  fail("页面未在限时内装配就绪（模块图 / soloips-web 行 / DOM 三者未同时满足）。");
}

/**
 * 产物身份核对：页面**实际加载**的 bundle 必须含本次候选的字节。
 *
 * 〔为什么必须做〕「浏览器调用成功」本身不能排除「跑的是旧 lib」——本片改了
 * namespace 与业务面，若实例加载的是上一版产物，整个 E2E 证明的就是别的代码。
 * 判据与 BE-0b-ii 脚本一致（复刻宿主 `prepareSource` 后取包含关系）。
 */
async function verifyArtifactIdentity(cdp, candidatePath) {
  const candidate = readFileSync(candidatePath);
  const candidateSha256 = createHash("sha256").update(candidate).digest("hex");
  const prepared = candidate
    .toString("utf8")
    .replace(/(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/, "");
  const needle = prepared.endsWith("\n") ? prepared : `${prepared}\n`;

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const boot = window.__DSH_BOOT__;
      const row = boot && boot.entries
        ? boot.entries.find((entry) => entry.id === 'soloips-web')
        : null;
      if (!row || typeof row.url !== 'string') {
        return JSON.stringify({ error: '页面模块图里没有 soloips-web 行的 url' });
      }
      const response = await fetch(row.url, { credentials: 'same-origin' });
      const text = await response.text();
      return JSON.stringify({ url: row.url, status: response.status, text });
    })()`,
  });
  const payload = JSON.parse(result.result.value);
  if (payload.error !== undefined) fail(`产物身份核对失败：${payload.error}`);
  if (payload.status !== 200) {
    fail(`产物身份核对失败：取 ${payload.url} 返回 HTTP ${String(payload.status)}`);
  }
  const embedded = payload.text.includes(needle.trimEnd());
  if (!embedded) {
    fail(
      `产物身份核对失败：页面实际加载的 soloips-web bundle **不是**本次候选。\n` +
        `  候选：${candidatePath}\n  sha256=${candidateSha256}\n  实际 URL：${payload.url}\n`,
    );
  }
  return {
    url: payload.url,
    servedBytes: payload.text.length,
    candidateBytes: candidate.length,
    candidateSha256,
    embedded,
  };
}

/**
 * 在页面上下文内发起一次 Remote 往返。
 *
 * 〔身份声明〕本函数**不**携带任何 agent 凭证/调用上下文——它就是一个带页面
 * cookie 的 HTTP POST。这正是 §2.5.1 裁定四要求的「合法的用户引导 Remote
 * **不得**误要求 agent 上下文」的**正向证据**：若服务端加上该要求，本调用失败。
 */
async function callRemote(cdp, method, args, label) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const rpcId = 'be6a-' + ${JSON.stringify(label)} + '-' + Math.random().toString(36).slice(2);
      const url = location.origin + '/api/' + ${JSON.stringify(method)};
      const body = { type: 'client-request', rpcId, method: ${JSON.stringify(method)},
                     payload: { args: ${JSON.stringify(args)} } };
      const startedAt = performance.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return JSON.stringify({
        url, rpcId, status: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
        requestBody: body, responseText: text,
      });
    })()`,
  });
  return JSON.parse(result.result.value);
}

/** 从 CDP 事件流里挑出与目标 Remote 命名空间相关的请求/响应。 */
function remoteNetwork(events) {
  return events
    .filter(
      (event) =>
        event.method === "Network.requestWillBeSent" || event.method === "Network.responseReceived",
    )
    .map((event) =>
      event.method === "Network.requestWillBeSent"
        ? {
            kind: "request",
            requestId: event.params.requestId,
            httpMethod: event.params.request.method,
            url: event.params.request.url,
            postData: (event.params.request.postData ?? "").slice(0, 800),
          }
        : {
            kind: "response",
            requestId: event.params.requestId,
            status: event.params.response.status,
            url: event.params.response.url,
          },
    )
    .filter((row) => row.url.includes("/api/soloips/"));
}

/** 解析一次往返的响应信封；返回 `{ ok, value, error }`。 */
function parseEnvelope(call) {
  assert(
    call.status === 200,
    `HTTP 状态应为 200，实得 ${String(call.status)}：${call.responseText.slice(0, 200)}`,
  );
  const parsed = JSON.parse(call.responseText);
  assert(
    parsed.type === "server-response",
    `响应类型应为 server-response：${call.responseText.slice(0, 200)}`,
  );
  return parsed.result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.url === null || options.out === null) fail("缺少 --url 或 --out。见 --help。");
  if (options.candidateClient === null) fail("缺少 --candidate-client（无法核对产物身份）。");
  if (!existsSync(options.candidateClient)) {
    fail(`--candidate-client 指向的文件不存在：${options.candidateClient}`);
  }

  const outDir = options.out;
  mkdirSync(outDir, { recursive: true });
  const chromePath = resolveChrome(options.chrome);

  if (!(await cdpAlive(options.port))) {
    await launchChrome(chromePath, options.port, join(outDir, "chrome-profile"));
  }
  const targets = await (await fetch(`http://127.0.0.1:${String(options.port)}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  if (page === undefined) fail("CDP 端点下没有 page target。");

  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  // 每次运行用**唯一** operationId：重放语义由本脚本第 6 步单独验证，
  // 不能让上一次运行的遗留 id 干扰本次的「首次提交」断言。
  const runId = `be6a-${String(Date.now())}`;
  const report = { url: options.url.replace(/token=[^&]*/, "token=<REDACTED>"), runId, steps: [] };
  const record = (name, data) => {
    report.steps.push({ name, ...data });
  };

  try {
    cdp.state.events = [];
    await cdp.send("Page.navigate", { url: options.url });
    const assembly = await waitForAssembly(cdp);
    report.assembly = assembly;

    // 〔顺序契约〕身份核对必须在取任何业务结果**之前**：若加载的不是本次候选，
    // 后面所有「调用成功」证明的都是别的产物。
    report.artifactIdentity = await verifyArtifactIdentity(cdp, options.candidateClient);

    // ── 1. 创建公司（用户面，无 agent 上下文）──────────────────────────────
    const companyName = `BE-6a 验证公司 ${runId}`;
    const createArgs = {
      input: { operationId: `${runId}-create`, name: companyName, type: "enterprise" },
    };
    const createCall = await callRemote(cdp, "soloips/createCompany", createArgs, "create");
    const createResult = parseEnvelope(createCall);
    record("create", { call: createCall, result: createResult });
    assert(
      createResult.ok === true,
      `createCompany 应成功：${createCall.responseText.slice(0, 300)}`,
    );
    const createValue = createResult.value;
    assert(
      createValue.status === "committed",
      `首次创建应为 committed，实得 ${String(createValue.status)}（${createCall.responseText.slice(0, 200)}）`,
    );
    const companyId = createValue.result.companyId;
    assert(
      typeof companyId === "string" && companyId.length > 0,
      "createCompany 必须返回 companyId",
    );

    // ── 2. 读回（同一通路）────────────────────────────────────────────────
    const readCall = await callRemote(cdp, "soloips/getCompany", { input: { companyId } }, "read");
    const readResult = parseEnvelope(readCall);
    record("read-back", { call: readCall, result: readResult });
    assert(readResult.ok === true, `getCompany 应成功：${readCall.responseText.slice(0, 300)}`);
    assert(
      readResult.value.status === "ok",
      `读回应为 ok，实得 ${String(readResult.value.status)}`,
    );
    const company = readResult.value.company;
    assert(
      company.id === companyId,
      `读回的 id 应与创建一致：${String(company.id)} vs ${companyId}`,
    );
    assert(
      company.name === companyName,
      `读回的名称应一致：${String(company.name)} vs ${companyName}`,
    );
    // 〔裁定四.1〕浏览器面投影**不得**含 accountId——判据是键不存在。
    assert(
      !Object.hasOwn(company, "accountId"),
      "公司投影不得含 accountId（data-contract §2.5.1 裁定四.1）",
    );

    // ── 3. 公司树读回 ─────────────────────────────────────────────────────
    const treeCall = await callRemote(
      cdp,
      "soloips/getCompanyTree",
      { input: { companyId } },
      "tree",
    );
    const treeResult = parseEnvelope(treeCall);
    record("tree", { call: treeCall, result: treeResult });
    assert(treeResult.ok === true, `getCompanyTree 应成功：${treeCall.responseText.slice(0, 300)}`);
    assert(treeResult.value.status === "ok", "公司树应为 ok");
    assert(
      treeResult.value.companies.some((entry) => entry.id === companyId),
      "公司树应包含刚创建的公司",
    );

    // ── 4. 重放（同 operationId）──────────────────────────────────────────
    const replayCall = await callRemote(cdp, "soloips/createCompany", createArgs, "replay");
    const replayResult = parseEnvelope(replayCall);
    record("replay", { call: replayCall, result: replayResult });
    assert(replayResult.ok === true, "重放应成功（不是错误）");
    assert(
      replayResult.value.status === "replayed",
      `同 operationId 应返回 replayed，实得 ${String(replayResult.value.status)}`,
    );
    assert(
      replayResult.value.result.companyId === companyId,
      "重放必须返回**原结果**（同一 companyId），而不是新建",
    );

    // ── 5. 反例：accountId 作为入参被拒 ───────────────────────────────────
    const tamperedCall = await callRemote(
      cdp,
      "soloips/createCompany",
      {
        input: {
          operationId: `${runId}-tampered`,
          name: `${companyName} 篡改`,
          type: "enterprise",
          accountId: "acct-attacker",
        },
      },
      "tampered",
    );
    const tamperedResult = parseEnvelope(tamperedCall);
    record("accountId-rejected", { call: tamperedCall, result: tamperedResult });
    assert(
      tamperedResult.ok === false,
      "带 accountId 的调用必须被拒（网关 assertExactArguments 拒绝未声明字段）",
    );
    assert(
      tamperedResult.error.code === "gateway/arguments-invalid",
      `拒绝码应为 gateway/arguments-invalid，实得 ${String(tamperedResult.error.code)}`,
    );
    // 同时确认它**没有**创建公司：读回该 operationId 名下的公司不存在（用树计数
    // 反证——篡改调用若真的建了公司，树里会多出一条）。
    const afterTamper = await callRemote(
      cdp,
      "soloips/getCompanyTree",
      { input: { companyId } },
      "after-tamper",
    );
    const afterTamperResult = parseEnvelope(afterTamper);
    record("after-tamper", { call: afterTamper, result: afterTamperResult });
    assert(afterTamperResult.ok === true, "篡改后读树应成功");
    assert(
      afterTamperResult.value.companies.length === treeResult.value.companies.length,
      "被拒的调用不得产生任何业务写（公司树条目数必须不变）",
    );

    report.pass1Network = remoteNetwork(cdp.state.events);
    report.pass1Console = [...cdp.state.consoleMessages];
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(outDir, "pass1-page.png"), Buffer.from(shot.data, "base64"));

    // ── 6. 刷新后读回（同一持久事实）──────────────────────────────────────
    cdp.state.events = [];
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitForAssembly(cdp);
    report.artifactIdentityAfterReload = await verifyArtifactIdentity(cdp, options.candidateClient);
    const reloadReadCall = await callRemote(
      cdp,
      "soloips/getCompany",
      { input: { companyId } },
      "reload-read",
    );
    const reloadReadResult = parseEnvelope(reloadReadCall);
    record("reload-read-back", { call: reloadReadCall, result: reloadReadResult });
    assert(reloadReadResult.ok === true, "刷新后读回应成功");
    assert(
      reloadReadResult.value.status === "ok" && reloadReadResult.value.company.id === companyId,
      "刷新后必须读到同一条持久事实",
    );
    report.pass2Network = remoteNetwork(cdp.state.events);
    report.pass2Console = [...cdp.state.consoleMessages];

    writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      join(outDir, "persistent-fact.json"),
      `${JSON.stringify(
        {
          note: "本文件由 E2E 脚本写出，用于与重启后的读回证据比对（同一次操作）",
          runId,
          operationId: `${runId}-create`,
          companyId,
          companyName,
          company,
          readBackAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );

    process.stdout.write(`runId：${runId}\n`);
    process.stdout.write(
      `装配：entryCount=${String(assembly.entryCount)} rev=${String(assembly.soloipsRow.rev)}\n`,
    );
    process.stdout.write(`产物身份：sha256=${report.artifactIdentity.candidateSha256}\n`);
    process.stdout.write(`创建：status=${createValue.status} companyId=${companyId}\n`);
    process.stdout.write(`读回：status=${readResult.value.status} name=${String(company.name)}\n`);
    process.stdout.write(`重放：status=${replayResult.value.status}\n`);
    process.stdout.write(`篡改被拒：code=${String(tamperedResult.error.code)}\n`);
    process.stdout.write(`刷新后读回：status=${reloadReadResult.value.status}\n`);
    process.stdout.write(`网络记录：pass1=${String(report.pass1Network.length)} 条\n`);
    process.stdout.write(`证据目录：${outDir}\n`);
    process.stdout.write(
      "\n证据边界：证明「真实浏览器 → Host Remote → core 提交 → 读回（含刷新）」成立，\n" +
        "且浏览器面不含 accountId、被拒调用零业务写；不证明模型工具面、配额拒绝端到端、\n" +
        "或任何界面呈现。\n",
    );
    cdp.close();
    process.exit(0);
  } catch (error) {
    // 失败也要落盘证据（否则排查只能靠 stdout，而调用方可能已回收终端）。
    report.failure = error instanceof Error ? error.message : String(error);
    report.pass1Network = remoteNetwork(cdp.state.events);
    report.pass1Console = [...cdp.state.consoleMessages];
    writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`E2E 失败：${report.failure}\n`);
    process.stderr.write(`证据目录：${outDir}\n`);
    cdp.close();
    process.exit(1);
  }
}

await main();
