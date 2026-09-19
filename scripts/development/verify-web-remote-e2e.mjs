#!/usr/bin/env node
/**
 * BE-0b-ii 端到端浏览器验收驱动：**由真实浏览器触发自建 Host Remote**。
 *
 * 为什么需要它（BE-0b-ii 单一目标的落点）：`getStatus` 这条通路此前只有
 * 「构建通过」与「单元 mock」两类证据，而本片要消除的正是「能构建但装不起来 /
 * 调不通」。curl 打 HTTP 不算浏览器验收——本脚本用 CDP 驱动真实 Chromium，
 * 在**页面上下文内**经官方 Remote 线协议调用 `soloips.getStatus`，
 * 并同时记录：装配痕迹（页面模块图）、请求/响应（CDP Network domain）、
 * UI 呈现（截图 + DOM 文本）、刷新后复现。
 *
 * 用法：
 *   node scripts/development/verify-web-remote-e2e.mjs \
 *     --url "http://127.0.0.1:<port>/?token=<token>" \
 *     --out .artifacts/logs/be0bii-e2e \
 *     --candidate-client <repo>/packages/web/lib/client.js
 *
 * 选项：
 *   --url <pageUrl>         必填。实例页面地址（含 token，见宿主 stdout 的 `dsh web:` 行）
 *   --out <dir>             必填。证据输出目录（截图 / report.json / DOM 文本）
 *   --candidate-client <p>  必填。候选 `client.js` 绝对路径；用于**产物身份核对**
 *   --port <n>              CDP 端口，默认 9223
 *   --chrome <path>         Chromium 可执行文件；默认取本机 ms-playwright 缓存
 *   --method <ns/m>         Remote 方法，默认 soloips/getStatus
 *
 * 〔BE-6a：默认方法随 wire namespace 变更〕namespace 由服务键 `soloipsWeb`
 * 显式覆盖为 `soloips`（`data-contract.md` §2.5 的调用面矩阵逐行写作
 * `ctx.remote.soloips.<method>`）。端点 id 因此是 `soloips/getStatus`——本默认值
 * 必须与生成物一致，否则脚本会打到不存在的路由。该一致性由
 * `packages/web/tests/package-contract.spec.ts` 与产物套件分别钉住。
 *
 * 退出状态：0 = 两次往返均 ok:true、装配痕迹齐全、且加载的 bundle 含本次候选字节；
 *          1 = 任一断言失败。
 *
 * ── 产出的正向激活证据（供 check-delivery-load 消费）─────────────────────────
 * 本脚本另外写出 `activation-evidence.log`：它把「本次启动真的完成了该调用」写成
 * **带调用标识与产物摘要**的行，格式与 `check-delivery-load.mjs` 的
 * `--expect-invocation` / `--artifact-digest` 判据对接。这是 F-04 要求的
 * 「正向激活确认绑定本次启动 + 本次候选产物身份」的证据载体：
 *     dsh-activation: <method> ok sha256=<candidate sha256> …
 * 〔为什么由本脚本产出〕它是**唯一**知道「浏览器真的调用了该方法」的地方；
 * 宿主成功路径不写 entry 级日志，因此正向证据只能由调用方采集（见该门禁注释）。
 *
 * 〔约束〕本脚本**只读**被测实例（除页面导航外不发写请求），不启停实例、
 * 不触碰用户原有实例；实例的启停由调用方按 DEVENV-03 负责。
 * 〔边界〕通过只代表「该 Remote 方法经真实浏览器调用成功，且加载的 bundle 是本次
 * 候选」；不代表业务闭环、权限、配额或任何 S0 业务面验收。
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
  const options = {
    url: null,
    out: null,
    port: 9223,
    chrome: null,
    method: "soloips/getStatus",
    candidateClient: null,
  };
  for (let index = 0; index < argv.length; index++) {
    // pnpm 会把分隔符 `--` 原样传下来，跳过它。
    if (argv[index] === "--") continue;
    if (argv[index] === "--url") options.url = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
    else if (argv[index] === "--chrome") options.chrome = argv[++index];
    else if (argv[index] === "--method") options.method = argv[++index];
    else if (argv[index] === "--candidate-client") options.candidateClient = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write(
        "usage: verify-web-remote-e2e.mjs --url <pageUrl> --out <dir>\n" +
          "         [--port 9223] [--chrome <path>] [--method <ns/m>]\n" +
          "         [--candidate-client <abs path to lib/client.js>]\n" +
          "\n" +
          "  --candidate-client  候选产物路径。给了它才做**产物身份核对**：\n" +
          "                      断言页面实际加载的 bundle 含本次候选的字节。\n" +
          "                      不核对时「浏览器调用成功」无法排除「跑的是旧 lib」。\n",
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

/**
 * 核对页面**实际加载**的 `soloips-web` bundle 就是 `--candidate-client` 指向的候选。
 *
 * ── 为什么必须做（BE-0b-ii / C-1）───────────────────────────────────────────
 * 「浏览器调用成功」本身**不能**排除「跑的是旧 lib」：worktree 里换过产物、
 * 而实例指向的可能是别处的副本，或宿主缓存了上一版。因此身份必须由**字节**证明，
 * 而不是由「路径看起来对」证明（项目红线第 5 条：文件存在 + 名字匹配不构成确认）。
 *
 * ── 判据：从页面模块图取**实际 URL**，回源比对字节 ─────────────────────────
 *  1. 在页面里读 `__DSH_BOOT__.entries` 的 `soloips-web` 行，取其 `url`
 *     （含 rev 的组合路由地址）——这是浏览器**真正会去取**的地址；
 *  2. 用 `fetch` 取回该 URL 的字节（在页面上下文内，带页面凭据）；
 *  3. 复刻宿主 `client-modules` 的 `prepareSource`（剥 `//# sourceMappingURL=`
 *     trailer、保证尾换行）后，断言**候选字节被完整包含**在响应体里。
 *     组合路由会把多个 bundle 串接（`source;\n`），故用包含关系而不是相等；
 *     而包含关系足以证伪「跑的是别的 bundle」——那会连一行都对不上。
 *
 * 〔为什么不比对整串 SHA〕组合路由会给每段追加 `//# sourceMappingURL=<绝对 URL>`
 * 与 `;\n` 分隔符，逐字节重构需要复刻宿主的多个私有步骤（实测容易差一个换行，
 * 得到假阴性）。包含关系是**更弱但更稳**的判据，且对本项要防的失效模式充分。
 *
 * @param {object} cdp - CDP 连接。
 * @param {string} candidatePath - 候选 `client.js` 的绝对路径。
 * @returns {Promise<{url: string, servedBytes: number, candidateBytes: number, candidateSha256: string, embedded: boolean}>}
 *   身份证据（写入 report，供人工复核）。
 */
async function verifyArtifactIdentity(cdp, candidatePath) {
  const candidate = readFileSync(candidatePath);
  const candidateSha256 = createHash("sha256").update(candidate).digest("hex");
  // 复刻 prepareSource：剥掉 sourceMappingURL trailer，并保证尾换行。
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
        `  候选：${candidatePath}\n` +
        `  sha256=${candidateSha256}\n` +
        `  实际 URL：${payload.url}\n` +
        "  这表示实例加载的是别的产物（旧 lib / 另一份副本 / 宿主缓存），本次调用结果不能算作候选的证据。",
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
  // 〔顺序契约〕身份核对必须在**取调用结果之前**：若加载的不是本次候选，那么
  // 后面那次「调用成功」证明的是别的产物，必须立刻失败而不是先给出一份看似
  // 成功的报告。
  if (options.candidateClient === null) {
    fail(
      "缺少 --candidate-client：无法核对「页面实际加载的是本次候选产物」。\n" +
        "  不核对身份时，「浏览器调用成功」无法排除「跑的是旧 lib」——那正是本脚本\n" +
        "  要防的自欺。请传入候选 client.js 的绝对路径。",
    );
  }
  if (!existsSync(options.candidateClient)) {
    fail(`--candidate-client 指向的文件不存在：${options.candidateClient}`);
  }
  const identity = await verifyArtifactIdentity(cdp, options.candidateClient);
  report.artifactIdentity = identity;
  const firstCall = await callRemote(cdp, options.method, "BE-0b-ii pass1 first load");
  const firstValue = assertRemoteOk("pass1", firstCall);
  report.assembly = assembly;
  report.passes.push({ name: "pass1-first-load", call: firstCall, value: firstValue });
  report.pass1Network = remoteNetwork(cdp.state.events, options.method);
  report.pass1Console = [...cdp.state.consoleMessages];
  const firstShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, "pass1-page.png"), Buffer.from(firstShot.data, "base64"));

  // Pass 2：刷新后复现。身份在刷新后**再核一次**：刷新可能换 rev（宿主 HMR /
  // 重新扫描），只核一次无法排除「首次对、刷新后换了产物」。
  cdp.state.events = [];
  cdp.state.consoleMessages = [];
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForAssembly(cdp);
  report.artifactIdentityAfterReload = await verifyArtifactIdentity(cdp, options.candidateClient);
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

  // ── 正向激活证据（供 check-delivery-load 消费；见文件头注释）──────────────
  // 〔为什么必须落盘而不是只在 stdout 打印〕证据要被**另一个步骤**核对；stdout
  // 会随调用方消失，文件才是可复核的载体。行格式固定，字段顺序固定。
  const evidenceLines = [
    `# 本次启动：${report.artifactIdentity.url}`,
    `# 实例页面：${options.url.replace(/token=[^&]*/, "token=<REDACTED>")}`,
    `# 采集时刻：${new Date().toISOString()}`,
  ];
  for (const pass of report.passes) {
    evidenceLines.push(
      `dsh-activation: ${options.method} ok sha256=${identity.candidateSha256} ` +
        `pass=${pass.name} status=${String(pass.call.status)} ` +
        `echo=${JSON.stringify(pass.value?.echo ?? null)}`,
    );
  }
  evidenceLines.push(
    `dsh-activation: ${options.method} identity-verified sha256=${identity.candidateSha256} ` +
      `url=${report.artifactIdentity.url} reload-url=${report.artifactIdentityAfterReload.url}`,
  );
  const evidencePath = join(outDir, "activation-evidence.log");
  writeFileSync(evidencePath, `${evidenceLines.join("\n")}\n`);

  process.stdout.write(`装配痕迹：entryCount=${String(assembly.entryCount)} `);
  process.stdout.write(`soloipsRow.rev=${String(assembly.soloipsRow.rev)}\n`);
  process.stdout.write(
    `产物身份：候选 sha256=${identity.candidateSha256}\n` +
      `          加载 URL=${identity.url}\n` +
      `          候选字节被完整包含=${String(identity.embedded)}（候选 ${String(identity.candidateBytes)} B / 响应 ${String(identity.servedBytes)} B）\n` +
      `          刷新后复核：${String(report.artifactIdentityAfterReload.url)}\n`,
  );
  process.stdout.write(`pass1：${JSON.stringify(firstValue)}\n`);
  process.stdout.write(`pass2：${JSON.stringify(secondValue)}\n`);
  process.stdout.write(
    `网络记录：pass1=${String(report.pass1Network.length)} 条，pass2=${String(report.pass2Network.length)} 条\n`,
  );
  process.stdout.write(`证据目录：${outDir}\n`);
  process.stdout.write(`正向激活证据：${evidencePath}\n`);
  process.stdout.write(
    "  下一步（可选）：把该文件交给 check-delivery-load 做正向激活确认：\n" +
      `    node scripts/development/check-delivery-load.mjs --activation-log ${evidencePath} ` +
      `--expect-invocation "${options.method}" --artifact-digest ${identity.candidateSha256}\n`,
  );
  process.stdout.write(
    "\n证据边界：只代表该 Remote 方法经真实浏览器调用成功，且加载的 bundle 含本次\n" +
      "候选字节；不代表业务闭环、权限/配额或任何 S0 业务面验收。\n",
  );
  cdp.close();
  // 〔约束〕显式退出：CDP 的 WebSocket 与 detached Chromium 句柄会让事件循环
  // 保持存活，进程不主动退出会让调用方（脚本 / CI）挂住并最终被超时杀掉——
  // 那会把「验证通过」误报成失败退出码。收尾工作已全部落盘，此处直接退出。
  process.exit(0);
}

await main();
