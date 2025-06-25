#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const HOST = 'localhost';
const LOG_PATH = path.join(process.cwd(), 'logs', 'combined.log');

function checkApiDocs() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/api-docs',
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', (err) => {
      resolve({ error: err });
    });
    req.end();
  });
}

function checkLogFile() {
  if (!fs.existsSync(LOG_PATH)) {
    return '日志文件不存在: ' + LOG_PATH;
  }
  const content = fs.readFileSync(LOG_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const lastLines = lines.slice(-20).join('\n');
  return lastLines;
}

function checkPortListening() {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = net.createConnection(PORT, HOST);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

(async () => {
  console.log('--- Synapse /api-docs 自动化排查 ---');
  console.log('1. 检查端口监听...');
  const portOk = await checkPortListening();
  if (!portOk) {
    console.error(`后端端口 ${PORT} 未监听。请确认服务已启动。`);
    process.exit(1);
  } else {
    console.log(`端口 ${PORT} 正在监听。`);
  }

  console.log('2. 检查 /api-docs 路由...');
  const apiDocs = await checkApiDocs();
  if (apiDocs.error) {
    console.error('请求 /api-docs 失败:', apiDocs.error.message);
  } else {
    console.log(`/api-docs 状态码: ${apiDocs.status}`);
    if (apiDocs.status === 200 && apiDocs.body.includes('SwaggerUIBundle')) {
      console.log('/api-docs 页面正常返回 Swagger UI。');
    } else {
      console.warn('/api-docs 返回异常，响应内容片段:');
      console.warn(apiDocs.body.slice(0, 300));
    }
  }

  console.log('3. 检查后端日志输出...');
  const logContent = checkLogFile();
  if (typeof logContent === 'string') {
    if (logContent.includes('/api-docs')) {
      console.log('日志中已记录 /api-docs 请求。');
    } else {
      console.warn('日志中未发现 /api-docs 相关请求。最近日志片段:');
      console.warn(logContent);
    }
  } else {
    console.warn('日志文件不存在或无法读取。');
  }

  console.log('--- 排查结束 ---');
})(); 