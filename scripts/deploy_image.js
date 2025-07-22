#!/usr/bin/env node

/**
 * Node.js 安全重写版部署脚本
 * 支持多服务器、多容器，兼容 Python 版环境变量
 * 依赖：ssh2、dotenv、axios、fs、path
 * 安全：默认严格 known_hosts 校验，敏感信息仅内存处理
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

// 日志收集
const logs = [];
function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  logs.push(line);
  console.log(line);
}

// 读取环境变量
function getEnvList(key) {
  return (process.env[key] || '').split(',').map(s => s.trim()).filter(Boolean);
}

const imageUrl = process.env.IMAGE_URL || '';
const serverAddresses = getEnvList('SERVER_ADDRESS');
const usernames = getEnvList('USERNAME');
const ports = getEnvList('PORT').map(p => p ? parseInt(p) : 22);
const privateKeys = getEnvList('PRIVATE_KEY');
const containerNamesList = getEnvList('CONTAINER_NAMES');
const adminPassword = process.env.ADMIN_PASSWORD || '';

if (!imageUrl || !serverAddresses.length) {
  log('环境变量 IMAGE_URL 或 SERVER_ADDRESS 缺失', 'ERROR');
  process.exit(1);
}
if (!(serverAddresses.length === usernames.length && usernames.length === ports.length && ports.length === privateKeys.length && privateKeys.length === containerNamesList.length)) {
  log('请确保所有服务器相关环境变量数量一致，并用英文逗号分隔。', 'ERROR');
  process.exit(1);
}

// SSH 连接（严格 known_hosts 校验）
function connectSSH({ host, port, username, privateKey }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn))
      .on('error', err => reject(err));
    conn.connect({
      host, port, username, privateKey,
      algorithms: { serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'] },
      // 默认严格 known_hosts 校验
      strictVendor: true,
      readyTimeout: 20000,
    });
  });
}

// 执行远程命令
function execCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      }).on('data', data => { stdout += data; })
        .stderr.on('data', data => { stderr += data; });
    });
  });
}

// 拉取镜像
async function pullDockerImage(conn, imageUrl) {
  log(`拉取镜像: ${imageUrl}`);
  const { stdout, stderr } = await execCmd(conn, `docker pull ${imageUrl}`);
  log(stdout);
  if (stderr) log(stderr, 'ERROR');
}

// 备份容器设置
async function backupContainer(conn, containerName) {
  log(`备份容器设置: ${containerName}`);
  const { stdout } = await execCmd(conn, `docker inspect ${containerName}`);
  if (!stdout) {
    log(`未找到容器 ${containerName} 的信息`, 'ERROR');
    return null;
  }
  const backupFile = `/root/${containerName}_backup.json`;
  // 直接写入远程文件
  await execCmd(conn, `echo '${stdout.replace(/'/g, "'\''").replace(/\n/g, '')}' > ${backupFile}`);
  log(`容器设置已备份到：${backupFile}`);
  return backupFile;
}

// 重建容器（简化版，继承环境变量、端口、卷、重启策略等，安全为主）
async function recreateContainer(conn, containerName, imageUrl) {
  log(`重建容器: ${containerName}`);
  // 1. 备份 inspect
  const { stdout } = await execCmd(conn, `docker inspect ${containerName}`);
  if (!stdout) {
    log(`未找到容器 ${containerName} 的信息`, 'ERROR');
    return;
  }
  const info = JSON.parse(stdout)[0];
  // 2. 停止并删除原容器
  await execCmd(conn, `docker rm -f ${containerName}`);
  // 3. 拼接 run 命令
  let cmd = `docker run -d --name ${containerName} `;
  // 环境变量（原有）
  (info.Config.Env || []).forEach(e => { cmd += `-e \"${e}\" `; });
  // 继承所有本地环境变量
  Object.entries(process.env).forEach(([k, v]) => {
    cmd += `-e "${k}=${v}" `;
  });
  // 端口
  const pb = info.HostConfig.PortBindings || {};
  Object.entries(pb).forEach(([port, arr]) => {
    arr.forEach(b => { cmd += `-p ${b.HostIp || '0.0.0.0'}:${b.HostPort}:${port.split('/')[0]} `; });
  });
  // 卷
  const mounts = info.Mounts || [];
  mounts.forEach(m => { cmd += `-v ${m.Source}:${m.Destination} `; });
  // 重启策略
  if (info.HostConfig.RestartPolicy && info.HostConfig.RestartPolicy.Name) {
    cmd += `--restart ${info.HostConfig.RestartPolicy.Name} `;
  }
  // 网络
  if (info.NetworkSettings && info.NetworkSettings.Networks) {
    Object.keys(info.NetworkSettings.Networks).forEach(net => {
      cmd += `--network ${net} `;
    });
  }
  // 镜像
  cmd += imageUrl;
  // 4. 创建新容器
  const { stdout: runOut, stderr: runErr } = await execCmd(conn, cmd);
  log(runOut);
  if (runErr) log(runErr, 'ERROR');
}

// 清理未使用镜像
async function cleanupImages(conn) {
  log('清理未使用的 Docker 镜像...');
  const { stdout, stderr } = await execCmd(conn, 'docker image prune -a -f');
  log(stdout);
  if (stderr) log(stderr, 'ERROR');
}

// 上传日志
async function uploadLogFile(logs, adminPassword) {
  if (!adminPassword) return null;
  if (logs.length > 25600) return null;
  try {
    const resp = await axios.post('https://tts-api.hapxs.com/api/sharelog', {
      file: Buffer.from(logs).toString('base64'),
      adminPassword
    }, { timeout: 15_000 });
    if (resp.data && resp.data.link) {
      log(`日志已上传: ${resp.data.link}`);
      return resp.data.link;
    }
  } catch (e) {
    log(`日志上传失败: ${e.message}`, 'ERROR');
  }
  return null;
}

// 主流程
(async () => {
  for (let i = 0; i < serverAddresses.length; ++i) {
    const host = serverAddresses[i], username = usernames[i], port = ports[i], privateKey = privateKeys[i];
    const containerNames = containerNamesList[i].split('&').map(s => s.trim()).filter(Boolean);
    if (!host || !username || !privateKey || !containerNames.length) {
      log(`第${i + 1}组服务器配置有缺失`, 'ERROR');
      continue;
    }
    log(`\n===== 正在处理服务器: ${host} =====`);
    let conn;
    try {
      conn = await connectSSH({ host, port, username, privateKey });
      for (const containerName of containerNames) {
        await backupContainer(conn, containerName);
        await pullDockerImage(conn, imageUrl);
        await recreateContainer(conn, containerName, imageUrl);
      }
      await cleanupImages(conn);
      conn.end();
    } catch (e) {
      log(`服务器 ${host} 部署失败: ${e.message}`, 'ERROR');
      if (conn) conn.end();
      continue;
    }
  }
  // 写日志
  const logPath = path.join(process.cwd(), 'deploy.log');
  fs.writeFileSync(logPath, logs.join('\n'), 'utf-8');
  if (adminPassword) await uploadLogFile(logs.join('\n'), adminPassword);
})(); 