#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const SECRETS_DIR = path.join(PROJECT_ROOT, 'secrets');
const PRIVATE_KEY_PATH = path.join(SECRETS_DIR, 'signing_key.pem');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateRandomToken(lengthBytes = 24) {
  // 使用 base64url，避免特殊字符，便于 .env / shell
  return crypto.randomBytes(lengthBytes).toString('base64url');
}

function generateKeyAlias() {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const suffix = generateRandomToken(6); // 短一些
  return `signing-key-${y}${m}${d}${hh}${mm}${ss}-${suffix}`;
}

function generateRsaPrivateKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return privateKey;
}

function writePrivateKeyFile(privateKeyPem, destPath) {
  ensureDirSync(path.dirname(destPath));
  fs.writeFileSync(destPath, privateKeyPem, { encoding: 'utf8', flag: 'w' });
  try {
    // 非跨平台强保证，但尽量限制权限
    fs.chmodSync(destPath, 0o600);
  } catch (_) {}
}

function readEnvLines(envFilePath) {
  if (!fs.existsSync(envFilePath)) return [];
  const content = fs.readFileSync(envFilePath, 'utf8');
  return content.split(/\r?\n/);
}

function upsertEnv(envFilePath, kvPairs) {
  const lines = readEnvLines(envFilePath);
  const map = new Map();

  // 先解析现有 .env
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const k = line.slice(0, eqIndex).trim();
    const v = line.slice(eqIndex + 1);
    if (k) map.set(k, v);
  }

  // 更新/插入
  for (const [k, v] of Object.entries(kvPairs)) {
    map.set(k, v);
  }

  // 重组内容（保留简单、可读的顺序）
  const out = [];
  for (const [k, v] of map.entries()) {
    out.push(`${k}=${v}`);
  }
  fs.writeFileSync(envFilePath, out.join('\n') + '\n', 'utf8');
}

(function main() {
  console.log('🔐 生成签名相关环境变量并写入 .env');

  // 1) 生成私钥
  const privateKeyPem = generateRsaPrivateKeyPem();
  writePrivateKeyFile(privateKeyPem, PRIVATE_KEY_PATH);

  // 2) 生成变量
  const KEY_ALIAS = generateKeyAlias();
  const KEY_PASSWORD = generateRandomToken(24);
  const KEY_STORE_PASSWORD = generateRandomToken(24);

  // 将 SIGNING_KEY 设为私钥文件相对路径，避免把 PEM 直接放入 .env
  const SIGNING_KEY_REL = path.relative(PROJECT_ROOT, PRIVATE_KEY_PATH).split(path.sep).join('/');

  // 3) 写入/更新 .env
  upsertEnv(ENV_FILE, {
    KEY_ALIAS,
    KEY_PASSWORD,
    KEY_STORE_PASSWORD,
    SIGNING_KEY: SIGNING_KEY_REL
  });

  console.log('✅ 已生成/更新以下变量到 .env:');
  console.log(`- KEY_ALIAS=${KEY_ALIAS}`);
  console.log(`- KEY_PASSWORD=********`);
  console.log(`- KEY_STORE_PASSWORD=********`);
  console.log(`- SIGNING_KEY=${SIGNING_KEY_REL}`);
  console.log('\n📄 私钥文件位置:', PRIVATE_KEY_PATH);
  console.log('⚠️ 请妥善保管 secrets 目录与 .env，避免提交到版本库。');
  console.log('\n使用方法（PowerShell）:');
  console.log('  node scripts/generate-signing-env.js');
})(); 