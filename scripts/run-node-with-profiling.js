"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const args = process.argv.slice(2);
const profilesDir = path.join(process.cwd(), "profiles");
const target = path.join(process.cwd(), "dist", "app.js");

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

const nodeArgs = [];
const passthroughArgs = [];

for (const arg of args) {
  if (arg === "--cpu") {
    nodeArgs.push("--cpu-prof", `--cpu-prof-dir=${profilesDir}`);
  } else if (arg === "--heap") {
    nodeArgs.push("--heap-prof", `--heap-prof-dir=${profilesDir}`);
  } else if (arg === "--inspect") {
    nodeArgs.push("--inspect=0.0.0.0:9229");
  } else if (arg === "--file-storage") {
    process.env.USER_STORAGE_MODE = "file";
  } else {
    passthroughArgs.push(arg);
  }
}

if (!fs.existsSync(target)) {
  console.error("[profiling] dist/app.js not found. Run `npm run build:backend` first.");
  process.exit(1);
}

const child = spawn(process.execPath, [...nodeArgs, target, ...passthroughArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    PROFILING_ENABLED: process.env.PROFILING_ENABLED || "true",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
