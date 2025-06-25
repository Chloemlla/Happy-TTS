#!/usr/bin/env node

const http = require('http');

const PORT = process.env.PORT || 3001;
const HOST = 'localhost';

function checkOpenApiJson() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: 'http://127.0.0.1:3000/api-docs.json',
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

(async () => {
  console.log('--- 检查 /api/api-docs.json ---');
  const result = await checkOpenApiJson();
  if (result.error) {
    console.error('请求失败:', result.error.message);
    process.exit(1);
  }
  console.log('状态码:', result.status);
  console.log('Content-Type:', result.headers['content-type']);
  try {
    const json = JSON.parse(result.body);
    console.log('✅ 返回内容为有效 JSON，接口数量:', Object.keys(json.paths || {}).length);
  } catch (e) {
    if (result.body.trim().startsWith('<!DOCTYPE html')) {
      console.error('❌ 返回内容为 HTML，说明路由被覆盖。内容片段:');
      console.error(result.body.slice(0, 300));
    } else {
      console.error('❌ 返回内容不是有效 JSON。内容片段:');
      console.error(result.body.slice(0, 300));
    }
    process.exit(2);
  }
  console.log('--- 检查结束 ---');
})(); 