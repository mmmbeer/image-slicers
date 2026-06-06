import { browserSmokeScenario } from "./browser-smoke-scenario.mjs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.SMOKE_PORT || 5173);
const browserPort = Number(process.env.SMOKE_BROWSER_PORT || 9223);
const browserCandidates = [
  process.env.SMOKE_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);
function serveStatic() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(root, `.${decodeURIComponent(requestPath)}`);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
async function fetchJson(url, retries = 80) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Could not fetch ${url}`);
}
async function launchBrowser() {
  const browserPath = browserCandidates.find((candidate) => existsSync(candidate));
  if (!browserPath) {
    throw new Error("No Edge or Chrome executable found. Set SMOKE_BROWSER to a Chromium browser path.");
  }
  const { spawn } = await import("node:child_process");
  const profileRoot = existsSync("C:\\tmp") ? "C:\\tmp" : root;
  const userDataDir = path.join(profileRoot, `image-tools-smoke-${Date.now()}`);
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `http://127.0.0.1:${port}/`,
  ], { stdio: process.env.SMOKE_DEBUG ? "inherit" : "ignore", windowsHide: true });

  let exitCode = null;
  browser.once("exit", (code) => {
    exitCode = code;
  });
  await fetchJson(`http://127.0.0.1:${browserPort}/json/version`).catch((error) => {
    if (exitCode !== null) {
      throw new Error(`Browser exited before remote debugging was available. Exit code: ${exitCode}`);
    }
    throw error;
  });
  const targets = await fetchJson(`http://127.0.0.1:${browserPort}/json/list`);
  const page = targets.find((target) => (
    target.type === "page"
    && target.webSocketDebuggerUrl
    && target.url?.startsWith(`http://127.0.0.1:${port}/`)
  )) || targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("Browser launched, but no page debugging target was available.");
  }
  return { browser, webSocketDebuggerUrl: page.webSocketDebuggerUrl };
}
class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
        return;
      }
      this.events.push(data);
    });
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression, awaitPromise = true) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(detail || "Browser evaluation failed.");
    }
    return result.result.value;
  }
  close() {
    this.ws.close();
  }
}
async function runSmoke() {
  const server = await serveStatic();
  let browser;
  let cdp;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    cdp = new Cdp(launched.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await cdp.evaluate(`new Promise((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", resolve, { once: true });
    })`);

    const summary = await cdp.evaluate(`(${browserSmokeScenario.toString()})()`);

    if (summary.failures.length) {
      throw new Error(`Smoke failures:\\n${summary.failures.join("\\n")}`);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    cdp?.close();
    browser?.kill();
    await new Promise((resolve) => server.close(resolve));
  }
}

runSmoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
