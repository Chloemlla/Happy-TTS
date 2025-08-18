#!/usr/bin/env node
/**
 * ADB batch tools (export, uninstall, install) implemented in Node.js
 *
 * Usage (from repo root or scripts/):
 *   node scripts/adb-tools.js export
 *   node scripts/adb-tools.js uninstall [--user=0]
 *   node scripts/adb-tools.js install [--dir=packages]
 *
 * Files/dirs used under scripts/:
 *   - scripts/list_packages.txt            (output of export)
 *   - scripts/uninstall_packages.txt       (input list for uninstall)
 *   - scripts/packages/                    (folder containing .apk files for install)
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const SCRIPTS_DIR = __dirname;
const LIST_TXT = path.join(SCRIPTS_DIR, 'list_packages.txt');
const UNINSTALL_TXT = path.join(SCRIPTS_DIR, 'uninstall_packages.txt');
const PACKAGES_DIR = path.join(SCRIPTS_DIR, 'packages');

function logInfo(msg) {
  console.log(msg);
}
function logStep(title) {
  console.log(`\n==== ${title} ====`);
}
function logError(err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : err}`);
}

function runAdb(args, options = {}) {
  return new Promise((resolve, reject) => {
    const adb = options.adbPath || 'adb';
    const child = spawn(adb, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// Try to resolve human-readable application label for a given package
// Uses: `adb shell pm dump <package>` and parses lines like:
//   application-label-zh-CN: 应用名
//   application-label: App Name
async function getAppLabel(pkg) {
  try {
    const { code, stdout, stderr } = await runAdb(['shell', 'pm', 'dump', pkg]);
    if (code !== 0) return '';
    const lines = stdout.split(/\r?\n/);
    // Prefer Chinese labels if present
    const zhCN = lines.find((l) => /application-label-zh-CN:\s*/.test(l));
    if (zhCN) return zhCN.split(':').slice(1).join(':').trim();
    const zh = lines.find((l) => /application-label-zh:\s*/.test(l));
    if (zh) return zh.split(':').slice(1).join(':').trim();
    const any = lines.find((l) => /application-label:\s*/.test(l));
    if (any) return any.split(':').slice(1).join(':').trim();
    return '';
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});
}

async function exportPackages() {
  logStep('导出已安装的应用包名及应用名（过滤包含 vivo 与 com.android 的包名）');
  logInfo('正在执行: adb shell pm list packages');
  const { code, stdout, stderr } = await runAdb(['shell', 'pm', 'list', 'packages']);
  if (code !== 0) {
    throw new Error(`adb shell 失败，退出码 ${code}，详细: ${stderr.trim()}`);
  }

  const lines = stdout.split(/\r?\n/).filter(Boolean);
  // Typical output line: "package:com.example.app"
  let pkgs = lines
    .map((line) => {
      const idx = line.indexOf(':');
      return idx >= 0 ? line.slice(idx + 1).trim() : line.trim();
    })
    .filter(Boolean)
    .sort();

  // Filter out packages that contain "vivo" or "com.android" (case-insensitive)
  pkgs = pkgs.filter((p) => !/vivo/i.test(p) && !/com\.android/i.test(p));

  const linesOut = [];
  for (const pkg of pkgs) {
    const name = await getAppLabel(pkg);
    // Write as: packageName\tAppName (AppName may be empty if not resolved)
    linesOut.push(`${pkg}\t${name || ''}`);
  }

  await fsp.writeFile(LIST_TXT, linesOut.join('\n'), 'utf8');
  logInfo(`已成功导出 ${pkgs.length} 个应用（已过滤含 vivo 与 com.android 的包名）到: ${path.relative(process.cwd(), LIST_TXT)}`);
}

function sanitizePackageLine(s) {
  if (!s) return '';
  // remove comments and trim
  const noComment = s.replace(/#.*/, '').replace(/\/\/.*/, '');
  return noComment.trim();
}

async function uninstallPackages(opts) {
  const user = opts.user === '0' || opts.user === 0 ? '0' : null;
  logStep(`批量卸载应用${user ? '（--user 0）' : ''}`);

  let content;
  try {
    content = await fsp.readFile(UNINSTALL_TXT, 'utf8');
  } catch (e) {
    throw new Error(`无法打开文件: ${path.relative(process.cwd(), UNINSTALL_TXT)}\n请在该文件中按行填写需要卸载的包名。`);
  }

  const lines = content.split(/\r?\n/);
  const pkgs = lines
    .map(sanitizePackageLine)
    .filter(Boolean);

  if (pkgs.length === 0) {
    logInfo('未在 uninstall_packages.txt 中找到任何包名。');
    return;
  }

  let success = 0;
  let failed = 0;
  for (const pkg of pkgs) {
    logInfo(`\n------ 正在卸载 ${pkg} ------`);
    const args = ['uninstall'];
    if (user) args.push('--user', user);
    args.push(pkg);
    const { code, stdout, stderr } = await runAdb(args);
    // adb uninstall outputs 'Success' or 'Failure [REASON]'
    const out = (stdout + stderr).trim();
    if (code === 0 && /Success/i.test(out)) {
      logInfo(`卸载成功: ${pkg}`);
      success++;
    } else {
      logError(`卸载失败: ${pkg} -> ${out || `exit ${code}`}`);
      failed++;
    }
  }
  logStep(`完成: 成功 ${success}，失败 ${failed}`);
}

async function findApkFiles(dir) {
  await ensureDir(dir);
  const names = await fsp.readdir(dir).catch(() => []);
  return names
    .filter((n) => n.toLowerCase().endsWith('.apk'))
    .map((n) => path.join(dir, n))
    .sort();
}

async function installPackages(opts) {
  const baseDir = opts.dir ? path.resolve(process.cwd(), opts.dir) : PACKAGES_DIR;
  logStep(`批量安装 APK（目录: ${baseDir}）`);

  const files = await findApkFiles(baseDir);
  if (files.length === 0) {
    logInfo('未在目录中找到任何 .apk 文件。');
    logInfo(`请将 APK 放入: ${baseDir}`);
    return;
  }

  let success = 0;
  let failed = 0;
  for (const file of files) {
    const display = path.basename(file);
    logInfo(`\n------ 正在安装 ${display} ------`);
    // adb install -r "path"
    const { code, stdout, stderr } = await runAdb(['install', '-r', file]);
    const out = (stdout + stderr).trim();
    if (code === 0 && /Success/i.test(out)) {
      logInfo(`安装成功: ${display}`);
      success++;
    } else {
      logError(`安装失败: ${display} -> ${out || `exit ${code}`}`);
      failed++;
    }
  }
  logStep(`完成: 成功 ${success}，失败 ${failed}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  if (!cmd || ['export', 'uninstall', 'install'].indexOf(cmd) === -1) {
    console.log('用法:');
    console.log('  node scripts/adb-tools.js export');
    console.log('  node scripts/adb-tools.js uninstall [--user=0]');
    console.log('  node scripts/adb-tools.js install [--dir=packages]');
    process.exitCode = 1;
    return;
  }

  try {
    if (cmd === 'export') await exportPackages();
    else if (cmd === 'uninstall') await uninstallPackages(args);
    else if (cmd === 'install') await installPackages(args);
  } catch (err) {
    logError(err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
