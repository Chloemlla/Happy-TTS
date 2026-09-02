#!/usr/bin/env node

// 生产镜像跑的是混淆产物（Dockerfile: COPY --from=backend-builder /app/dist-obfuscated ./dist），
// 而混淆破坏、非 JS 资源漏搬、以及只在 NODE_ENV=production 才触发的启动断言，都只在运行时暴露：
// tsc / type-check / 构建全绿照样能推出一个起不来的镜像。这里以生产配置真正启动一次混淆产物。
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const distDir = path.join(root, "dist");
const obfuscatedDir = path.join(root, "dist-obfuscated");
const entryPoint = path.join(obfuscatedDir, "app.js");
const port = Number(process.env.SMOKE_PORT || 3100);
const bootTimeoutMs = Number(process.env.SMOKE_BOOT_TIMEOUT_MS || 120_000);
const shutdownTimeoutMs = Number(process.env.SMOKE_SHUTDOWN_TIMEOUT_MS || 20_000);
const mongoUri = process.env.SMOKE_MONGO_URI || process.env.MONGO_URI || "";
// 应用 listen 在 "::"（双栈）。127.0.0.1 通常经 IPv4-mapped 可达，bindv6only 的机器上则只有 ::1 通。
const probeHosts = (process.env.SMOKE_HOSTS || "127.0.0.1,[::1]").split(",").map((host) => host.trim());
let baseUrl = `http://${probeHosts[0]}:${port}`;
const probeHeaders = { "user-agent": "synapse-obfuscated-smoke/1.0", accept: "application/json" };

let child = null;
let output = "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tail = () => (output ? `--- last artifact output ---\n${output.slice(-6000)}` : "--- artifact produced no output ---");

function die(message, details = []) {
  console.error(`Obfuscated artifact smoke failed: ${message}`);
  for (const detail of details.filter(Boolean)) console.error(detail);
  if (child && child.exitCode === null) child.kill("SIGKILL");
  process.exit(1);
}

function listFiles(directory, relative = "") {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) return listFiles(directory, next);
    return entry.isFile() ? [next] : [];
  });
}

function verifyArtifactLayout() {
  for (const dir of [distDir, obfuscatedDir]) {
    if (!fs.existsSync(dir)) die(`missing ${path.relative(root, dir)} — run \`pnpm run build:backend\` first`);
  }
  if (!fs.existsSync(entryPoint)) die(`missing entry point ${path.relative(root, entryPoint)}`);

  // 混淆产物与 dist 逐字节相同 = 混淆没跑，等于在冒烟一份未混淆的代码。
  if (fs.readFileSync(entryPoint).equals(fs.readFileSync(path.join(distDir, "app.js")))) {
    die("dist-obfuscated/app.js is byte-identical to dist/app.js — the obfuscation step did not run");
  }
  if (!/_0x[0-9a-f]{4,}/.test(fs.readFileSync(entryPoint, "utf8"))) {
    console.warn("Warning: no hexadecimal identifiers found; obfuscator identifier settings may have changed.");
  }

  // javascript-obfuscator 只重写 .js，非 JS 资源必须由 copy-obfuscated-payload.js 补齐。
  const missing = listFiles(distDir).filter((file) => !fs.existsSync(path.join(obfuscatedDir, file)));
  if (missing.length > 0) {
    die(`${missing.length} file(s) present in dist/ are absent from dist-obfuscated/`, [
      ...missing.slice(0, 20).map((file) => `  - ${file.replace(/\\/g, "/")}`),
      missing.length > 20 ? `  ... and ${missing.length - 20} more` : "",
    ]);
  }
}

function startArtifact() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    USER_STORAGE_MODE: "mongo",
    MONGO_URI: mongoUri,
    MONGO_DB: process.env.SMOKE_MONGO_DB || "synapse_smoke",
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    ADMIN_PASSWORD: `smoke-${crypto.randomBytes(12).toString("hex")}`,
  };
  // 继承下来的可选凭据会让冒烟不确定（弱 GENERATION_CODE 直接让 config 解析失败）。
  delete env.MONGODB_URI;
  delete env.GENERATION_CODE;

  const spawned = spawn(process.execPath, [path.relative(root, entryPoint)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawned.on("error", (error) => die(`failed to spawn the artifact: ${error.message}`));
  for (const stream of [spawned.stdout, spawned.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-20000);
    });
  }
  return spawned;
}

async function waitForHealth() {
  const deadline = Date.now() + bootTimeoutMs;
  let lastSeen = "no response yet";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) {
      die(`artifact exited during startup (code ${child.exitCode}, signal ${child.signalCode})`, [tail()]);
    }
    for (const host of probeHosts) {
      const candidate = `http://${host}:${port}`;
      try {
        const response = await fetch(`${candidate}/health`, { headers: probeHeaders, signal: AbortSignal.timeout(5000) });
        const body = await response.text();
        if (response.status === 200) {
          const payload = JSON.parse(body);
          if (payload.status === "ok" && payload.mongo === "connected") {
            baseUrl = candidate;
            return;
          }
          lastSeen = `${candidate} answered HTTP 200 with ${body.slice(0, 200)}`;
        } else {
          lastSeen = `${candidate} answered HTTP ${response.status} ${body.slice(0, 200)}`;
        }
      } catch (error) {
        lastSeen = `${candidate}: ${error.message}`;
      }
    }
    await sleep(1000);
  }
  die(`/health never reported ok within ${bootTimeoutMs} ms (last: ${lastSeen})`, [tail()]);
}

async function verifySpecRouteMounted() {
  // 生产模式下 /api/openapi.json 由 apiDocsAuthGate 挡住（401/403 属预期）；这里断言的是
  // 「路由挂上了且进程没崩」——404 说明注册表漏挂，5xx 说明处理链在混淆后炸了。
  const response = await fetch(`${baseUrl}/api/openapi.json`, {
    headers: probeHeaders,
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404 || response.status >= 500) {
    die(`/api/openapi.json returned HTTP ${response.status}`, [(await response.text()).slice(0, 400), tail()]);
  }
  return response.status;
}

async function shutdownGracefully() {
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), shutdownTimeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.kill("SIGTERM");
  });
  if (result.timedOut) die(`artifact ignored SIGTERM for ${shutdownTimeoutMs} ms`, [tail()]);
  if (result.code !== 0) die(`artifact exited with code ${result.code} (signal ${result.signal}) after SIGTERM`, [tail()]);
}

async function main() {
  if (!mongoUri) die("SMOKE_MONGO_URI (or MONGO_URI) must point at a reachable MongoDB");
  verifyArtifactLayout();
  child = startArtifact();
  await waitForHealth();
  const specStatus = await verifySpecRouteMounted();
  await shutdownGracefully();
  console.log(`Obfuscated artifact smoke passed (production boot, /health ok, /api/openapi.json HTTP ${specStatus}, clean SIGTERM).`);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error), [tail()]));
