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
      throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
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
    await cdp.evaluate(`new Promise((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", resolve, { once: true });
    })`);

    const summary = await cdp.evaluate(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const failures = [];
      const downloads = [];
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (blob) => {
        const url = originalCreateObjectURL(blob);
        window.__lastObjectUrlBlob = blob;
        return url;
      };
      HTMLAnchorElement.prototype.click = function () {
        downloads.push({
          filename: this.download,
          size: window.__lastObjectUrlBlob?.size || 0,
          type: window.__lastObjectUrlBlob?.type || "",
        });
      };

      function makeImageFile(name) {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 72;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff5964";
        ctx.fillRect(0, 0, 24, 18);
        ctx.fillStyle = "#7ed0ff";
        ctx.fillRect(24, 18, 48, 36);
        ctx.fillStyle = "#a6e3a1";
        ctx.fillRect(72, 54, 24, 18);
        const binary = atob(canvas.toDataURL("image/png").split(",")[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], name, { type: "image/png" });
      }

      async function importByDrop(name) {
        const file = makeImageFile(name);
        const dt = new DataTransfer();
        dt.items.add(file);
        const zone = document.getElementById("dropZone");
        zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
        zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
        await wait(250);
      }

      function assert(condition, message) {
        if (!condition) failures.push(message);
      }

      await importByDrop("smoke-frame.png");
      assert(document.getElementById("emptyState").classList.contains("hidden"), "drop import did not hide empty state");
      assert(!document.getElementById("exportButton").disabled, "export button remained disabled after import");

      document.getElementById("exportButton").click();
      await wait(1200);
      assert(downloads.some((item) => item.filename.endsWith("slice_manifest.json") && item.size > 20), "nine slicer JSON export missing");
      assert(downloads.filter((item) => item.filename.endsWith(".png") && item.size > 0).length >= 9, "nine slicer PNG exports missing");

      document.getElementById("zipButton").click();
      await wait(800);
      assert(downloads.some((item) => item.filename.endsWith("_nine-slicer.zip") && item.size > 100), "nine slicer ZIP export missing");

      document.querySelector('[data-tool-id="icon-sheet"]').click();
      await wait(500);
      assert(document.querySelector('[data-role="source-info"]').textContent.includes("96 x 72"), "icon sheet did not receive current image");

      document.querySelector('[data-action="center"]').click();
      document.querySelector('[data-action="rotate-90"]').click();
      document.querySelector('[data-action="flip-x"]').click();
      await wait(300);
      document.getElementById("exportButton").click();
      await wait(500);
      assert(downloads.some((item) => item.filename.endsWith("icon.png") && item.size > 100), "icon sheet single export missing");

      document.querySelector('[data-mode="grid"]').click();
      document.querySelector('[data-role="rows"]').value = "2";
      document.querySelector('[data-role="rows"]').dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-role="cols"]').value = "3";
      document.querySelector('[data-role="cols"]').dispatchEvent(new Event("input", { bubbles: true }));
      await wait(300);
      const gridPreview = document.querySelector('[data-role="grid-preview"]');
      assert(gridPreview.width > 0, "grid preview did not render");
      assert(!document.querySelector('[data-role="cell"]'), "grid selected-cell menu was not removed");
      const gridPoint = (sourceX, sourceY) => {
        const rect = gridPreview.getBoundingClientRect();
        return {
          x: rect.left + (sourceX / 96) * rect.width,
          y: rect.top + (sourceY / 72) * rect.height,
        };
      };
      const pointer = (type, point) => gridPreview.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        clientX: point.x,
        clientY: point.y,
      }));
      const cell2Center = gridPoint(48, 18);
      pointer("pointerdown", cell2Center);
      pointer("pointerup", cell2Center);
      await wait(100);
      assert(!document.querySelector('[data-role="grid-zoom-popover"]').hidden, "cell click did not select a grid cell");
      const cell2Drag = gridPoint(58, 24);
      pointer("pointerdown", cell2Center);
      pointer("pointermove", cell2Drag);
      pointer("pointerup", cell2Drag);
      document.querySelector('[data-role="cell-zoom"]').value = "1.5";
      document.querySelector('[data-role="cell-zoom"]').dispatchEvent(new Event("input", { bubbles: true }));
      await wait(300);
      pointer("pointerdown", cell2Center);
      pointer("pointerup", cell2Center);
      await wait(100);
      assert(document.querySelector('[data-role="grid-zoom-popover"]').hidden, "clicking selected grid cell did not unselect it");
      const globalStart = gridPoint(16, 18);
      const globalEnd = gridPoint(24, 20);
      pointer("pointerdown", globalStart);
      pointer("pointermove", globalEnd);
      pointer("pointerup", globalEnd);
      await wait(100);
      document.getElementById("zipButton").click();
      await wait(800);
      assert(downloads.some((item) => item.filename.endsWith("_icon-sheet.zip") && item.size > 100), "icon sheet grid ZIP export missing");

      document.getElementById("resetButton").click();
      await wait(200);
      assert(document.querySelector('[data-role="rows"]').value === "3", "reset did not restore grid rows");

      document.querySelector('[data-tool-id="logo-library"]').click();
      await wait(300);
      assert(document.querySelector('[data-role="source-info"]').textContent.includes("96 x 72"), "logo library did not receive current image");
      document.getElementById("exportButton").click();
      await wait(1400);
      assert(downloads.some((item) => item.filename.endsWith("512x512.png") && item.size > 100), "logo library PNG export missing");
      document.getElementById("zipButton").click();
      await wait(800);
      assert(downloads.some((item) => item.filename.endsWith("_logo-library.zip") && item.size > 100), "logo library ZIP export missing");

      return {
        failures,
        downloads,
        scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
      };
    })()`);

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
