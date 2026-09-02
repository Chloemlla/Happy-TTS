#!/usr/bin/env node

// javascript-obfuscator 只重写 .js，dist 下的非 JS 运行时资源不会进入 dist-obfuscated。
// 生产镜像跑的正是 dist-obfuscated（Dockerfile: COPY dist-obfuscated ./dist），所以缺文件
// 只在运行时暴露：cdictDonationService 按 __dirname/../assets/donation 解析内置收款码图片。
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "dist");
const targetDir = path.join(root, "dist-obfuscated");

for (const dir of [sourceDir, targetDir]) {
  if (!fs.existsSync(dir)) {
    console.error(`Missing build output: ${path.relative(root, dir)}`);
    console.error("Run the backend build (tsc + obfuscate) before syncing the payload.");
    process.exit(1);
  }
}

let copied = 0;

const syncDirectory = (relative) => {
  for (const entry of fs.readdirSync(path.join(sourceDir, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(next);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith(".js")) continue;
    const destination = path.join(targetDir, next);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceDir, next), destination);
    copied += 1;
  }
};

syncDirectory("");

console.log(`Obfuscated payload synced: ${copied} non-JS file(s) copied into dist-obfuscated.`);
