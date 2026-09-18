#!/usr/bin/env node
/**
 * BE-0b-ii 端到端浏览器验收驱动：**由真实浏览器触发自建 Host Remote**。
 *
 * 为什么需要它（BE-0b-ii 单一目标的落点）：`getStatus` 这条通路此前只有
 * 「构建通过」与「单元 mock」两类证据，而本片要消除的正是「能构建但装不起来 /
 * 调不通」。curl 打 HTTP 不算浏览器验收——本脚本用 CDP 驱动真实 Chromium，
 * 在**页面上下文内**经官方 Remote 线协议调用 `soloipsWeb.getStatus`，
 * 并同时记录：装配痕迹（页面模块图）、请求/响应（CDP Network domain）、
 * UI 呈现（截图 + DOM 文本）、刷新后复现。
 *
 * 用法：
 *   node scripts/development/verify-web-remote-e2e.mjs \
 *     --url "http://127.0.0.1:<port>/?token=<token>" \
 *     --out .artifacts/logs/be0bii-e2e
 *
 * 选项：
 *   --url <pageUrl>    必填。实例页面地址（含 token，见宿主 stdout 的 `dsh web:` 行）
 *   --out <dir>        必填。证据输出目录（截图 / report.json / DOM 文本）
 *   --port <n>         CDP 端口，默认 9223
 *   --chrome <path>    Chromium 可执行文件；默认取本机 ms-playwright 缓存
 *   --method <ns/m>    Remote 方法，默认 soloipsWeb/getStatus
 *
 * 退出状态：0 = 两次往返均 ok:true 且装配痕迹齐全；1 = 任一断言失败。
 *
 * 〔约束〕本脚本**只读**被测实例（除页面导航外不发写请求），不启停实例、
 * 不触碰用户原有实例；实例的启停由调用方按 DEVENV-03 负责。
 * 〔边界〕通过只代表「该 Remote 方法经真实浏览器调用成功」；不代表业务闭环、
 * 权限、配额或任何 S0 业务面验收。
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  const options = {
    url: null,
    out: null,
    port: 9223,
    chrome: null,
    method: "soloipsWeb/getStatus",
  };
  for (let index = 0; index < argv.length; index++) {
    // pnpm 会把分隔符 `--` 原样传下来，跳过它。
    if (argv[index] === "--") continue;
    if (argv[index] === "--url") options.url = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else if (argv[index] === "--chrome") options.chrome = argv[++index];
    else if (argv[index] === "--method") options.method = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write(
        "usage: verify-web-remote-e2e.mjs --url <pageUrl> --out <dir> [--port 9223] [--chrome <path>] [--method <ns/m>]\n",
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

/** 解析 Chromium 可执行文件：显式参数优先，其次本机常见缓存位置。 */
function resolveChrome(explicit) {
  const candidates = explicit === null ? DEFAULT_CHROME_CANDIDATES : [explicit];
  for (const candidate of candidates) {
    if (candidate.length > 0 && existsSync(candidate)) return candidate;
  }
  fail(
    "找不到 Chromium 可执行文件。用 --chrome <path> 显式指定（本机 ms-playwright 缓存与 " +
      "Google Chrome 默认路径均已尝试）。",
  );
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

/** 启动一个 headless Chromium 并等 CDP 端点就绪。 */
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

/** 最小 CDP 客户端：够用即可，不引入额外依赖。 */
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

/**
 * 等页面装配就绪：模块图已建、`soloips-web` 行在图内、DOM 已渲染。
 *
 * 〔判据〕只认页面内可观察的痕迹，不认「进程起来了」：`__ModuleLoader__`
 * 进入 live 模式说明模块系统已 boot；`__DSH_BOOT__.entries` 含 `soloips-web`
 * 说明 client-modules 扫描到了本包；DOM 有文本说明官方 UI 真的渲染了。
 */
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
          bootType: typeof boot,
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

/** 在页面上下文内发起一次 Remote 往返，返回请求体与响应体原文。 */
async function callRemote(cdp, method, note) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const rpcId = 'be0bii-' + Math.random().toString(36).slice(2);
      const url = location.origin + '/api/' + ${JSON.stringify(method)};
      const body = { type: 'client-request', rpcId, method: ${JSON.stringify(method)},
                     payload: { args: { input: { note: ${JSON.stringify(note)} } } } };
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
function remoteNetwork(events, method) {
  const namespace = method.split("/")[0] ?? method;
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
    .filter((row) => row.url.includes(namespace));
}

/** 断言一次往返成功，失败即抛（调用方决定是否继续）。 */
function assertRemoteOk(label, call) {
  if (call.status !== 200) throw new Error(`${label}: HTTP ${String(call.status)}`);
  const parsed = JSON.parse(call.responseText);
  if (parsed.result?.ok !== true) {
    throw new Error(`${label}: 响应 result.ok 不是 true —— ${call.responseText.slice(0, 400)}`);
  }
  return parsed.result.value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.url === null || options.out === null) {
    fail("缺少 --url 或 --out。见 --help。");
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

  const report = { url: options.url, method: options.method, passes: [] };

  // Pass 1：首次加载
  cdp.state.events = [];
  cdp.state.consoleMessages = [];
  await cdp.send("Page.navigate", { url: options.url });
  const assembly = await waitForAssembly(cdp);
  const firstCall = await callRemote(cdp, options.method, "BE-0b-ii pass1 first load");
  const firstValue = assertRemoteOk("pass1", firstCall);
  report.assembly = assembly;
  report.passes.push({ name: "pass1-first-load", call: firstCall, value: firstValue });
  report.pass1Network = remoteNetwork(cdp.state.events, options.method);
  report.pass1Console = [...cdp.state.consoleMessages];
  const firstShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, "pass1-page.png"), Buffer.from(firstShot.data, "base64"));

  // Pass 2：刷新后复现
  cdp.state.events = [];
  cdp.state.consoleMessages = [];
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForAssembly(cdp);
  const secondCall = await callRemote(cdp, options.method, "BE-0b-ii pass2 after reload");
  const secondValue = assertRemoteOk("pass2", secondCall);
  report.passes.push({ name: "pass2-after-reload", call: secondCall, value: secondValue });
  report.pass2Network = remoteNetwork(cdp.state.events, options.method);
  report.pass2Console = [...cdp.state.consoleMessages];

  const dom = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "document.body.innerText",
  });
  report.domText = String(dom.result.value ?? "");
  writeFileSync(join(outDir, "dom-text.txt"), report.domText);
  const secondShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, "pass2-page.png"), Buffer.from(secondShot.data, "base64"));

  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(`装配痕迹：entryCount=${String(assembly.entryCount)} `);
  process.stdout.write(`soloipsRow.rev=${String(assembly.soloipsRow.rev)}\n`);
  process.stdout.write(`pass1：${JSON.stringify(firstValue)}\n`);
  process.stdout.write(`pass2：${JSON.stringify(secondValue)}\n`);
  process.stdout.write(
    `网络记录：pass1=${String(report.pass1Network.length)} 条，pass2=${String(report.pass2Network.length)} 条\n`,
  );
  process.stdout.write(`证据目录：${outDir}\n`);
  process.stdout.write(
    "\n证据边界：只代表该 Remote 方法经真实浏览器调用成功；不代表业务闭环、\n" +
      "权限/配额或任何 S0 业务面验收。\n",
  );
  cdp.close();
  // 〔约束〕显式退出：CDP 的 WebSocket 与 detached Chromium 句柄会让事件循环
  // 保持存活，进程不主动退出会让调用方（脚本 / CI）挂住并最终被超时杀掉——
  // 那会把「验证通过」误报成失败退出码。收尾工作已全部落盘，此处直接退出。
  process.exit(0);
}

await main();
